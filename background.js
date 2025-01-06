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
