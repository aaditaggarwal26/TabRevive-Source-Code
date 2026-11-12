const $ = (id) => document.getElementById(id);
let currentSettings = {};

function getDefaultSettings() {
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

document.addEventListener('DOMContentLoaded', async () => {
    const { extensionSettings } = await chrome.storage.local.get(['extensionSettings']);
    currentSettings = { ...getDefaultSettings(), ...extensionSettings };
    applySettingsToUI();
    setupEventListeners();
    setupThemeControls();
    loadStatistics();
    setInterval(loadStatistics, 5000);
});

function applySettingsToUI() {
    document.querySelectorAll('[data-setting]').forEach((element) => {
        const value = currentSettings[element.dataset.setting];
        if (element.classList.contains('toggle-switch')) {
            element.classList.toggle('active', !!value);
            element.setAttribute('aria-checked', String(!!value));
        } else {
            element.value = value;
        }
    });
}

let saveTimer = null;
function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'updateSettings', settings: currentSettings });
            if (response && response.error) throw new Error(response.error);
            toast('Saved');
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast('Failed to save settings', 'error');
        }
    }, 250);
}

function setupEventListeners() {
    document.querySelectorAll('.toggle-switch[data-setting]').forEach((toggle) => {
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('tabindex', '0');
        const flip = () => {
            currentSettings[toggle.dataset.setting] = !toggle.classList.contains('active');
            applySettingsToUI();
            saveSettings();
        };
        toggle.addEventListener('click', flip);
        toggle.addEventListener('keydown', (event) => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); flip(); }
        });
    });

    document.querySelectorAll('input[type="number"][data-setting], select[data-setting]').forEach((input) => {
        input.addEventListener('change', () => {
            let value = parseInt(input.value, 10);
            if (Number.isNaN(value)) value = getDefaultSettings()[input.dataset.setting];
            if (input.min !== '') value = Math.max(Number(input.min), value);
            if (input.max !== '') value = Math.min(Number(input.max), value);
            currentSettings[input.dataset.setting] = value;
            input.value = value;
            saveSettings();
        });
    });

    $('resetSettingsBtn').addEventListener('click', resetSettings);
    $('clearDataBtn').addEventListener('click', clearAllData);
    $('exportSettingsBtn').addEventListener('click', exportSettings);
    $('importSettingsBtn').addEventListener('click', () => $('importFileInput').click());
    $('importFileInput').addEventListener('change', importSettings);
}

async function loadStatistics() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getExtensionStats' });
        const stats = response.extensionStats || {};
        $('totalActivations').textContent = stats.totalActivations || 0;
        $('averageActiveTime').textContent = formatDuration(stats.averageActiveTime || 0);
        $('currentActive').textContent = response.activeCount || 0;
        $('siteCount').textContent = response.siteCount || 0;
    } catch (error) {
        console.error('Failed to load statistics:', error);
    }
}

function formatDuration(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

async function resetSettings() {
    if (!confirm('Reset all settings to their default values?')) return;
    currentSettings = getDefaultSettings();
    applySettingsToUI();
    saveSettings();
}

async function clearAllData() {
    if (!confirm('Clear ALL extension data, including protected tabs, site rules, statistics and appearance? This cannot be undone.')) return;
    try {
        await chrome.runtime.sendMessage({ action: 'clearAllData' });
        localStorage.clear();
        location.reload();
    } catch (error) {
        console.error('Failed to clear data:', error);
        toast('Failed to clear data', 'error');
    }
}

function exportSettings() {
    const data = {
        settings: currentSettings,
        appearance: { theme: localStorage.getItem('trTheme'), background: localStorage.getItem('trBg'), dim: localStorage.getItem('trDim') },
        exportDate: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabrevive-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Settings exported');
}

async function importSettings(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        if (!data || typeof data.settings !== 'object') throw new Error('Invalid settings file');

        const defaults = getDefaultSettings();
        currentSettings = { ...defaults };
        for (const key of Object.keys(defaults)) {
            if (typeof data.settings[key] === typeof defaults[key]) currentSettings[key] = data.settings[key];
        }

        const look = data.appearance || {};
        [['trTheme', look.theme], ['trBg', look.background], ['trDim', look.dim]].forEach(([key, value]) => {
            if (typeof value === 'string') localStorage.setItem(key, value); else localStorage.removeItem(key);
        });
        applyTheme();
        window.dispatchEvent(new StorageEvent('storage'));

        applySettingsToUI();
        saveSettings();
    } catch (error) {
        console.error('Failed to import settings:', error);
        toast('Could not import: not a TabRevive settings file', 'error');
    }
}

const THEMES = [
    ['oled', 'Black'], ['dark', 'Graphite'], ['midnight', 'Midnight'], ['arctic', 'Arctic'], ['dusk', 'Dusk'],
    ['ember', 'Ember'], ['ocean', 'Ocean'], ['paper', 'Paper'], ['light', 'Light']
];

const mesh = (base, ...pools) => pools
    .map(([color, x, y, size = 60]) => `radial-gradient(${size}% ${size}% at ${x}% ${y}%, ${color} 0%, transparent 70%)`)
    .concat(`linear-gradient(${base}, ${base})`)
    .join(', ');

const BACKGROUNDS = [
    ['Aurora', mesh('#070b12', ['#1d8f6a', 12, 8], ['#3348c4', 88, 22, 55], ['#7b2fa8', 55, 105, 65])],
    ['Sunset', mesh('#140a14', ['#ff7a59', 18, 0], ['#c2367a', 92, 30, 55], ['#4b1d6e', 40, 105, 70])],
    ['Lagoon', mesh('#041217', ['#0e7490', 10, 15], ['#0f766e', 90, 8, 55], ['#1e3a8a', 50, 105, 70])],
    ['Dune', mesh('#1a100a', ['#c2794d', 15, 10], ['#7a3e2a', 90, 35, 55], ['#e0b07a', 45, 105, 60])],
    ['Bloom', mesh('#120b1a', ['#ff5c8a', 10, 20], ['#7c5cff', 85, 10, 55], ['#ffb36b', 60, 105, 60])],
    ['Mist', mesh('#f8fafc', ['#c7d2fe', 10, 10], ['#fbcfe8', 90, 20, 55], ['#bbf7d0', 50, 105, 65])]
];

const glow = (c) => mesh(`color-mix(in srgb, ${c} 14%, #050505)`, [c, 15, 0, 70], [`color-mix(in srgb, ${c} 55%, #000)`, 90, 100, 65]);

function swatch(grid, { label, checked, theme, image, extraClass }, onPick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch' + (extraClass ? ' ' + extraClass : '');
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(checked));
    button.setAttribute('aria-label', label);
    if (theme) {
        button.dataset.theme = theme;
        button.innerHTML = '<span class="swatch-card"></span><span class="swatch-dot"></span><span class="swatch-name"></span>';
    } else {
        if (image) button.style.backgroundImage = image;
        button.innerHTML = '<span class="swatch-name"></span>';
    }
    button.querySelector('.swatch-name').textContent = label;
    button.addEventListener('click', onPick);
    grid.appendChild(button);
}

function setupThemeControls() {
    const themeGrid = document.getElementById('themeGrid');
    const bgGrid = document.getElementById('bgGrid');
    const dim = document.getElementById('bgDimInput');
    const colorInput = document.getElementById('bgColorInput');

    function renderThemes() {
        const current = localStorage.getItem('trTheme') || 'oled';
        themeGrid.replaceChildren();
        THEMES.forEach(([key, label]) => swatch(themeGrid, { label, theme: key, checked: key === current }, () => {
            localStorage.setItem('trTheme', key);
            applyTheme();
            renderThemes();
        }));
    }

    function renderBackgrounds() {
        const current = localStorage.getItem('trBg');
        bgGrid.replaceChildren();
        swatch(bgGrid, { label: 'None', checked: !current, extraClass: 'bg-none' }, () => setBackground(null));
        BACKGROUNDS.forEach(([label, css]) => swatch(bgGrid, { label, image: css, checked: current === css, extraClass: 'bg-swatch' }, () => setBackground(css)));
        const isCustom = current && !BACKGROUNDS.some(([, css]) => css === current);
        if (isCustom) swatch(bgGrid, { label: current.startsWith('url(') ? 'Your image' : 'Your colour', image: current, checked: true, extraClass: 'bg-swatch' }, noopPick);
        dim.disabled = !current;
    }
    const noopPick = () => {};

    function setBackground(cssImage) {
        try {
            if (cssImage) localStorage.setItem('trBg', cssImage);
            else localStorage.removeItem('trBg');
        } catch {
            toast('Image too large to store', 'error');
            return;
        }
        applyTheme();
        renderBackgrounds();
    }

    dim.value = localStorage.getItem('trDim') ?? 40;
    dim.addEventListener('input', () => {
        localStorage.setItem('trDim', dim.value);
        applyTheme();
    });

    colorInput.addEventListener('input', () => setBackground(glow(colorInput.value)));

    const imageInput = document.getElementById('bgImageInput');
    document.getElementById('bgImageBtn').addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async () => {
        const file = imageInput.files[0];
        imageInput.value = '';
        if (!file) return;

        try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, 1600 / bitmap.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            setBackground(`url("${canvas.toDataURL('image/jpeg', 0.8)}")`);
        } catch {
            toast('Could not read that image', 'error');
        }
    });

    renderThemes();
    renderBackgrounds();
    window.addEventListener('storage', () => { renderThemes(); renderBackgrounds(); });
}
