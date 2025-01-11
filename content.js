let isAlwaysActive = false;
let heartbeatInterval = null;
let performanceMonitor = null;
let lastActivityTime = Date.now();
let tabStats = {
    startTime: Date.now(),
    activationTime: null,
    pageLoads: 0,
    errors: 0,
    memoryUsage: 0
};

postMainWorldMessage('ALWAYS_ACTIVE_QUERY');

(async function initialize() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'checkTabActive' });
        if (response && response.shouldStayActive) {
            enableAlwaysActive();
        } else {
            postMainWorldMessage('ALWAYS_ACTIVE_DISABLE');
        }
        startPerformanceMonitoring();
        tabStats.pageLoads++;
    } catch (error) {
        tabStats.errors++;
    }
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.action) {
            case 'enableAlwaysActive':
                enableAlwaysActive();
                sendResponse({ success: true, stats: tabStats });
                break;

            case 'disableAlwaysActive':
                disableAlwaysActive();
                sendResponse({ success: true, stats: tabStats });
                break;

            case 'getStatus':
                sendResponse({ isAlwaysActive, stats: tabStats, lastActivity: lastActivityTime });
                break;

            case 'ping':
                updateActivity();
                if (isAlwaysActive) {
                    postMainWorldMessage('ALWAYS_ACTIVE_ENABLE');
                }
                sendResponse({ alive: true, timestamp: Date.now(), stats: tabStats });
                break;

            case 'getPerformanceStats':
                sendResponse({ stats: tabStats, performance: getPerformanceMetrics() });
                break;

            default:
                sendResponse({ error: 'Unknown action' });
        }
    } catch (error) {
        tabStats.errors++;
        sendResponse({ error: error.message });
    }
    return true;
});
