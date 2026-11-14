import Link from 'next/link';
import { SITE_URL, STORE_URL, asset } from '../lib/site';
import './globals.css';

export const metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: 'TabRevive – Keep Chrome tabs active in the background',
        template: '%s – TabRevive'
    },
    description: 'A free Chrome extension that keeps the tabs you choose always active: prevent tab sleeping, disable tab throttling and stop auto logout when you switch away. Nothing leaves your browser.',
    icons: { icon: asset('favicon.png') },
    openGraph: { siteName: 'TabRevive', type: 'website', images: [asset('popup.png')] }
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <div className="wrap">
                    <header className="top">
                        <Link className="name" href="/"><img src={asset('logo.svg')} alt="" />TabRevive</Link>
                        <nav>
                            <Link href="/guides/">Guides</Link>
                            <Link href="/#questions">Questions</Link>
                            <Link href="/privacy/">Privacy</Link>
                        </nav>
                    </header>
                    {children}
                    <footer>
                        © 2026 Aadit Aggarwal · <Link href="/privacy/">Privacy</Link> · <Link href="/guides/">Guides</Link> · <a href={STORE_URL}>Chrome Web Store</a>
                        <br />TabRevive is not affiliated with Google. Chrome is a trademark of Google LLC.
                    </footer>
                </div>
            </body>
        </html>
    );
}
