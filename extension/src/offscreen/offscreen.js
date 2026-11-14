const worker = new Worker('ticker.js');
const ports = new Map();
let nextPortId = 1;

worker.onmessage = (e) => {
    const [portId, key] = e.data;
    const port = ports.get(portId);
    if (port) port.postMessage(key);
};

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tabrevive-ticks') return;
    const id = nextPortId++;
    ports.set(id, port);
    port.onMessage.addListener((message) => worker.postMessage([id, ...message]));
    port.onDisconnect.addListener(() => {
        ports.delete(id);
        worker.postMessage([id, 2]);
    });
    port.postMessage('ready');
});
