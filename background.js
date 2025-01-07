let extensionStats = {
    startTime: Date.now(),
    totalActivations: 0,
    totalDeactivations: 0,
    averageActiveTime: 0,
    memoryUsage: 0,
    errors: 0
};

let activeTabsPerformance = {};
let cleanupInterval = null;
let performanceInterval = null;

chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        const existingData = await chrome.storage.local.get(['alwaysActiveTabs', 'extensionSettings', 'extensionStats']);
        
        const optimalSettings = getOptimalSettings();
        
        await chrome.storage.local.set({
            alwaysActiveTabs: existingData.alwaysActiveTabs || {},
            extensionSettings: optimalSettings,
            extensionStats: existingData.extensionStats || extensionStats
        });
        
        if (details.reason === 'install') {
            showWelcomeNotification();
        }
        
        startBackgroundMonitoring();
        
    } catch (error) {
        extensionStats.errors++;
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.action) {
            case 'updateAlwaysActive':
                handleAlwaysActiveUpdate(message.tabId, message.isActive);
                sendResponse({ success: true });
                break;
                
            case 'getAlwaysActiveStatus':
                getAlwaysActiveStatus(message.tabId, sendResponse);
                return true;
                
            case 'checkTabActive':
                handleTabActiveCheck(sender.tab.id, sendResponse);
                return true;
                
            case 'tabActivated':
                handleTabActivated(sender.tab.id, message.tabStats);
                sendResponse({ success: true });
                break;
                
            case 'tabDeactivated':
                handleTabDeactivated(sender.tab.id, message.tabStats);
                sendResponse({ success: true });
                break;
                
            case 'tabUnloading':
                handleTabUnloading(sender.tab.id, message.tabStats);
                sendResponse({ success: true });
                break;
                
            case 'getExtensionStats':
                sendResponse({
                    extensionStats,
                    activeTabsPerformance,
                    activeCount: Object.keys(activeTabsPerformance).length
                });
                break;
                
            case 'updateSettings':
                updateSettings(message.settings);
                sendResponse({ success: true });
                break;
                
            case 'clearAllData':
                clearAllData();
                sendResponse({ success: true });
                break;
                
            default:
                sendResponse({ error: 'Unknown action' });
        }
    } catch (error) {
        extensionStats.errors++;
        sendResponse({ error: error.message });
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
        if (changeInfo.status === 'complete') {
            const result = await chrome.storage.local.get(['alwaysActiveTabs']);
            const alwaysActiveTabs = result.alwaysActiveTabs || {};
            
            if (alwaysActiveTabs.hasOwnProperty(tabId.toString())) {
                alwaysActiveTabs[tabId.toString()] = {
                    ...alwaysActiveTabs[tabId.toString()],
                    title: tab.title,
                    url: tab.url,
                    favIconUrl: tab.favIconUrl,
                    lastUpdated: Date.now(),
                    closed: false
                };
                
                await chrome.storage.local.set({ alwaysActiveTabs });
                
                await injectAlwaysActiveScript(tabId);
                
                setTimeout(async () => {
                    try {
                        await chrome.tabs.sendMessage(tabId, { action: 'enableAlwaysActive' });
                    } catch (error) {}
                }, 1000);
            }
        }
        
        if (changeInfo.url && activeTabsPerformance[tabId]) {
            activeTabsPerformance[tabId].urlChanges = (activeTabsPerformance[tabId].urlChanges || 0) + 1;
        }
        
    } catch (error) {
        extensionStats.errors++;
    }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    try {
        const result = await chrome.storage.local.get(['alwaysActiveTabs']);
        const alwaysActiveTabs = result.alwaysActiveTabs || {};
        
        if (alwaysActiveTabs.hasOwnProperty(tabId.toString())) {
            alwaysActiveTabs[tabId.toString()].closed = true;
            alwaysActiveTabs[tabId.toString()].closedAt = Date.now();
            
            await chrome.storage.local.set({ alwaysActiveTabs });
            
            if (activeTabsPerformance[tabId]) {
                const sessionTime = Date.now() - activeTabsPerformance[tabId].startTime;
