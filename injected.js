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

        safeDefine(Document.prototype, 'webkitVisibilityState', {
            get() {
                return state.enabled ? 'visible' : getOriginalDescriptorValue(state.originals.webkitVisibilityState, this, 'visible');
            }
        });

        safeDefine(Document.prototype, 'prerendering', {
            get() {
                return state.enabled ? false : getOriginalDescriptorValue(state.originals.prerendering, this, false);
            }
        });

        safeDefine(Document.prototype, 'wasDiscarded', {
            get() {
                return state.enabled ? false : getOriginalDescriptorValue(state.originals.wasDiscarded, this, false);
            }
        });

        Document.prototype.hasFocus = function() {
            return state.enabled ? true : state.originals.hasFocus.call(this);
        };

        window.focus = function(...args) {
            if (state.enabled) {
                dispatchActiveSignals();
                return undefined;
            }

            return state.originals.windowFocus && state.originals.windowFocus.apply(this, args);
        };

        window.blur = function(...args) {
            if (state.enabled) {
                return undefined;
            }

            return state.originals.windowBlur && state.originals.windowBlur.apply(this, args);
        };

        installEventHandlerProperty(window, 'onblur', 'blur');
        installEventHandlerProperty(window, 'onfocusout', 'focusout');
        installEventHandlerProperty(window, 'onmouseleave', 'mouseleave');
        installEventHandlerProperty(window, 'onmouseout', 'mouseout');
        installEventHandlerProperty(window, 'onpointerleave', 'pointerleave');
        installEventHandlerProperty(window, 'onpointerout', 'pointerout');
        installEventHandlerProperty(window, 'onpagehide', 'pagehide');
        installEventHandlerProperty(window, 'onfreeze', 'freeze');
        installEventHandlerProperty(window, 'onresume', 'resume');
        installEventHandlerProperty(document, 'onvisibilitychange', 'visibilitychange');
        installEventHandlerProperty(document, 'onwebkitvisibilitychange', 'webkitvisibilitychange');
        installEventHandlerProperty(document, 'onmouseleave', 'mouseleave');
        installEventHandlerProperty(document, 'onmouseout', 'mouseout');
        installEventHandlerProperty(document, 'onpointerleave', 'pointerleave');
        installEventHandlerProperty(document, 'onpointerout', 'pointerout');
        installEventHandlerProperty(document, 'onlostpointercapture', 'lostpointercapture');
        installEventHandlerProperty(document, 'onfreeze', 'freeze');
        installEventHandlerProperty(document, 'onresume', 'resume');
    }

    function getRealActiveElement(documentObject) {
        return getOriginalDescriptorValue(state.originals.activeElement, documentObject, documentObject.body || documentObject.documentElement);
    }

    function getSyntheticActiveElement(documentObject) {
        const realActiveElement = getRealActiveElement(documentObject);
        if (realActiveElement && realActiveElement !== documentObject.body) {
            state.syntheticActiveElement = realActiveElement;
            return realActiveElement;
        }

        if (
            state.syntheticActiveElement &&
            state.syntheticActiveElement.ownerDocument === documentObject &&
            documentObject.contains(state.syntheticActiveElement)
        ) {
            return state.syntheticActiveElement;
        }

        return documentObject.body || documentObject.documentElement || realActiveElement;
    }

    function isFocusSelector(selector) {
        return typeof selector === 'string' && /:(focus|focus-visible|focus-within)\b/.test(selector);
    }

    function isExactFocusSelector(selector) {
        return typeof selector === 'string' && /^:(focus|focus-visible|focus-within)$/.test(selector.trim());
    }

    function installFocusPatches() {
        safeDefine(Document.prototype, 'activeElement', {
            get() {
                return state.enabled ? getSyntheticActiveElement(this) : getRealActiveElement(this);
            }
        });

        if (state.originals.fullscreenElement) {
            safeDefine(Document.prototype, 'fullscreenElement', {
                get() {
                    const realFullscreenElement = getOriginalDescriptorValue(state.originals.fullscreenElement, this, null);
                    if (!state.enabled) {
                        state.syntheticFullscreenElement = realFullscreenElement;
                        return realFullscreenElement;
                    }

                    return realFullscreenElement || (
                        state.syntheticFullscreenElement &&
                        state.syntheticFullscreenElement.ownerDocument === this &&
                        this.contains(state.syntheticFullscreenElement)
                            ? state.syntheticFullscreenElement
                            : null
                    );
                }
            });
        }

        if (state.originals.pointerLockElement) {
            safeDefine(Document.prototype, 'pointerLockElement', {
                get() {
                    const realPointerLockElement = getOriginalDescriptorValue(state.originals.pointerLockElement, this, null);
                    if (!state.enabled) {
                        state.syntheticPointerLockElement = realPointerLockElement;
                        return realPointerLockElement;
                    }

                    return realPointerLockElement || (
                        state.syntheticPointerLockElement &&
                        state.syntheticPointerLockElement.ownerDocument === this &&
                        this.contains(state.syntheticPointerLockElement)
                            ? state.syntheticPointerLockElement
                            : null
                    );
                }
            });
        }

        if (state.originals.elementFocus) {
            Element.prototype.focus = function(...args) {
                state.syntheticActiveElement = this;
                return state.originals.elementFocus.apply(this, args);
            };
        }

        if (state.originals.elementBlur) {
            Element.prototype.blur = function(...args) {
                if (state.enabled && this === getSyntheticActiveElement(this.ownerDocument || document)) {
                    return undefined;
                }

                return state.originals.elementBlur.apply(this, args);
            };
        }

        if (state.originals.elementRequestFullscreen) {
            Element.prototype.requestFullscreen = function(...args) {
                state.syntheticFullscreenElement = this;
                return state.originals.elementRequestFullscreen.apply(this, args);
            };
        }

        if (state.originals.documentExitFullscreen) {
            Document.prototype.exitFullscreen = function(...args) {
                if (state.enabled) {
                    return Promise.resolve();
                }

                state.syntheticFullscreenElement = null;
                return state.originals.documentExitFullscreen.apply(this, args);
            };
        }

        if (state.originals.elementRequestPointerLock) {
            Element.prototype.requestPointerLock = function(...args) {
                state.syntheticPointerLockElement = this;
                return state.originals.elementRequestPointerLock.apply(this, args);
            };
        }

        if (state.originals.documentExitPointerLock) {
            Document.prototype.exitPointerLock = function(...args) {
                if (state.enabled) {
                    return undefined;
                }

                state.syntheticPointerLockElement = null;
                return state.originals.documentExitPointerLock.apply(this, args);
            };
        }

        if (state.originals.elementMatches) {
            Element.prototype.matches = function(selector) {
                if (state.enabled && isFocusSelector(selector)) {
                    const activeElement = getSyntheticActiveElement(this.ownerDocument || document);
                    if (selector.includes(':focus-within') && (this === activeElement || this.contains(activeElement))) {
                        return true;
                    }

                    if ((selector.includes(':focus') || selector.includes(':focus-visible')) && this === activeElement) {
                        return true;
                    }
                }

                return state.originals.elementMatches.call(this, selector);
            };
        }

        if (state.originals.elementClosest) {
            Element.prototype.closest = function(selector) {
                if (state.enabled && isExactFocusSelector(selector)) {
                    const activeElement = getSyntheticActiveElement(this.ownerDocument || document);
                    if (selector.includes('focus-within')) {
                        return this.contains(activeElement) ? this : null;
                    }

                    return this === activeElement ? this : null;
                }

                return state.originals.elementClosest.call(this, selector);
            };
        }

        Document.prototype.querySelector = function(selector) {
            if (state.enabled && isExactFocusSelector(selector)) {
                return getSyntheticActiveElement(this);
            }

            return state.originals.documentQuerySelector.call(this, selector);
        };

        if (state.originals.elementQuerySelector) {
            Element.prototype.querySelector = function(selector) {
                if (state.enabled && isExactFocusSelector(selector)) {
                    const activeElement = getSyntheticActiveElement(this.ownerDocument || document);
                    return this.contains(activeElement) ? activeElement : null;
                }

                return state.originals.elementQuerySelector.call(this, selector);
            };
        }
    }

    function installUserActivationPatch() {
        if (!window.Navigator || !state.originals.userActivation) return;

        safeDefine(Navigator.prototype, 'userActivation', {
            get() {
                const nativeActivation = getOriginalDescriptorValue(state.originals.userActivation, this, null);
                if (!state.enabled) return nativeActivation;

                return {
                    hasBeenActive: true,
                    isActive: nativeActivation && nativeActivation.isActive || false
                };
            }
        });
    }

    function nextSyntheticPerformanceNow() {
        if (!state.originals.performanceNow) return 0;

        const realNow = state.originals.performanceNow();
        if (!state.enabled) {
            state.lastRealNow = realNow;
            state.syntheticNow = realNow;
            return realNow;
        }

        const delta = Math.max(0, realNow - state.lastRealNow);
        state.syntheticNow += Math.min(delta, 50);
        state.lastRealNow = realNow;
        return state.syntheticNow;
    }

    function nextSyntheticDateNow() {
        const realNow = state.originals.dateNow();
        if (!state.enabled) {
            state.lastRealDate = realNow;
            state.syntheticDate = realNow;
            return realNow;
        }

        const delta = Math.max(0, realNow - state.lastRealDate);
        state.syntheticDate += Math.min(delta, 50);
        state.lastRealDate = realNow;
        return Math.round(state.syntheticDate);
    }

    function installTimingPatches() {
        if (window.performance && state.originals.performanceNow) {
            safeDefine(window.performance, 'now', {
                value: function() {
                    return nextSyntheticPerformanceNow();
                }
            });

            if (window.Performance && window.Performance.prototype) {
                safeDefine(window.Performance.prototype, 'now', {
                    value: function() {
                        return nextSyntheticPerformanceNow();
                    }
                });
            }
        }

        const NativeDate = state.originals.Date;

        function TabReviveDate(...args) {
            if (this instanceof TabReviveDate) {
                if (args.length === 0) return new NativeDate(nextSyntheticDateNow());
                return new NativeDate(...args);
            }

            if (args.length === 0) return new NativeDate(nextSyntheticDateNow()).toString();
            return NativeDate(...args);
        }

        Object.getOwnPropertyNames(NativeDate).forEach((property) => {
            if (property === 'now' || property === 'prototype' || property === 'length' || property === 'name') return;

            try {
                safeDefine(TabReviveDate, property, Object.getOwnPropertyDescriptor(NativeDate, property));
            } catch {}
        });

        safeDefine(TabReviveDate, 'now', {
            value: function() {
                return nextSyntheticDateNow();
            }
        });

        TabReviveDate.prototype = NativeDate.prototype;
        Object.setPrototypeOf(TabReviveDate, NativeDate);
        window.Date = TabReviveDate;

        window.requestAnimationFrame = function(callback) {
            if (!state.enabled || !state.originals.requestAnimationFrame) {
                return state.originals.requestAnimationFrame.call(window, callback);
            }

            return state.originals.requestAnimationFrame.call(window, function(timestamp) {
                callback(typeof timestamp === 'number' ? Math.min(timestamp, nextSyntheticPerformanceNow()) : nextSyntheticPerformanceNow());
            });
        };

        if (state.originals.requestIdleCallback) {
            window.requestIdleCallback = function(callback, options) {
                if (!state.enabled) {
                    return state.originals.requestIdleCallback.call(window, callback, options);
                }

                return state.originals.setTimeout.call(window, function() {
                    callback({
                        didTimeout: false,
                        timeRemaining: function() {
                            return 50;
                        }
                    });
                }, Math.min(options && options.timeout || 16, 50));
            };
        }

        if (state.originals.cancelIdleCallback) {
            window.cancelIdleCallback = function(handle) {
                if (state.enabled) {
                    return state.originals.clearTimeout.call(window, handle);
                }

                return state.originals.cancelIdleCallback.call(window, handle);
            };
        }
    }

    function installAudioPatches() {
        function wrapAudioContext(NativeAudioContext) {
            if (!NativeAudioContext) return NativeAudioContext;

            function TabReviveAudioContext(...args) {
                const context = new NativeAudioContext(...args);
                const nativeSuspend = context.suspend && context.suspend.bind(context);

                if (nativeSuspend) {
                    context.suspend = function() {
                        if (state.enabled) return Promise.resolve();
                        return nativeSuspend();
                    };
                }

                return context;
            }

            TabReviveAudioContext.prototype = NativeAudioContext.prototype;
            Object.setPrototypeOf(TabReviveAudioContext, NativeAudioContext);
            return TabReviveAudioContext;
        }

        window.AudioContext = wrapAudioContext(state.originals.AudioContext);
        window.webkitAudioContext = wrapAudioContext(state.originals.webkitAudioContext);
    }

    function installIntersectionObserverPatch() {
        const NativeIntersectionObserver = state.originals.IntersectionObserver;
        if (!NativeIntersectionObserver) return;

        window.IntersectionObserver = function(callback, options) {
            const wrappedCallback = function(entries, observer) {
                if (state.enabled) {
                    entries.forEach((entry) => {
                        safeDefine(entry, 'intersectionRatio', { value: 1 });
                        safeDefine(entry, 'isIntersecting', { value: true });
                        safeDefine(entry, 'isVisible', { value: true });
                    });
                }

                return callback(entries, observer);
            };

            return new NativeIntersectionObserver(wrappedCallback, options);
        };

        window.IntersectionObserver.prototype = NativeIntersectionObserver.prototype;
        Object.setPrototypeOf(window.IntersectionObserver, NativeIntersectionObserver);
    }

    function createSilentAudio() {
        try {
            if (state.audioContext) return;

            const AudioContextConstructor = state.originals.AudioContext || state.originals.webkitAudioContext;
            if (!AudioContextConstructor) return;

            const context = new AudioContextConstructor();
            const buffer = context.createBuffer(1, 1, 22050);
            const source = context.createBufferSource();
            const gainNode = context.createGain();

            gainNode.gain.value = 0.0001;
            source.buffer = buffer;
            source.loop = true;
            source.connect(gainNode);
            gainNode.connect(context.destination);
            source.start(0);

            state.audioContext = context;
            state.audioSource = source;
        } catch {}
    }

    function requestWakeLock() {
        try {
            if (!navigator.wakeLock || state.wakeLock) return;

            navigator.wakeLock.request('screen').then((lock) => {
                state.wakeLock = lock;
                lock.addEventListener('release', () => {
                    state.wakeLock = null;
                    if (state.enabled) requestWakeLock();
                });
            }).catch(() => {});
        } catch {}
    }

    function dispatchActiveSignals() {
        try {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('focusin', { bubbles: true }));
        } catch {}
    }

    function resumeAllMedia() {
        try {
