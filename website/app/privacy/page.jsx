export const metadata = {
    title: 'Privacy policy',
    description: 'TabRevive collects no data and makes no network requests. Everything it stores stays in your browser.',
    alternates: { canonical: '/privacy/' }
};

export default function Privacy() {
    return (
        <main className="doc">
            <h1>Privacy policy</h1>
            <p className="small">Last updated 14 November 2026. Applies to the TabRevive extension for Chrome.</p>

            <h2>The short version</h2>
            <p>TabRevive does not collect, send, sell or share any information about you. It makes no network requests. Everything it needs is stored in your own browser.</p>

            <h2>What is stored, and where</h2>
            <p>To work, TabRevive keeps the following in your browser’s extension storage on your computer:</p>
            <ul>
                <li>the tabs you’ve chosen to keep active: their title, address and icon, so the popup can list them and protection can be restored after a restart;</li>
                <li>the sites you’ve set to always keep active;</li>
                <li>your settings and appearance choices, including any background image you upload;</li>
                <li>simple counters, such as how many times you’ve protected a tab, shown on the settings page and used to decide when to ask once for a rating.</li>
            </ul>
            <p>None of this is sent to the developer or anyone else. You can delete it at any time with <strong>Clear All Data</strong> in the settings, or by removing the extension.</p>

            <h2>Permissions</h2>
            <ul>
                <li><strong>Tabs</strong>: to read the title and address of tabs so they can be listed and matched to your site list.</li>
                <li><strong>Access to all websites</strong>: so you can keep a tab active on any site. The extension stays inactive on tabs you haven’t chosen.</li>
                <li><strong>Storage</strong>: to save the items listed above in your browser.</li>
                <li><strong>Scripting</strong>: to start protection in tabs that were already open.</li>
                <li><strong>Notifications</strong>: to confirm keyboard shortcuts. You can turn these off.</li>
                <li><strong>Alarms</strong> and <strong>offscreen</strong>: to keep protected tabs’ timers running and tidy up closed tabs.</li>
            </ul>

            <h2>Third parties</h2>
            <p>TabRevive contains no analytics, advertising or tracking code, and loads no code from the internet.</p>

            <h2>Changes</h2>
            <p>If this policy changes, the new version will be posted on this page with a new date.</p>

            <h2>Contact</h2>
            <p>Questions about privacy: use the Support tab on the TabRevive page in the Chrome Web Store.</p>
        </main>
    );
}
