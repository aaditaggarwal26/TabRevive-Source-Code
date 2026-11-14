(() => {
    if (globalThis.__trContent) return;
    globalThis.__trContent = true;

    const TOKEN = 'tr' + crypto.getRandomValues(new Uint32Array(4)).join('');
    let acked = false;
    let active = false;
    let decided = false;
    let options = null;

    const send = (command) => document.dispatchEvent(new CustomEvent(TOKEN, { detail: JSON.stringify(command) }));
    const handshake = () => document.dispatchEvent(new CustomEvent('tabrevive:init', { detail: TOKEN }));

    let port = null;
    let portReady = false;
    let retries = 0;

    function connectTicker() {
        if (port) return;
        try { port = chrome.runtime.connect({ name: 'tabrevive-ticks' }); } catch { port = null; return; }
        port.onMessage.addListener((message) => {
            if (message === 'ready') {
                portReady = true;
                retries = 0;
                send({ type: 'ticker', up: true });
            } else {
                document.dispatchEvent(new CustomEvent(TOKEN + ':t', { detail: String(message) }));
            }
        });
        port.onDisconnect.addListener(() => {
            void chrome.runtime.lastError;
            port = null;
            if (portReady) send({ type: 'ticker', up: false });
            portReady = false;
            if (active && retries++ < 5) setTimeout(connectTicker, 1000 * retries);
        });
    }

    function disconnectTicker() {
        if (!port) return;
        port.disconnect();
        port = null;
        if (portReady) send({ type: 'ticker', up: false });
        portReady = false;
    }

    document.addEventListener(TOKEN + ':out', (event) => {
        if (port && portReady) port.postMessage(JSON.parse(event.detail));
    }, true);

    function setActive(on, newOptions) {
        active = on;
        if (newOptions) options = newOptions;
        send(on ? { type: 'enable', options } : { type: 'disable' });
        if (on && (!options || options.timers)) connectTicker(); else disconnectTicker();
    }

    document.addEventListener(TOKEN + ':ack', () => { acked = true; }, true);
    document.addEventListener('tabrevive:ready', () => {
        if (acked) return;
        handshake();
        if (active) setActive(true);
        if (portReady) send({ type: 'ticker', up: true });
    }, true);
    handshake();

    globalThis.__trArm = () => { if (!decided) setActive(true); };
    if (globalThis.__trArmed) setActive(true);

    chrome.runtime.sendMessage({ action: 'checkTabActive' }).then((response) => {
        decided = true;
        setActive(!!(response && response.shouldStayActive), response && response.options);
    }).catch(() => {
        decided = true;
        if (active) setActive(false);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
            case 'enableAlwaysActive':
                decided = true;
                setActive(true, message.options);
                sendResponse({ success: true });
                break;
            case 'disableAlwaysActive':
                decided = true;
                setActive(false);
                sendResponse({ success: true });
                break;
            case 'ping':
            case 'getStatus':
                sendResponse({ alive: true, isAlwaysActive: active });
                break;
            default:
                sendResponse({ error: 'Unknown action' });
        }
    });

    const orphanCheck = setInterval(() => {
        if (chrome.runtime && chrome.runtime.id) return;
        clearInterval(orphanCheck);
        send({ type: 'disable' });
    }, 2000);
})();
