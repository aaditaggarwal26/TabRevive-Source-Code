# TabRevive

TabRevive is a Chrome extension designed to keep browser tabs active, prevent tab suspension, and preserve web app sessions while the tab is in the background.

## How it works

TabRevive uses a combination of background service logic and injected page-level shims to keep tabs appearing active to websites.

- `background.js` runs as the extension service worker. It tracks tabs marked as "always active," manages storage, updates the badge, handles keyboard commands, and triggers keep-alive actions over time.
- `content.js` is injected into all pages to bootstrap tab monitoring, forward tab status queries to the background worker, and keep performance metrics up to date.
- `injected.js` is the main page-level keep-alive shim that runs in the page's main world. It patches the browser visibility, focus, timing, media, audio, and intersection APIs so pages continue to behave as if the tab is active.
- `popup.html` and `popup.js` provide the UI for toggling active tab protection, viewing current tab stats, and managing active tabs.
- `settings.html` and `settings.js` provide extended user settings, including aggressive mode, performance monitoring, auto refresh, and data management.

## Key behaviors

- When a tab is marked as always active, `background.js` stores that tab in `chrome.storage.local` and sends messages to the content script.
- The content script notifies the injected page script to enable keep-alive behavior.
- The injected script intercepts key browser APIs that are normally used to detect tab visibility or inactivity:
  - `document.hidden` / `document.visibilityState`
  - `window.requestAnimationFrame` / `performance.now`
  - focus/blur event handlers and `document.hasFocus()`
  - HTML media pause behavior and media session state
  - `IntersectionObserver` results
  - audio context suspension and optional wake lock handling
- The extension keeps a lightweight heartbeat loop running inside the page and periodically updates performance stats back to the extension.

## Architecture

### Manifest

`manifest.json` declares:

- `action.default_popup` for the popup UI
- `background.service_worker` as the extension worker
- `content_scripts` for both `content.js` and `injected.js`
- host permissions for all URLs so the extension can run on any tab
- permissions: `tabs`, `activeTab`, `storage`, `scripting`, and `notifications`

### Background service

`background.js` includes:

- install/setup handling
- tab activation and deactivation tracking
- badge updates and notification generation
- performance statistics and cleanup intervals
- keyboard shortcut commands to toggle the current tab or disable all tabs
- automatic refresh and battery/idle safeguards when configured

### Content script

`content.js` does lightweight page bootstrapping:

- asks the background worker if the current tab should stay active
- forwards enable/disable messages to the injected page
- monitors page visibility and reports tab status

### Injected page shim

`injected.js` is the core keep-alive logic. It:

- preserves original API references from the page
- patches event listeners for visibility/focus and blocks suppressed events
- overrides visibility state getters to return `visible`
- keeps `document.activeElement` and focus selectors consistent
- adjusts `window.performance.now()` and `Date.now()` to remain active
- produces silent audio and wake lock requests to prevent browser throttling
- maintains a keep-alive loop and dispatches active signals to the page

## UI and settings

The popup UI lets users:

- enable or disable always-active protection for the current tab
- see the current active tab state and memory usage
- refresh or mute all active tabs
- export the current active tab list
- open the settings page

The settings page includes:

- aggressive mode and heartbeat tuning
- performance and memory monitoring controls
- auto refresh frequency and battery-safe disable options
- settings import/export and global data reset actions

## Data storage

TabRevive stores state in `chrome.storage.local`:

- `alwaysActiveTabs` holds tab metadata and active state
- `extensionSettings` stores user preferences
- `extensionStats` stores usage metrics and aggregates

## Notes

- The extension is built for Chrome Manifest V3.
- The extension never uploads browsing data; it only stores local tab state and settings.
- The design separates page-shim behavior from extension control logic so the page remains active even while the browser normally throttles background tabs.

## File overview

- `background.js` — service worker, tab management, commands, metrics
- `content.js` — content script bootstrap, page messaging
- `injected.js` — page-level keep-alive patching
- `popup.html` / `popup.js` — popup UI for active tab control
- `settings.html` / `settings.js` — settings and statistics UI
- `manifest.json` — extension declaration and permissions
- `README.md` — this document
- `chrome-store-listing.md` — Chrome Web Store marketing copy
