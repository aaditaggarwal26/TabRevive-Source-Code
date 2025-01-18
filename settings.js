let currentSettings = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadStatistics();
    setupEventListeners();
    startStatsUpdater();
});

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['extensionSettings']);
        currentSettings = result.extensionSettings || getDefaultSettings();
        
        applySettingsToUI();
    } catch (error) {
        console.error('Failed to load settings:', error);
        showNotification('Failed to load settings', 'error');
    }
}

function applySettingsToUI() {
    Object.entries(currentSettings).forEach(([key, value]) => {
        const element = document.querySelector(`[data-setting="${key}"]`);
        if (!element) return;
        
        if (element.classList.contains('toggle-switch')) {
            if (value) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        } else if (element.type === 'number') {
            element.value = value;
        } else if (element.tagName === 'SELECT') {
            element.value = value;
        }
    });
}

async function loadStatistics() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getExtensionStats' });
        if (response.extensionStats) {
            updateStatisticsDisplay(response.extensionStats);
        }
        
        const result = await chrome.storage.local.get(['alwaysActiveTabs']);
        const alwaysActiveTabs = result.alwaysActiveTabs || {};
        const currentActive = Object.keys(alwaysActiveTabs).filter(
            tabId => !alwaysActiveTabs[tabId].closed
        ).length;
        
        document.getElementById('currentActive').textContent = currentActive;
        
    } catch (error) {
        console.error('Failed to load statistics:', error);
    }
}

function updateStatisticsDisplay(stats) {
    document.getElementById('totalActivations').textContent = stats.totalActivations || 0;
    
    const avgTime = stats.averageActiveTime || 0;
    const avgMinutes = Math.round(avgTime / 60000);
    document.getElementById('averageActiveTime').textContent = avgMinutes > 0 ? `${avgMinutes}m` : '0m';
    
    const uptime = stats.uptime || 0;
    const uptimeHours = Math.round(uptime / 3600000);
    document.getElementById('extensionUptime').textContent = uptimeHours > 0 ? `${uptimeHours}h` : '< 1h';
}

function setupEventListeners() {
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const setting = toggle.dataset.setting;
            const isActive = toggle.classList.contains('active');
            
            toggle.classList.toggle('active');
            currentSettings[setting] = !isActive;
            
            if (setting === 'aggressiveMode' && !isActive) {
                enableAggressiveMode();
            }
        });
    });
    
    document.querySelectorAll('.number-input').forEach(input => {
        input.addEventListener('change', () => {
            const setting = input.dataset.setting;
            currentSettings[setting] = parseInt(input.value);
        });
    });
    
    document.querySelectorAll('.select-input').forEach(select => {
        select.addEventListener('change', () => {
