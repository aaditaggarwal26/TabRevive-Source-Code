const timers = new Map();

onmessage = (e) => {
    const [portId, op, key, ms, repeat] = e.data;
    const name = portId + ':' + key;
    if (op === 1) {
        timers.set(name, (repeat ? setInterval : setTimeout)(() => {
            postMessage([portId, key]);
            if (!repeat) timers.delete(name);
        }, ms));
    } else if (op === 0) {
        clearTimeout(timers.get(name));
        timers.delete(name);
    } else {
        for (const [n, id] of timers) {
            if (n.startsWith(portId + ':')) { clearTimeout(id); timers.delete(n); }
        }
    }
};
