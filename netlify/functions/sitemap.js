/**
 * Dynamic sitemap.xml — rebuilt from live Supabase catalogs on each request.
 * New plants / supplies / vivariums appear automatically (hidden items excluded).
 */

const {
    SITE_ORIGIN,
    listPlantsLight,
    listEquipmentLight,
    listVivariumsLight,
    plantSlug,
    itemSlug,
    uniqueSlug,
    escapeXml,
    publicPath
} = require('./lib/catalog-seo');

const STATIC_PAGES = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/build-vivarium.html', priority: '0.8', changefreq: 'monthly' },
    { path: '/taxonomy.html', priority: '0.7', changefreq: 'monthly' },
    { path: '/definitions.html', priority: '0.6', changefreq: 'monthly' }
];

function urlEntry(loc, changefreq, priority) {
    return (
        '  <url>\n' +
        '    <loc>' + escapeXml(loc) + '</loc>\n' +
        '    <changefreq>' + changefreq + '</changefreq>\n' +
        '    <priority>' + priority + '</priority>\n' +
        '  </url>'
    );
}

exports.handler = async function () {
    try {
        const [plants, supplies, vivariums] = await Promise.all([
            listPlantsLight(),
            listEquipmentLight(),
            listVivariumsLight()
        ]);

        const parts = [];
        parts.push('<?xml version="1.0" encoding="UTF-8"?>');
        parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

        STATIC_PAGES.forEach(function (p) {
            parts.push(urlEntry(SITE_ORIGIN + p.path, p.changefreq, p.priority));
        });

        const usedPlant = new Set();
        plants.forEach(function (p) {
            const slug = uniqueSlug(p, plantSlug, usedPlant);
            parts.push(urlEntry(SITE_ORIGIN + publicPath('plant', slug), 'weekly', '0.7'));
        });

        const usedSupply = new Set();
        supplies.forEach(function (s) {
            const slug = uniqueSlug(s, itemSlug, usedSupply);
            parts.push(urlEntry(SITE_ORIGIN + publicPath('supply', slug), 'weekly', '0.6'));
        });

        const usedViv = new Set();
        vivariums.forEach(function (v) {
            const slug = uniqueSlug(v, itemSlug, usedViv);
            parts.push(urlEntry(SITE_ORIGIN + publicPath('vivarium', slug), 'weekly', '0.6'));
        });

        parts.push('</urlset>');

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600'
            },
            body: parts.join('\n')
        };
    } catch (err) {
        console.error('sitemap error', err);
        // Fail soft: return static pages only so crawlers are not broken
        const fallback = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            STATIC_PAGES.map(function (p) {
                return urlEntry(SITE_ORIGIN + p.path, p.changefreq, p.priority);
            }).join('\n'),
            '</urlset>'
        ].join('\n');
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=300'
            },
            body: fallback
        };
    }
};
