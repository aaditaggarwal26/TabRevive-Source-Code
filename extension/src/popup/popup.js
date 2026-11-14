const $ = (id) => document.getElementById(id);
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
let currentTab = null;
let currentHost = null;

const RATE_AFTER_DAYS = 3;
const RATE_AFTER_PROTECTED_TABS = 3;

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $('footerText').textContent = `TabRevive ${chrome.runtime.getManifest().version}`;
    const forcedTabId = Number(new URLSearchParams(location.search).get('tab'));
    [currentTab] = forcedTabId ? [await chrome.tabs.get(forcedTabId)] : await chrome.tabs.query({ active: true, currentWindow: true });
    setupEventListeners();
    await render();
    maybeAskForRating();
});

async function maybeAskForRating() {
    const { installedAt, ratingPrompt, extensionStats } = await chrome.storage.local.get(['installedAt', 'ratingPrompt', 'extensionStats']);
    if (ratingPrompt && ratingPrompt.done) return;
    if (!installedAt || Date.now() - installedAt < RATE_AFTER_DAYS * 86400000) return;
    if (!extensionStats || (extensionStats.totalActivations || 0) < RATE_AFTER_PROTECTED_TABS) return;

    const bar = $('rateBar');
    const finish = (rated) => {
        chrome.storage.local.set({ ratingPrompt: { done: true, rated, at: Date.now() } });
        bar.hidden = true;
    };
    $('rateYes').addEventListener('click', () => {
        finish(true);
        chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });
    });
    $('rateNo').addEventListener('click', () => finish(false));
    bar.hidden = false;
}

let renderQueued = false;
function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => { renderQueued = false; render(); }, 150);
}

async function render() {
    try {
        const [allTabs, data] = await Promise.all([
            chrome.tabs.query({}),
            chrome.storage.local.get(['alwaysActiveTabs', 'alwaysActiveSites'])
        ]);
        const tabs = data.alwaysActiveTabs || {};
        const sites = data.alwaysActiveSites || [];
        currentTab = allTabs.find((tab) => tab.id === currentTab.id) || currentTab;

        renderStats(tabs, sites, allTabs);
        renderCurrentTab(currentTab, !!tabs[currentTab.id]);
        renderSiteButton(currentTab, sites);
        await renderActiveList(tabs, allTabs);
    } catch (error) {
        console.error('Failed to render popup:', error);
        toast(t('errLoad'), 'error');
    }
}

function renderStats(tabs, sites, allTabs) {
    const count = Object.keys(tabs).length;
    $('activeCount').textContent = count;
    $('totalTabs').textContent = allTabs.length;
    $('siteCount').textContent = sites.length;
    $('globalStatus').classList.toggle('inactive', count === 0);
    $('statusText').textContent = count === 0 ? t('statusNone') : count === 1 ? t('statusOne') : t('statusMany', count);
}

function renderCurrentTab(tab, isActive) {
    $('currentTitle').textContent = tab.title || t('untitled');
    $('currentUrl').textContent = hostnameOf(tab.url) || tab.url || '';

    const favicon = $('currentFavicon');
    favicon.onerror = () => { favicon.style.display = 'none'; };
    if (tab.favIconUrl) {
        favicon.src = tab.favIconUrl;
        favicon.style.display = 'block';
    } else {
        favicon.style.display = 'none';
    }

    const status = $('tabStatus');
    status.textContent = isActive ? t('stateActive') : t('stateStandby');
    status.style.color = isActive ? 'var(--accent)' : 'var(--muted)';

    const toggle = $('toggleButton');
    toggle.textContent = isActive ? t('btnDisable') : t('btnEnable');
    toggle.classList.toggle('active', isActive);
}

function renderSiteButton(tab, sites) {
    const button = $('siteButton');
    currentHost = /^https?:/.test(tab.url || '') ? hostnameOf(tab.url) : null;
    button.style.display = currentHost ? '' : 'none';
    if (!currentHost) return;
    const on = sites.includes(currentHost);
    button.dataset.on = on ? '1' : '';
    button.textContent = on ? t('siteOff', currentHost) : t('siteOn', currentHost);
}

async function renderActiveList(tabs, allTabs) {
    const entries = Object.entries(tabs);
    $('activeTabsCount').textContent = entries.length;

    const list = $('activeTabsList');
    if (entries.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-text"></div><div class="empty-state-subtext"></div></div>';
        list.querySelector('.empty-state-text').textContent = t('emptyTitle');
        list.querySelector('.empty-state-subtext').textContent = t('emptyHint');
        return;
    }

    const items = await Promise.all(entries.map(async ([tabId, info]) => {
        const exists = allTabs.some((tab) => String(tab.id) === tabId);
        const responding = exists && await isTabResponding(Number(tabId));

        const item = document.createElement('div');
        item.className = 'active-tab-item';
        item.innerHTML = `
            <div class="active-tab-info">
                <div class="activity-indicator"></div>
                <img class="tab-favicon-small" alt="">
                <div class="active-tab-text">
                    <div class="active-tab-title"></div>
                    <div class="active-tab-url"></div>
                </div>
            </div>
            <button class="remove-button">×</button>`;
        item.querySelector('.remove-button').title = t('removeTab');
        item.querySelector('.remove-button').setAttribute('aria-label', t('removeTab'));

        item.querySelector('.activity-indicator').classList.toggle('inactive', !responding);
        const favicon = item.querySelector('.tab-favicon-small');
        favicon.addEventListener('error', () => { favicon.style.display = 'none'; });
        if (info.favIconUrl) favicon.src = info.favIconUrl; else favicon.style.display = 'none';
        item.querySelector('.active-tab-title').textContent = info.title || t('untitled');
        item.querySelector('.active-tab-url').textContent =
            `${hostnameOf(info.url) || '?'} · ${timeSince(info.timestamp)}${info.auto ? ' · ' + t('tagSiteRule') : ''}`;

        item.querySelector('.remove-button').addEventListener('click', (event) => {
            event.stopPropagation();
            setTabActive(Number(tabId), false);
        });
        item.addEventListener('click', () => {
            if (!exists) return;
            chrome.tabs.update(Number(tabId), { active: true });
            window.close();
        });
        return item;
    }));

    list.replaceChildren(...items);
}

function setupEventListeners() {
    $('toggleButton').addEventListener('click', () => setTabActive(currentTab.id, !$('toggleButton').classList.contains('active')));
    $('siteButton').addEventListener('click', toggleSiteRule);
    $('refreshAllBtn').addEventListener('click', refreshAllActiveTabs);
    $('muteAllBtn').addEventListener('click', muteAllActiveTabs);
    $('exportBtn').addEventListener('click', exportActiveTabsList);
    $('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.alwaysActiveTabs || changes.alwaysActiveSites) scheduleRender();
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.title || changeInfo.favIconUrl || changeInfo.url) scheduleRender();
    });
    chrome.tabs.onRemoved.addListener(scheduleRender);
    chrome.tabs.onCreated.addListener(scheduleRender);
}

async function setTabActive(tabId, isActive) {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'setTabActive', tabId, isActive });
        if (response && response.error) toast(response.error, 'warning');
    } catch (error) {
        console.error('Failed to update tab:', error);
        toast(t('errUpdateTab'), 'error');
    }
}

async function toggleSiteRule() {
    try {
        await chrome.runtime.sendMessage({ action: 'setSiteRule', host: currentHost, on: !$('siteButton').dataset.on });
    } catch (error) {
        console.error('Failed to update site rule:', error);
        toast(t('errSiteRule'), 'error');
    }
}

async function protectedTabIds() {
    const { alwaysActiveTabs } = await chrome.storage.local.get(['alwaysActiveTabs']);
    return Object.keys(alwaysActiveTabs || {}).map(Number);
}

async function refreshAllActiveTabs() {
    const ids = await protectedTabIds();
    await Promise.all(ids.map((id) => chrome.tabs.reload(id).catch(() => {})));
    toast(ids.length ? t('toastRefreshed') : t('toastNothingRefresh'), ids.length ? 'success' : 'warning');
}

async function muteAllActiveTabs() {
    const ids = await protectedTabIds();
    await Promise.all(ids.map(async (id) => {
        try {
            const tab = await chrome.tabs.get(id);
            await chrome.tabs.update(id, { muted: !tab.mutedInfo.muted });
        } catch {}
    }));
    toast(ids.length ? t('toastMuted') : t('toastNothingMute'), ids.length ? 'success' : 'warning');
}

async function exportActiveTabsList() {
    const { alwaysActiveTabs } = await chrome.storage.local.get(['alwaysActiveTabs']);
    const rows = Object.values(alwaysActiveTabs || {}).map((info) => ({
        title: info.title,
        url: info.url,
        since: new Date(info.timestamp).toISOString(),
        siteRule: !!info.auto
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabrevive-active-tabs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t('toastExported'));
}

function hostnameOf(url) {
    try { return new URL(url).hostname; } catch { return null; }
}

function timeSince(timestamp) {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return t('justNow');
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

async function isTabResponding(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return !!(response && response.alive);
    } catch {
        return false;
    }
}
