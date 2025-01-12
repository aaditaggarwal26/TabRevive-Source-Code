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
