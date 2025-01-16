let currentTabId = null;
let extensionStartTime = Date.now();
let performanceData = {};
let updateInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
    setupEventListeners();
    updateInterval = setInterval(updateDynamicElements, 1000);
});

window.addEventListener('beforeunload', () => {
    if (updateInterval) clearInterval(updateInterval);
});

async function initializePopup() {
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabId = currentTab.id;
        
        const allTabs = await chrome.tabs.query({});
        
        const result = await chrome.storage.local.get(['alwaysActiveTabs', 'extensionSettings']);
        const alwaysActiveTabs = result.alwaysActiveTabs || {};
        const settings = result.extensionSettings || getDefaultSettings();
        
        await updateCurrentTabInfo(currentTab);
        updateStats(alwaysActiveTabs, allTabs);
        await updateActiveTabsList(alwaysActiveTabs, allTabs);
        updateToggleButton(currentTab.id, alwaysActiveTabs);
        updateGlobalStatus(alwaysActiveTabs);
        
    } catch (error) {
        console.error('Failed to initialize popup:', error);
        showNotification('Failed to load extension data', 'error');
    }
}

async function updateCurrentTabInfo(tab) {
    const titleEl = document.getElementById('currentTitle');
    const urlEl = document.getElementById('currentUrl');
    const faviconEl = document.getElementById('currentFavicon');
    const memoryEl = document.getElementById('tabMemory');
    const ageEl = document.getElementById('tabAge');
    const statusEl = document.getElementById('tabStatus');
    
    titleEl.textContent = tab.title || 'Unknown Title';
    
    try {
        const url = new URL(tab.url);
        urlEl.textContent = url.hostname;
    } catch {
        urlEl.textContent = 'Invalid URL';
    }
    
    if (tab.favIconUrl) {
        faviconEl.src = tab.favIconUrl;
        faviconEl.style.display = 'block';
        faviconEl.onerror = () => {
            faviconEl.style.display = 'none';
        };
    } else {
        faviconEl.style.display = 'none';
    }
    
    try {
        const processes = await chrome.processes.getProcessInfo([tab.id]);
        if (processes[tab.id]) {
            const memoryMB = Math.round(processes[tab.id].privateMemory / 1024 / 1024);
            memoryEl.textContent = `${memoryMB}MB`;
        } else {
            memoryEl.textContent = 'N/A';
        }
    } catch {
        memoryEl.textContent = 'N/A';
    }
    
    const tabAge = getTabAge(tab);
    ageEl.textContent = tabAge;
    
    const isActive = await isTabAlwaysActive(tab.id);
    statusEl.textContent = isActive ? 'Always Active' : 'Standby';
    statusEl.style.color = isActive ? '#00cc66' : '#666666';
}

function getTabAge(tab) {
    return '< 1h';
}

async function updateStats(alwaysActiveTabs, allTabs) {
    const activeCount = Object.keys(alwaysActiveTabs).filter(
        tabId => !alwaysActiveTabs[tabId].closed
    ).length;
    const totalCount = allTabs.length;
    
    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('totalTabs').textContent = totalCount;
    
    const uptime = Math.floor((Date.now() - extensionStartTime) / 1000);
    document.getElementById('uptime').textContent = formatDuration(uptime);
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
}

async function updateActiveTabsList(alwaysActiveTabs, allTabs) {
    const listEl = document.getElementById('activeTabsList');
    const countEl = document.getElementById('activeTabsCount');
    
    const activeTabs = Object.entries(alwaysActiveTabs).filter(
        ([tabId, tabInfo]) => !tabInfo.closed
    );
    
    countEl.textContent = activeTabs.length;
    
    if (activeTabs.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
