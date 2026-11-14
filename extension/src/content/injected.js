(function () {
    'use strict';

    const win = window;
    const doc = document;
    const noop = function () {};

    try {
        const old = win.__tabReviveMainWorld;
        if (old && typeof old === 'object') Object.defineProperty(old, 'enabled', { get: () => false, set: noop, configurable: true });
    } catch {}

    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const dispatch = EventTarget.prototype.dispatchEvent;
    const NativeEvent = Event;
    const NativeCustomEvent = CustomEvent;
    const NativeMouseEvent = MouseEvent;
    const NativeAudioContext = win.AudioContext || win.webkitAudioContext;
    const native = {
        setTimeout: win.setTimeout, setInterval: win.setInterval, clearTimeout: win.clearTimeout, clearInterval: win.clearInterval,
        raf: win.requestAnimationFrame, caf: win.cancelAnimationFrame,
        perfNow: win.performance.now.bind(win.performance)
    };
    const docDesc = (name) => Object.getOwnPropertyDescriptor(Document.prototype, name);
    const realHidden = docDesc('hidden').get;
    const realHasFocus = Document.prototype.hasFocus;
    const realActiveElement = docDesc('activeElement').get;

    let enabled = false;
    const opts = { timers: true, audio: true, activity: false };

    const masked = new WeakMap();
    const nativeToString = Function.prototype.toString;
    let parentToString = null;
    try { if (win.parent !== win) parentToString = win.parent.Function.prototype.toString; } catch {}

    function mask(fn, original) {
        try {
            Object.defineProperty(fn, 'name', { value: original.name, configurable: true });
            Object.defineProperty(fn, 'length', { value: original.length, configurable: true });
        } catch {}
        masked.set(fn, original);
        return fn;
    }

    Function.prototype.toString = mask({
        toString() {
            if (typeof this !== 'function') return nativeToString.call(this);
            const original = masked.get(this);
            if (original) return nativeToString.call(original);
            if (parentToString) { try { return parentToString.call(this); } catch {} }
            return nativeToString.call(this);
        }
    }.toString, nativeToString);

    function patchDocGetter(name, fake) {
        const d = docDesc(name);
        if (!d || !d.get) return;
        const get = {
            get() {
                const real = d.get.call(this);
                return enabled ? fake : real;
            }
        }.get;
        Object.defineProperty(Document.prototype, name, { ...d, get: mask(get, d.get) });
    }
    patchDocGetter('hidden', false);
    patchDocGetter('webkitHidden', false);
    patchDocGetter('visibilityState', 'visible');
    patchDocGetter('webkitVisibilityState', 'visible');

    Document.prototype.hasFocus = mask({
        hasFocus() {
            const real = realHasFocus.call(this);
            return enabled ? true : real;
        }
    }.hasFocus, realHasFocus);

    function patchEntryMethods(proto) {
        ['getEntries', 'getEntriesByType', 'getEntriesByName'].forEach((name) => {
            const original = proto[name];
            if (typeof original !== 'function') return;
            proto[name] = mask({
                method(...args) {
                    const list = original.apply(this, args);
                    if (!enabled) return list;
                    return list.filter((e) => e.entryType !== 'visibility-state' || (e.name === 'visible' && e.startTime === 0));
                }
            }.method, original);
        });
    }
    if (win.Performance) patchEntryMethods(Performance.prototype);
    if (win.PerformanceObserverEntryList) patchEntryMethods(PerformanceObserverEntryList.prototype);

    const ALWAYS = ['visibilitychange', 'webkitvisibilitychange', 'freeze', 'resume'];
    const FOCUS_OUT = ['blur', 'focusout'];
    const FOCUS_IN = ['focus', 'focusin'];
    const POINTER_OUT = ['mouseout', 'mouseleave', 'pointerout', 'pointerleave'];
    const POINTER_IN = ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'];

    let focusAway = false;
    let awayElement = null;
    let pointerAway = false;

    function shouldBlock(event) {
        const type = event.type;
        if (ALWAYS.includes(type)) return true;

        if (FOCUS_OUT.includes(type)) {
            if (realHasFocus.call(doc)) return false;
            if (!focusAway) { focusAway = true; awayElement = realActiveElement.call(doc); }
            return true;
        }
        if (FOCUS_IN.includes(type)) {
            if (!focusAway) return false;
            if (event.target !== win && event.target !== doc && event.target !== awayElement) return false;
            native.setTimeout.call(win, () => { focusAway = false; awayElement = null; }, 100);
            return true;
        }
        if (POINTER_OUT.includes(type)) {
            if (event.relatedTarget !== null) return false;
            pointerAway = true;
            return true;
        }
        if (POINTER_IN.includes(type)) return pointerAway && event.relatedTarget === null;
        return false;
    }

    function blocker(event) {
        if (!event.isTrusted) return;
        if (event.type === 'visibilitychange') onRealVisibilityChange();
        if (event.type === 'mousemove') { pointerAway = false; return; }
        if (enabled && shouldBlock(event)) event.stopImmediatePropagation();
    }
    [...ALWAYS, ...FOCUS_OUT, ...FOCUS_IN, ...POINTER_OUT, ...POINTER_IN, 'mousemove'].forEach((type) => {
        add.call(win, type, blocker, { capture: true, passive: true });
    });

    let tickerUp = false;
    let nextKey = 1;
    const tickCallbacks = new Map();
    const out = (message) => { if (token) dispatch.call(doc, new NativeCustomEvent(token + ':out', { detail: JSON.stringify(message) })); };

    function onTick(event) {
        event.stopImmediatePropagation();
        const key = Number(event.detail);
        const entry = tickCallbacks.get(key);
        if (!entry) return;
        if (!entry.repeat) tickCallbacks.delete(key);
        entry.fn();
    }

    function setTicker(up) {
        if (up === tickerUp) return;
        tickerUp = up;
        if (!up) {
            tickCallbacks.clear();
            rafs.forEach((r, id) => { if (r.handle && r.handle.key !== undefined) r.handle = { nativeId: native.setTimeout.call(win, () => fireRaf(id), 16) }; });
            if (activityHandle) { activityHandle = null; setActivity(enabled && !!opts.activity); }
        }
        moveTimers(routeTimers());
    }

    function schedule(fn, ms, repeat) {
        if (tickerUp) {
            const key = nextKey++;
            tickCallbacks.set(key, { fn, repeat });
            out([1, key, ms, repeat ? 1 : 0]);
            return { key };
        }
        return { nativeId: (repeat ? native.setInterval : native.setTimeout).call(win, fn, ms) };
    }
    function unschedule(handle) {
        if (handle.key !== undefined) {
            if (tickCallbacks.delete(handle.key) && tickerUp) out([0, handle.key]);
        } else {
            native.clearTimeout.call(win, handle.nativeId);
        }
    }

    const timers = new Map();
    const routeTimers = () => enabled && opts.timers && tickerUp && realHidden.call(doc);

    function runTimer(id) {
        const t = timers.get(id);
        if (!t) return;
        if (!t.repeat) timers.delete(id);
        t.fn.apply(win, t.args);
    }

    function moveTimers(toTicker) {
        const now = native.perfNow();
        timers.forEach((t, id) => {
            const onTicker = t.handle.key !== undefined;
            if (onTicker === toTicker) return;
            unschedule(t.handle);
            const ms = t.repeat ? t.ms : Math.max(0, t.due - now);
            t.handle = toTicker
                ? schedule(() => runTimer(id), ms, t.repeat)
                : { nativeId: (t.repeat ? native.setInterval : native.setTimeout).call(win, () => runTimer(id), ms) };
        });
    }

    function makeSetter(repeat, original) {
        return mask({
            set(handler, ...rest) {
                if (typeof handler !== 'function') return original.call(win, handler, ...rest);
                const route = routeTimers();
                if (!route && !repeat) return original.call(win, handler, ...rest);
                const ms = Math.max(0, Number(rest[0]) || 0);
                const t = { fn: handler, args: rest.slice(1), ms, due: native.perfNow() + ms, repeat, handle: null };
                let id;
                if (route) {
                    id = native.setTimeout.call(win, noop, 0);
                    native.clearTimeout.call(win, id);
                    t.handle = schedule(() => runTimer(id), ms, repeat);
                } else {
                    id = original.call(win, () => runTimer(id), ms);
                    t.handle = { nativeId: id };
                }
                timers.set(id, t);
                return id;
            }
        }.set, original);
    }

    function makeClearer(original) {
        return mask({
            clear(...args) {
                const id = Number(args[0]);
                const t = timers.get(id);
                if (t) { timers.delete(id); unschedule(t.handle); }
                return original.call(win, args[0]);
            }
        }.clear, original);
    }

    win.setTimeout = makeSetter(false, native.setTimeout);
    win.setInterval = makeSetter(true, native.setInterval);
    win.clearTimeout = makeClearer(native.clearTimeout);
    win.clearInterval = makeClearer(native.clearInterval);

    const rafs = new Map();

    function fireRaf(id) {
        const r = rafs.get(id);
        if (!r) return;
        rafs.delete(id);
        r.cb(native.perfNow());
    }

    win.requestAnimationFrame = mask({
        requestAnimationFrame(callback) {
            if (!enabled || !opts.timers || typeof callback !== 'function') return native.raf.call(win, callback);
            let id;
            if (realHidden.call(doc)) {
                id = native.raf.call(win, noop);
                native.caf.call(win, id);
                rafs.set(id, { cb: callback, handle: schedule(() => fireRaf(id), 16, false) });
            } else {
                id = native.raf.call(win, (ts) => { rafs.delete(id); callback(ts); });
                rafs.set(id, { cb: callback, handle: null });
            }
            return id;
        }
    }.requestAnimationFrame, native.raf);

    win.cancelAnimationFrame = mask({
        cancelAnimationFrame(id) {
            const r = rafs.get(id);
            if (r) { rafs.delete(id); if (r.handle) unschedule(r.handle); }
            return native.caf.call(win, id);
        }
    }.cancelAnimationFrame, native.caf);

    function onRealVisibilityChange() {
        moveTimers(routeTimers());
        if (!enabled || !opts.timers || !realHidden.call(doc)) return;
        rafs.forEach((r, id) => {
            if (r.handle) return;
            native.caf.call(win, id);
            r.handle = schedule(() => fireRaf(id), 16, false);
        });
    }

    let audioContext = null;
    function startSilentAudio() {
        if (audioContext || !NativeAudioContext) return;
        try {
            audioContext = new NativeAudioContext();
            const source = audioContext.createBufferSource();
            source.buffer = audioContext.createBuffer(1, 1, 22050);
            source.loop = true;
            source.connect(audioContext.destination);
            source.start(0);
        } catch { audioContext = null; }
    }
    function stopSilentAudio() {
        if (audioContext) { try { audioContext.close(); } catch {} }
        audioContext = null;
    }
    ['pointerdown', 'keydown'].forEach((type) => add.call(win, type, () => {
        if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(noop);
    }, { capture: true, passive: true }));

    let activityHandle = null;
    function setActivity(on) {
        if (on === (activityHandle !== null)) return;
        if (!on) { unschedule(activityHandle); activityHandle = null; return; }
        activityHandle = schedule(() => {
            if (!enabled) return;
            const x = 100 + Math.floor(Math.random() * 400);
            const y = 100 + Math.floor(Math.random() * 300);
            dispatch.call(doc, new NativeMouseEvent('mousemove', { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y, screenX: x, screenY: y }));
        }, 30000, true);
    }

    function enable(options) {
        if (options) Object.assign(opts, options);
        const wasEnabled = enabled;
        enabled = true;

        moveTimers(routeTimers());
        if (opts.audio) startSilentAudio(); else stopSilentAudio();
        setActivity(!!opts.activity);

        if (!wasEnabled && realHidden.call(doc)) {
            onRealVisibilityChange();
            dispatch.call(doc, new NativeEvent('visibilitychange', { bubbles: true }));
        }
    }

    function disable() {
        if (!enabled) return;
        enabled = false;
        focusAway = false;
        pointerAway = false;
        moveTimers(false);
        setActivity(false);
        stopSilentAudio();
        if (realHidden.call(doc)) dispatch.call(doc, new NativeEvent('visibilitychange', { bubbles: true }));
    }

    let token = null;
    function onCommand(event) {
        event.stopImmediatePropagation();
        try {
            const command = JSON.parse(event.detail);
            if (command.type === 'enable') enable(command.options);
            else if (command.type === 'disable') disable();
            else if (command.type === 'ticker') setTicker(!!command.up);
        } catch {}
    }
    function onInit(event) {
        if (token || typeof event.detail !== 'string') return;
        event.stopImmediatePropagation();
        token = event.detail;
        remove.call(win, 'tabrevive:init', onInit, true);
        add.call(win, token, onCommand, true);
        add.call(win, token + ':t', onTick, true);
        dispatch.call(doc, new NativeCustomEvent(token + ':ack'));
    }
    add.call(win, 'tabrevive:init', onInit, true);
    dispatch.call(doc, new NativeCustomEvent('tabrevive:ready'));

    try {
        if (win.parent !== win && realHidden.call(doc) && win.parent.document.hidden === false) enable();
    } catch {}
})();
