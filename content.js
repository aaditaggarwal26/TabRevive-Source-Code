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

function enableAlwaysActive() {
    if (isAlwaysActive) return;
    isAlwaysActive = true;
    tabStats.activationTime = Date.now();
    startHeartbeat();
    postMainWorldMessage('ALWAYS_ACTIVE_ENABLE');
    setTimeout(() => postMainWorldMessage('ALWAYS_ACTIVE_ENABLE'), 50);
    setTimeout(() => postMainWorldMessage('ALWAYS_ACTIVE_ENABLE'), 250);
    updateActivity();
    try {
        chrome.runtime.sendMessage({ action: 'tabActivated', tabStats });
    } catch (error) {}
}

function disableAlwaysActive() {
    if (!isAlwaysActive) return;
    isAlwaysActive = false;
    tabStats.activationTime = null;
    stopHeartbeat();
    postMainWorldMessage('ALWAYS_ACTIVE_DISABLE');
    try {
        chrome.runtime.sendMessage({ action: 'tabDeactivated', tabStats });
    } catch (error) {}
}

function postMainWorldMessage(type) {
    window.postMessage({ type, source: 'always-active-extension' }, '*');
}

function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(() => {
        if (!isAlwaysActive) return;
        try {
            updateActivity();
            document.documentElement.scrollTop = document.documentElement.scrollTop;
            requestAnimationFrame(() => {});
            updatePerformanceStats();
        } catch (error) {
            tabStats.errors++;
        }
    }, 1000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function updateActivity() {
    lastActivityTime = Date.now();
}

function startPerformanceMonitoring() {
    if (performanceMonitor) return;
    performanceMonitor = setInterval(() => {
        try {
            updatePerformanceStats();
        } catch (error) {
            tabStats.errors++;
        }
    }, 10000);
}

