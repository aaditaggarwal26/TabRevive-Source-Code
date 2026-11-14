import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guides } from '../../../lib/guides';
import { STORE_URL } from '../../../lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
    return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const guide = guides.find((g) => g.slug === slug);
    if (!guide) return {};
    return {
        title: guide.title,
        description: guide.description,
        alternates: { canonical: `/guides/${guide.slug}/` },
        openGraph: { title: guide.title, description: guide.description, type: 'article' }
    };
}

export default async function Guide({ params }) {
    const { slug } = await params;
    const guide = guides.find((g) => g.slug === slug);
    if (!guide) notFound();
    const others = guides.filter((g) => g.slug !== slug);

    return (
        <main className="doc">
            <p className="small"><Link href="/guides/">Guides</Link></p>
            <h1>{guide.title}</h1>
            {guide.sections.map((section, i) => (
                <div key={i}>
                    {section.heading && <h2>{section.heading}</h2>}
                    {section.body.map((text, j) => <p key={j}>{text}</p>)}
                </div>
            ))}
            <p className="cta"><a className="get" href={STORE_URL}>Add TabRevive to Chrome, free</a></p>
            <h2>More guides</h2>
            <ul className="guide-list">
                {others.map((g) => <li key={g.slug}><Link href={`/guides/${g.slug}/`}>{g.title}</Link></li>)}
            </ul>
        </main>
    );
}
