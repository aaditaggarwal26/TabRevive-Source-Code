import { SITE_URL } from '../lib/site';
import { guides } from '../lib/guides';

export const dynamic = 'force-static';

export default function sitemap() {
    const pages = ['', 'guides/', 'privacy/', ...guides.map((g) => `guides/${g.slug}/`)];
    return pages.map((p) => ({ url: `${SITE_URL}/${p}`, lastModified: new Date('2026-11-14') }));
}
