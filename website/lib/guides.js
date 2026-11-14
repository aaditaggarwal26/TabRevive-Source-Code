export const guides = [
    {
        slug: 'keep-tabs-active-chrome',
        title: 'How to keep a tab active in Chrome',
        description: 'Why Chrome slows down tabs you are not looking at, what its own settings can and can’t fix, and how to keep a tab fully active in the background.',
        sections: [
            {
                body: [
                    'If you have ever come back to a dashboard that stopped refreshing, a chat that marked you as away, or a game that paused itself, the tab was not broken. Chrome was saving resources, and the page noticed you had left.'
                ]
            },
            {
                heading: 'What Chrome does to background tabs',
                body: [
                    'The moment a tab is no longer in front, Chrome tells the page it is hidden. Pages can read that through the Page Visibility API, and plenty of them pause on purpose when they see it.',
                    'Chrome also limits how often the page’s timers can run: about once a second while hidden, and after five minutes, once a minute for timers that keep scheduling each other. Animations driven by requestAnimationFrame stop completely.',
                    'Finally, if memory runs low, Chrome may discard the tab. It stays in your tab strip, but the page is unloaded and reloads when you click it.'
                ]
            },
            {
                heading: 'What Chrome’s own settings can do',
                body: [
                    'Under Settings → Performance, Chrome has a list of sites to always keep active. Sites on that list are not discarded by Memory Saver. That is worth doing for anything you never want reloaded.',
                    'It does not change the rest: the page still learns it is hidden, and its timers are still throttled. So a site that pauses or logs you out when you switch tabs keeps doing exactly that.'
                ]
            },
            {
                heading: 'Keeping a tab fully active',
                body: [
                    'TabRevive covers all three. For a tab you protect, the page keeps seeing itself as visible and focused, its timers and animations run at full speed, and Chrome won’t discard it. Every other tab keeps behaving normally, so you only pay for the tabs that need it.',
                    'Click the TabRevive icon on the tab and choose Make Always Active, or Always keep this site active to cover every tab on that site.'
                ]
            }
        ]
    },
    {
        slug: 'prevent-tab-sleeping',
        title: 'How to stop Chrome tabs from sleeping',
        description: 'Chrome’s Memory Saver and Energy Saver put background tabs to sleep. Here is how each works, how to make exceptions, and how to keep specific tabs open and awake.',
        sections: [
            {
                body: [
                    '“Sleeping” covers two different things in Chrome, and they need different fixes.'
                ]
            },
            {
                heading: 'Memory Saver: tabs get unloaded',
                body: [
                    'With Memory Saver on, Chrome frees memory by discarding tabs you haven’t used for a while. The tab stays in the strip, but when you return the page reloads from scratch. Anything you hadn’t saved, and any place in a video or a long form, is gone.',
                    'You can add sites to the always-active list under Settings → Performance, or turn Memory Saver off entirely. The list works per site, not per tab.'
                ]
            },
            {
                heading: 'Background throttling: tabs slow down',
                body: [
                    'Even when a tab is not unloaded, Chrome throttles it once it is hidden. Timers run about once a second, and once a minute after five minutes. Animations stop. For most pages that’s fine. For live dashboards, uploads, timers or games it means the tab is effectively asleep.',
                    'There is no setting for this. Chrome has command-line switches that turn throttling off, but they apply to every tab in the browser and are meant for testing.'
                ]
            },
            {
                heading: 'Keeping chosen tabs open and awake',
                body: [
                    'TabRevive handles both for the tabs you pick: it tells Chrome not to discard them, and keeps their timers and animations running at full speed while they are in the background. It also keeps the page from seeing that you switched away, which stops sites that pause themselves when hidden.',
                    'One thing no extension can override: if Energy Saver freezes a tab, nothing runs in it until you return.'
                ]
            }
        ]
    },
    {
        slug: 'disable-tab-throttling',
        title: 'How to disable background tab throttling in Chrome',
        description: 'What Chrome’s timer throttling does to hidden tabs, why the old flags are not a good answer, and how to turn throttling off for just the tabs that need it.',
        sections: [
            {
                body: [
                    'Background tab throttling is the reason a page that updates every second suddenly updates once a minute after you leave it for a while.'
                ]
            },
            {
                heading: 'How the throttling works',
                body: [
                    'When a page becomes hidden, Chrome caps its timers. setTimeout and setInterval callbacks are bundled so they run at most about once per second. After the page has been hidden for five minutes, timers that keep re-scheduling themselves are bundled further and run about once per minute. requestAnimationFrame stops entirely, because nothing is being drawn.',
                    'We measured this in Chrome with a test page: a 100 ms timer ran ten times a second in front, about once a second in the background, and zero times in a 30-second window after five minutes hidden.'
                ]
            },
            {
                heading: 'The browser-wide switches',
                body: [
                    'Chrome can be started with switches such as --disable-background-timer-throttling. They exist for automated testing, they affect every tab and window, they have to be added to how Chrome is launched, and they cost battery everywhere. Most people should not use them.'
                ]
            },
            {
                heading: 'Per-tab instead',
                body: [
                    'TabRevive turns throttling off only for the tabs you protect. While such a tab is hidden, its timers and animation frames are driven by the extension at full speed, which Chrome doesn’t throttle. When you come back, the page’s own timers take over again.',
                    'If you protect many heavy tabs and want to save power, you can switch off Aggressive Mode in the settings: the tabs still stay visible to the page and won’t be discarded, but their timers slow down like normal.'
                ]
            }
        ]
    },
    {
        slug: 'stop-auto-logout',
        title: 'Why sites log you out when you switch tabs, and how to stop it',
        description: 'Some web apps sign you out or mark you as away when you leave their tab. Here is how they detect it and how to keep a session alive while you work elsewhere.',
        sections: [
            {
                body: [
                    'Getting signed out of a web app while you were in another tab for ten minutes is annoying, especially when you were still working.'
                ]
            },
            {
                heading: 'Two kinds of auto logout',
                body: [
                    'The first kind watches the tab itself. The page listens for the browser telling it that it is hidden or has lost focus, and starts a countdown, pauses, or marks you as away. Chrome slowing the page’s timers can make this worse, because a session keep-alive that should run every minute no longer runs on time.',
                    'The second kind watches you. The site counts how long it has been since you last moved the mouse, clicked or typed on that page, whether or not the tab is in front.'
                ]
            },
            {
                heading: 'Stopping the first kind',
                body: [
                    'Protect the tab with TabRevive. The page keeps seeing itself as visible and focused, receives no tab-switch events, and its timers keep running on schedule, so its keep-alive requests go out as intended.'
                ]
            },
            {
                heading: 'The second kind',
                body: [
                    'For sites that time out on inactivity, turn on Simulate Activity in TabRevive’s settings. It sends a small mouse movement to protected tabs every 30 seconds.',
                    'Some organisations log you out on purpose, for security. If it is your employer’s or your bank’s system, check that keeping the session open is allowed.'
                ]
            }
        ]
    },
    {
        slug: 'keep-tabs-always-visible',
        title: 'Keeping a tab “visible” to the page when it is in the background',
        description: 'How web pages know you switched tabs (the Page Visibility API, focus and blur), and how to keep a background tab looking visible and focused to the page.',
        sections: [
            {
                body: [
                    'A web page can tell, at any moment, whether you are looking at it. That is how videos pause, games freeze and chats mark you as away the instant you switch tabs.'
                ]
            },
            {
                heading: 'How pages find out',
                body: [
                    'The Page Visibility API gives every page document.hidden and document.visibilityState, plus a visibilitychange event that fires when you switch away or come back. Pages also get blur and focus events on the window, and can ask document.hasFocus() at any time. Chrome additionally records visibility changes in the page’s performance timeline.',
                    'None of these need permission. Any site can use them.'
                ]
            },
            {
                heading: 'Making a tab look always visible',
                body: [
                    'For a tab you protect, TabRevive answers those questions as if the tab were still in front: visible, focused. The events that would only fire because you left or came back are not delivered, so the page has nothing to react to. In-page focus changes, like moving between text fields, still work normally.',
                    'Chrome still stops drawing a page you can’t see, so CSS animations pause and checks for what is on screen report nothing. Leaving full screen by switching tabs is also visible to the page. These are browser limits no extension can change.'
                ]
            }
        ]
    }
];
