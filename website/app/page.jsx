import Link from 'next/link';
import { STORE_URL, asset } from '../lib/site';
import { guides } from '../lib/guides';

const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TabRevive',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome',
    description: 'Chrome extension that keeps chosen tabs always active and visible in the background.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
};

export default function Home() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />

            <div className="intro">
                <div>
                    <h1>Keep a tab working after you switch away.</h1>
                    <p className="lede">Chrome slows down tabs you aren’t looking at, and many sites pause or log you out the moment you leave. TabRevive keeps the tabs you pick always active, as if they were still in front of you.</p>
                    <a className="get" href={STORE_URL}>Add to Chrome, free</a>
                    <p className="small">Used by over 4,000 people. No account, nothing to set up.</p>
                </div>
                <figure className="shot">
                    <img src={asset('popup.png')} alt="The TabRevive popup on a protected tab" width="300" height="520" />
                    <figcaption>The popup on a protected tab.</figcaption>
                </figure>
            </div>

            <section>
                <h2>Why tabs stop working</h2>
                <p>When you switch to another tab, Chrome tells the page it’s hidden and cuts back how often its code can run: timers drop to once a second, then once a minute after five minutes, and animations stop. If memory gets tight, Chrome may unload the tab completely.</p>
                <p>That’s sensible for most tabs. It’s a problem for a dashboard that should keep refreshing, a long upload, a chat that marks you as away, or a game that pauses the second you look elsewhere.</p>
            </section>

            <section>
                <h2>What it does</h2>
                <p>For each tab you protect:</p>
                <dl>
                    <dt>The page thinks you never left.</dt>
                    <dd>It stays always visible and focused to the page, with no tab-switch events, not when you leave and not when you come back.</dd>
                    <dt>No tab throttling.</dt>
                    <dd>Timers and animations keep full speed, even after hours in the background.</dd>
                    <dt>No tab sleeping.</dt>
                    <dd>Chrome won’t unload it, so you come back to the page exactly as you left it.</dd>
                    <dt>Everything else is untouched.</dt>
                    <dd>Only the tabs you choose are affected. The rest of your browser behaves normally.</dd>
                </dl>
            </section>

            <section id="how">
                <h2>How to use it</h2>
                <ol>
                    <li>Open the tab you want to keep running and click the TabRevive icon.</li>
                    <li>Click <strong>Make Always Active</strong>. Or click <strong>Always keep this site active</strong> to cover every tab you open on that site.</li>
                    <li>Switch tabs as usual.</li>
                </ol>
                <p>Shortcuts: <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>A</kbd> toggles the current tab, <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>D</kbd> turns everything off. On a Mac use <kbd>⌘</kbd> instead of <kbd>Ctrl</kbd>.</p>
                <p>Protected tabs are remembered after you restart Chrome.</p>
            </section>

            <section>
                <h2>What it can’t do</h2>
                <p>Some things are decided by Chrome itself: it stops drawing a page you can’t see, so CSS animations and on-screen checks pause. Leaving full screen by switching tabs is visible to the page. And if Chrome’s Energy Saver freezes a tab, nothing runs in it.</p>
                <p>Sites that log you out after a period without any clicks or typing use their own timers. For those, turn on <strong>Simulate Activity</strong> in the settings.</p>
            </section>

            <section>
                <h2>Guides</h2>
                <ul className="guide-list">
                    {guides.map((g) => (
                        <li key={g.slug}><Link href={`/guides/${g.slug}/`}>{g.title}</Link></li>
                    ))}
                </ul>
            </section>

            <section id="questions">
                <h2>Questions</h2>
                <details>
                    <summary>Is it free?</summary>
                    <p>Yes. No ads, no paid version.</p>
                </details>
                <details>
                    <summary>Does it collect any data?</summary>
                    <p>No. It makes no network requests at all. Your list of tabs and your settings are stored in your browser and never leave it. See the <Link href="/privacy/">privacy policy</Link>.</p>
                </details>
                <details>
                    <summary>Why does it ask for access to all websites?</summary>
                    <p>Because you can protect a tab on any site, the extension has to be able to run there. It stays inactive on every tab you haven’t protected.</p>
                </details>
                <details>
                    <summary>Will it slow my computer down?</summary>
                    <p>Protected tabs use about as much as they would if they were in front of you, since that’s the point. Unprotected tabs aren’t affected. If you protect a lot of heavy tabs, turn off <strong>Aggressive Mode</strong> in the settings to let their timers slow down while keeping everything else.</p>
                </details>
                <details>
                    <summary>Which languages does it support?</summary>
                    <p>English, Spanish, Portuguese, German, French, Japanese, Russian, Indonesian, Hindi, Turkish, Korean and Chinese (Simplified). It follows your Chrome language.</p>
                </details>
                <details>
                    <summary>Something isn’t working on a site.</summary>
                    <p>Please tell me through the Support tab on the Chrome Web Store page, with the site and what you expected. I read everything.</p>
                </details>
            </section>
        </>
    );
}
