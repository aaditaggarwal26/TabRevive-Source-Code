import Link from 'next/link';
import { guides } from '../../lib/guides';

export const metadata = {
    title: 'Guides',
    description: 'Short guides on keeping Chrome tabs active: tab sleeping, background throttling, auto logout and the Page Visibility API.',
    alternates: { canonical: '/guides/' }
};

export default function Guides() {
    return (
        <main className="doc">
            <h1>Guides</h1>
            <p>How Chrome treats tabs you aren’t looking at, and what you can do about it, with or without TabRevive.</p>
            {guides.map((g) => (
                <div className="guide-item" key={g.slug}>
                    <h2><Link href={`/guides/${g.slug}/`}>{g.title}</Link></h2>
                    <p>{g.description}</p>
                </div>
            ))}
        </main>
    );
}
