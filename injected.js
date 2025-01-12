(function() {
    'use strict';

    if (window.__tabReviveMainWorld) {
        window.__tabReviveMainWorld.seenAgain = Date.now();
        return;
    }

    const state = {
        enabled: true,
        confirmed: false,
        originals: {},
        listenerMap: new WeakMap(),
        keepAliveInterval: null,
        audioContext: null,
        audioSource: null,
        wakeLock: null,
        syntheticActiveElement: null,
        syntheticFullscreenElement: null,
        syntheticPointerLockElement: null,
        lastPointerEvent: null,
        lastRealNow: 0,
        syntheticNow: 0,
        lastRealDate: 0,
        syntheticDate: 0
    };

    window.__tabReviveMainWorld = state;

    const SUPPRESSED_EVENTS = new Set([
        'visibilitychange',
        'webkitvisibilitychange',
        'blur',
        'focusout',
        'mouseleave',
        'mouseout',
        'pointerleave',
        'pointerout',
        'lostpointercapture',
        'pagehide',
        'freeze',
        'resume'
    ]);

    const ACTIVE_EVENTS = new Set([
        'focus',
        'focusin',
        'mouseenter',
        'mouseover',
        'pointerenter',
        'pointerover',
        'pageshow'
    ]);

    const POINTER_EVENTS = new Set([
        'mousemove',
        'mouseover',
        'mouseenter',
        'pointermove',
        'pointerover',
        'pointerenter'
    ]);

    function rememberOriginals() {
        const originalDate = window.Date;
        const originalPerformanceNow = window.performance && window.performance.now
            ? window.performance.now.bind(window.performance)
            : null;

        state.originals = {
            eventTargetAdd: EventTarget.prototype.addEventListener,
            eventTargetRemove: EventTarget.prototype.removeEventListener,
            hidden: Object.getOwnPropertyDescriptor(Document.prototype, 'hidden'),
            webkitHidden: Object.getOwnPropertyDescriptor(Document.prototype, 'webkitHidden'),
            visibilityState: Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState'),
            webkitVisibilityState: Object.getOwnPropertyDescriptor(Document.prototype, 'webkitVisibilityState'),
            prerendering: Object.getOwnPropertyDescriptor(Document.prototype, 'prerendering'),
            wasDiscarded: Object.getOwnPropertyDescriptor(Document.prototype, 'wasDiscarded'),
            activeElement: Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement'),
            fullscreenElement: Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement'),
            pointerLockElement: Object.getOwnPropertyDescriptor(Document.prototype, 'pointerLockElement'),
            hasFocus: Document.prototype.hasFocus,
            windowFocus: window.focus,
            windowBlur: window.blur,
            elementFocus: window.Element && Element.prototype.focus,
            elementBlur: window.Element && Element.prototype.blur,
            elementRequestFullscreen: window.Element && Element.prototype.requestFullscreen,
            documentExitFullscreen: Document.prototype.exitFullscreen,
            elementRequestPointerLock: window.Element && Element.prototype.requestPointerLock,
            documentExitPointerLock: Document.prototype.exitPointerLock,
            elementMatches: window.Element && Element.prototype.matches,
            elementClosest: window.Element && Element.prototype.closest,
            documentQuerySelector: Document.prototype.querySelector,
            elementQuerySelector: window.Element && Element.prototype.querySelector,
            getSelection: window.getSelection,
            userActivation: window.Navigator && Object.getOwnPropertyDescriptor(Navigator.prototype, 'userActivation'),
            requestAnimationFrame: window.requestAnimationFrame,
            cancelAnimationFrame: window.cancelAnimationFrame,
            requestIdleCallback: window.requestIdleCallback,
            cancelIdleCallback: window.cancelIdleCallback,
            setTimeout: window.setTimeout,
            setInterval: window.setInterval,
            clearTimeout: window.clearTimeout,
            clearInterval: window.clearInterval,
            Date: originalDate,
            dateNow: originalDate.now.bind(originalDate),
            performanceNow: originalPerformanceNow,
            AudioContext: window.AudioContext,
            webkitAudioContext: window.webkitAudioContext,
            IntersectionObserver: window.IntersectionObserver
        };

        state.lastRealNow = originalPerformanceNow ? originalPerformanceNow() : 0;
        state.syntheticNow = state.lastRealNow;
        state.lastRealDate = state.originals.dateNow();
        state.syntheticDate = state.lastRealDate;
    }

    function safeDefine(target, property, descriptor) {
        try {
            Object.defineProperty(target, property, {
                configurable: true,
                ...descriptor
            });
        } catch {}
    }

    function getOriginalDescriptorValue(descriptor, receiver, fallback) {
        if (!descriptor) return fallback;
        if (typeof descriptor.get === 'function') return descriptor.get.call(receiver);
        if ('value' in descriptor) return descriptor.value;
        return fallback;
    }

    function callListener(listener, target, event) {
        if (typeof listener === 'function') {
            return listener.call(target, event);
        }

        if (listener && typeof listener.handleEvent === 'function') {
            return listener.handleEvent(event);
        }
    }

    function shouldSuppressEvent(type, event) {
        if (!state.enabled || !SUPPRESSED_EVENTS.has(type)) return false;

        if (type === 'pagehide' && event && event.persisted === false) {
            return false;
        }

        return true;
    }

    function isValidWeakKey(val) {
        return val !== null && val !== undefined && (typeof val === 'object' || typeof val === 'function');
    }

    function wrapListener(target, type, listener) {
        if (!listener || !SUPPRESSED_EVENTS.has(type)) return listener;
        if (!isValidWeakKey(target)) return listener;

        let targetMap = state.listenerMap.get(target);
        if (!targetMap) {
            targetMap = new Map();
            state.listenerMap.set(target, targetMap);
        }

        let typeMap = targetMap.get(type);
        if (!typeMap) {
            typeMap = new WeakMap();
            targetMap.set(type, typeMap);
        }

        const existing = typeMap.get(listener);
        if (existing) return existing;

        const wrapped = function(event) {
            if (shouldSuppressEvent(type, event)) return undefined;
            return callListener(listener, this, event);
        };

        typeMap.set(listener, wrapped);
        return wrapped;
    }

    function unwrapListener(target, type, listener) {
        if (!isValidWeakKey(target)) return listener;
        const targetMap = state.listenerMap.get(target);
        const typeMap = targetMap && targetMap.get(type);
        return typeMap && typeMap.get(listener) || listener;
    }

    function installEventPatches() {
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            const eventType = String(type);
            const wrapped = wrapListener(this, eventType, listener);
            return state.originals.eventTargetAdd.call(this, eventType, wrapped, options);
        };

        EventTarget.prototype.removeEventListener = function(type, listener, options) {
            const eventType = String(type);
            const wrapped = unwrapListener(this, eventType, listener);
            return state.originals.eventTargetRemove.call(this, eventType, wrapped, options);
        };

        const blocker = function(event) {
            if (!state.enabled || !SUPPRESSED_EVENTS.has(event.type)) return;
            event.stopImmediatePropagation();
        };

        const pointerTracker = function(event) {
            if (POINTER_EVENTS.has(event.type)) {
                state.lastPointerEvent = event;
            }
        };

        SUPPRESSED_EVENTS.forEach((eventType) => {
            state.originals.eventTargetAdd.call(window, eventType, blocker, true);
            state.originals.eventTargetAdd.call(document, eventType, blocker, true);
        });

        POINTER_EVENTS.forEach((eventType) => {
            state.originals.eventTargetAdd.call(window, eventType, pointerTracker, true);
            state.originals.eventTargetAdd.call(document, eventType, pointerTracker, true);
        });

        ACTIVE_EVENTS.forEach((eventType) => {
            state.originals.eventTargetAdd.call(window, eventType, function() {}, true);
            state.originals.eventTargetAdd.call(document, eventType, function() {}, true);
        });
    }

    function installEventHandlerProperty(target, property, eventType) {
        let currentHandler = null;
        let currentWrapped = null;

        safeDefine(target, property, {
            get() {
                return currentHandler;
            },
            set(handler) {
                if (currentWrapped) {
                    state.originals.eventTargetRemove.call(target, eventType, currentWrapped, false);
                    currentWrapped = null;
                }

                currentHandler = typeof handler === 'function' || (handler && typeof handler.handleEvent === 'function')
                    ? handler
                    : null;

                if (!currentHandler) return;

                currentWrapped = function(event) {
                    if (shouldSuppressEvent(eventType, event)) return undefined;
                    return callListener(currentHandler, target, event);
                };

                state.originals.eventTargetAdd.call(target, eventType, currentWrapped, false);
            }
        });
    }

    function installVisibilityPatches() {
        safeDefine(Document.prototype, 'hidden', {
            get() {
                return state.enabled ? false : getOriginalDescriptorValue(state.originals.hidden, this, false);
            }
        });

        safeDefine(Document.prototype, 'webkitHidden', {
            get() {
                return state.enabled ? false : getOriginalDescriptorValue(state.originals.webkitHidden, this, false);
            }
        });

        safeDefine(Document.prototype, 'visibilityState', {
            get() {
                return state.enabled ? 'visible' : getOriginalDescriptorValue(state.originals.visibilityState, this, 'visible');
            }
        });

