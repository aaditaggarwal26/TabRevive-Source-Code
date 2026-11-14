const ARMED_SCRIPT_ID = 'tabrevive-armed';
const ICON = chrome.runtime.getURL('icons/icon48.png');
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;

function getOptimalSettings() {
    return {
        aggressiveMode: true,
        enableSilentAudio: true,
        simulateActivity: false,
        enableNotifications: true,
        maxActiveTabs: 25,
        autoRefresh: false,
        autoRefreshInterval: 300000
    };
}

const freshStats = () => ({ startTime: Date.now(), totalActivations: 0, totalDeactivations: 0, averageActiveTime: 0 });

async function load() {
    const data = await chrome.storage.local.get(['alwaysActiveTabs', 'alwaysActiveSites', 'pendingRestore', 'extensionSettings', 'extensionStats']);
    return {
        tabs: data.alwaysActiveTabs || {},
        sites: data.alwaysActiveSites || [],
        pendingRestore: data.pendingRestore || [],
        settings: { ...getOptimalSettings(), ...data.extensionSettings },
        stats: { ...freshStats(), ...data.extensionStats }
    };
}

const save = (state) => chrome.storage.local.set({
    alwaysActiveTabs: state.tabs,
    alwaysActiveSites: state.sites,
    pendingRestore: state.pendingRestore,
    extensionStats: state.stats
});

let queue = Promise.resolve();
function locked(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
}

const shimOptions = (settings) => ({
    timers: !!settings.aggressiveMode,
    audio: !!settings.enableSilentAudio,
    activity: !!settings.simulateActivity
});

function hostOf(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
    } catch {
        return null;
    }
}

function siteMatches(sites, url) {
    const host = hostOf(url);
    return !!host && sites.some((site) => host === site || host.endsWith('.' + site));
}

async function notify(title, message) {
    const { settings } = await load();
    if (settings.enableNotifications) chrome.notifications.create({ type: 'basic', iconUrl: ICON, title, message });
}

async function updateBadge() {
    const count = Object.keys((await load()).tabs).length;
    chrome.action.setBadgeText({ text: count ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#00ff88' });
    chrome.action.setTitle({ title: count ? `TabRevive - Keep Tabs Alive - ${count} tabs always active` : 'TabRevive - Keep Tabs Alive - No active tabs' });
}

async function syncArmedHosts() {
    try {
        const { tabs, sites } = await load();
        const hosts = new Set(sites);
        Object.values(tabs).forEach((info) => { const host = hostOf(info.url); if (host) hosts.add(host); });
        const matches = [...hosts].filter((h) => /^[a-z0-9.-]+$/i.test(h)).flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);

        const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ARMED_SCRIPT_ID] });
        if (!matches.length) {
            if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [ARMED_SCRIPT_ID] });
        } else if (existing.length) {
            await chrome.scripting.updateContentScripts([{ id: ARMED_SCRIPT_ID, matches }]);
        } else {
            await chrome.scripting.registerContentScripts([{ id: ARMED_SCRIPT_ID, js: ['src/content/armed.js'], matches, allFrames: true, matchOriginAsFallback: true, runAt: 'document_start' }]);
        }
    } catch (error) {
        console.warn('TabRevive: could not update armed hosts', error);
    }
}

async function syncOffscreen() {
    try {
        const needed = Object.keys((await load()).tabs).length > 0;
        const exists = await chrome.offscreen.hasDocument();
        if (needed && !exists) {
            await chrome.offscreen.createDocument({ url: 'src/offscreen/offscreen.html', reasons: ['WORKERS'], justification: 'Runs the timer that keeps protected background tabs from being throttled.' });
        } else if (!needed && exists) {
            await chrome.offscreen.closeDocument();
        }
    } catch (error) {
        console.warn('TabRevive: offscreen page', error);
    }
}

async function ensureScripts(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return true;
    } catch {}
    try {
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['src/content/injected.js'], world: 'MAIN' });
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['src/content/content.js'] });
        return true;
    } catch {
        return false;
    }
}

async function applyToTab(tabId, isActive) {
    await chrome.tabs.update(tabId, { autoDiscardable: !isActive }).catch(() => {});
    await syncOffscreen();
    if (isActive) {
        const { settings } = await load();
        const reachable = await ensureScripts(tabId);
        if (reachable) await chrome.tabs.sendMessage(tabId, { action: 'enableAlwaysActive', options: shimOptions(settings) }).catch(() => {});
    } else {
        await chrome.tabs.sendMessage(tabId, { action: 'disableAlwaysActive' }).catch(() => {});
    }
    updateBadge();
    syncArmedHosts();
}

function recordDeactivation(state, info) {
    const sessionTime = Date.now() - (info.timestamp || Date.now());
    const n = ++state.stats.totalDeactivations;
    state.stats.averageActiveTime = (state.stats.averageActiveTime * (n - 1) + sessionTime) / n;
}

async function setTabActive(tabId, isActive, { auto = false, onlyAuto = false } = {}) {
    tabId = Number(tabId);
    const result = await locked(async () => {
        const state = await load();
        const existing = state.tabs[tabId];
        if (isActive) {
            if (existing) return { success: true, changed: false };
            const tab = await chrome.tabs.get(tabId).catch(() => null);
            if (!tab) return { error: t('errTabNotFound') };
            if (!/^(https?|file):/.test(tab.url || '')) return { error: t('errCannotProtect') };
            if (Object.keys(state.tabs).length >= state.settings.maxActiveTabs) return { error: t('errLimit', state.settings.maxActiveTabs) };
            state.tabs[tabId] = { title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, timestamp: Date.now(), ...(auto ? { auto: true } : {}) };
            state.stats.totalActivations++;
        } else {
            if (!existing || (onlyAuto && !existing.auto)) return { success: true, changed: false };
            recordDeactivation(state, existing);
            delete state.tabs[tabId];
        }
        await save(state);
        return { success: true, changed: true };
    });
    if (result.changed) await applyToTab(tabId, isActive);
    return result;
}

async function setSiteRule(host, on) {
    await locked(async () => {
        const state = await load();
        state.sites = state.sites.filter((site) => site !== host);
        if (on) state.sites.push(host);
        await save(state);
    });
    const { sites } = await load();
    for (const tab of await chrome.tabs.query({})) {
        if (!siteMatches([host], tab.url)) continue;
        if (on) await setTabActive(tab.id, true, { auto: true });
        else if (!siteMatches(sites, tab.url)) await setTabActive(tab.id, false, { onlyAuto: true });
    }
    await syncArmedHosts();
    return { success: true };
}

async function disableAll() {
    const ids = Object.keys((await load()).tabs);
    for (const id of ids) await setTabActive(id, false);
    return ids.length;
}

async function handleTabActiveCheck(sender) {
    const tabId = sender.tab.id;
    const topFrame = sender.frameId === 0;
    const url = topFrame ? sender.url : sender.tab.url;
    let state = await load();
    let entry = state.tabs[tabId];

    if (topFrame) {
        const matches = siteMatches(state.sites, url);
        if (!entry && (matches || state.pendingRestore.includes(url))) {
            const restored = !matches;
            const result = await setTabActive(tabId, true, { auto: matches });
            if (restored && result.success) {
                await locked(async () => {
                    const s = await load();
                    s.pendingRestore = s.pendingRestore.filter((u) => u !== url);
                    await save(s);
                });
            }
        } else if (entry && entry.auto && !matches) {
            await setTabActive(tabId, false);
        }
        state = await load();
        entry = state.tabs[tabId];
    }
    return { shouldStayActive: !!entry, options: shimOptions(state.settings) };
}

async function removeStaleTabs() {
    const { tabs } = await load();
    for (const id of Object.keys(tabs)) {
        const alive = await chrome.tabs.get(Number(id)).then(() => true, () => false);
        if (!alive) await setTabActive(id, false);
    }
}

async function autoRefresh() {
    const state = await load();
    if (!state.settings.autoRefresh) return;
    const due = Object.entries(state.tabs).filter(([, info]) => Date.now() - (info.lastRefreshed || info.timestamp) > state.settings.autoRefreshInterval);
    if (!due.length) return;
    await locked(async () => {
        const s = await load();
        for (const [id] of due) if (s.tabs[id]) s.tabs[id].lastRefreshed = Date.now();
        await save(s);
    });
    for (const [id] of due) chrome.tabs.reload(Number(id)).catch(() => {});
}

chrome.runtime.onInstalled.addListener(async (details) => {
    const state = await load();
    await chrome.storage.local.set({ extensionSettings: state.settings });
    const { installedAt } = await chrome.storage.local.get(['installedAt']);
    if (!installedAt) await chrome.storage.local.set({ installedAt: Date.now() });
    await save(state);
    chrome.alarms.create('tick', { periodInMinutes: 1 });

    if (details.reason === 'install') {
        chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: t('noteInstalledTitle'), message: t('noteInstalled') });
    }
    await removeStaleTabs();
    for (const id of Object.keys((await load()).tabs)) await applyToTab(Number(id), true);
    updateBadge();
    syncArmedHosts();
});

chrome.runtime.onStartup.addListener(async () => {
    await locked(async () => {
        const state = await load();
        state.pendingRestore = Object.values(state.tabs).filter((info) => !info.auto).map((info) => info.url);
        state.tabs = {};
        state.stats.startTime = Date.now();
        await save(state);
    });
    chrome.alarms.create('tick', { periodInMinutes: 1 });
    updateBadge();
    syncArmedHosts();
    syncOffscreen();
});

chrome.alarms.onAlarm.addListener(async () => {
    await removeStaleTabs();
    await syncOffscreen();
    await autoRefresh();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const reply = (promise) => { promise.then(sendResponse, (error) => sendResponse({ error: String(error && error.message || error) })); return true; };
    switch (message.action) {
        case 'checkTabActive':
            return reply(handleTabActiveCheck(sender));
        case 'setTabActive':
            return reply(setTabActive(message.tabId, message.isActive));
        case 'setSiteRule':
            return reply(setSiteRule(message.host, message.on));
        case 'disableAll':
            return reply(disableAll().then((count) => ({ success: true, count })));
        case 'getExtensionStats':
            return reply(load().then((state) => ({
                extensionStats: state.stats,
                activeCount: Object.keys(state.tabs).length,
                siteCount: state.sites.length
            })));
        case 'updateSettings':
            return reply((async () => {
                await chrome.storage.local.set({ extensionSettings: { ...getOptimalSettings(), ...message.settings } });
                const state = await load();
                for (const id of Object.keys(state.tabs)) {
                    chrome.tabs.sendMessage(Number(id), { action: 'enableAlwaysActive', options: shimOptions(state.settings) }).catch(() => {});
                }
                return { success: true };
            })());
        case 'clearAllData':
            return reply((async () => {
                await disableAll();
                await locked(async () => {
                    const keep = await chrome.storage.local.get(['installedAt', 'ratingPrompt']);
                    await chrome.storage.local.clear();
                    await chrome.storage.local.set({ alwaysActiveTabs: {}, alwaysActiveSites: [], pendingRestore: [], extensionSettings: getOptimalSettings(), extensionStats: freshStats() });
                    await chrome.storage.local.set(keep);
                });
                await syncArmedHosts();
                updateBadge();
                return { success: true };
            })());
        default:
            sendResponse({ error: 'Unknown action' });
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    locked(async () => {
        const state = await load();
        if (!state.tabs[tabId]) return;
        Object.assign(state.tabs[tabId], { title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl });
        await save(state);
    }).then(syncArmedHosts);
});

chrome.tabs.onRemoved.addListener((tabId) => { setTabActive(tabId, false); });

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    locked(async () => {
        const state = await load();
        if (!state.tabs[removedTabId]) return false;
        state.tabs[addedTabId] = state.tabs[removedTabId];
        delete state.tabs[removedTabId];
        await save(state);
        return true;
    }).then((moved) => { if (moved) applyToTab(addedTabId, true); });
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-current-tab') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        const wasActive = !!(await load()).tabs[tab.id];
        const result = await setTabActive(tab.id, !wasActive);
        if (result.error) notify('TabRevive', result.error);
        else if (wasActive) notify(t('noteDisabledTitle'), t('noteDisabledFor', tab.title));
        else notify(t('noteEnabledTitle'), t('noteEnabledFor', tab.title));
    } else if (command === 'disable-all-tabs') {
        const count = await disableAll();
        notify(count ? t('noteAllOffTitle') : t('noteNoneTitle'), count ? t('noteAllOff', count) : t('noteNone'));
    }
});

updateBadge();
syncOffscreen();
