/**
 * Dynamic product landing pages for /plants/:slug, /supplies/:slug, /vivariums/:slug.
 * Served from live catalog — new items work with no deploy.
 *
 * Query (from Netlify redirect): type=plant|supply|vivarium&slug=...
 */

const {
    SITE_ORIGIN,
    supabaseConfig,
    listPlantsLight,
    listEquipmentLight,
    listVivariumsLight,
    getFullById,
    plantSlug,
    itemSlug,
    findBySlug,
    uniqueSlug,
    resolveImageUrl,
    escapeHtml,
    shopDeepLink,
    publicPath,
    scientificNameString
} = require('./lib/catalog-seo');

function parseTypeSlug(event) {
    const q = event.queryStringParameters || {};
    let type = (q.type || '').toLowerCase();
    let slug = (q.slug || '').toLowerCase();

    // Fallback: parse from path (/plants/foo)
    const path = (event.path || event.rawUrl || '').toString();
    const m = path.match(/\/(plants|supplies|vivariums)\/([^/?#]+)/i);
    if (m) {
        if (!type) {
            type = m[1] === 'plants' ? 'plant' : (m[1] === 'supplies' ? 'supply' : 'vivarium');
        }
        if (!slug) slug = decodeURIComponent(m[2]).toLowerCase();
    }
    return { type, slug };
}

function notFoundHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Not found – Vivarium Store</title>
  <link rel="stylesheet" href="/styles.css?v=9">
</head>
<body>
  <main style="max-width:36rem;margin:4rem auto;padding:0 1.5rem;text-align:center">
    <h1>Item not found</h1>
    <p>This plant, supply, or vivarium is not in the catalog (or is hidden).</p>
    <p><a href="/">Browse the shop</a></p>
  </main>
</body>
</html>`;
}

function buildProductHtml(opts) {
    const {
        type, item, slug, canonical, image, title, description, price, shopUrl, scientific
    } = opts;
    const typeLabel = type === 'plant' ? 'Plant' : (type === 'supply' ? 'Supply' : 'Vivarium');
    const absImage = image || (SITE_ORIGIN + '/images/banner.jpg');
    const desc = (description || title + ' available at Vivarium Store in Kuwait.').slice(0, 300);
    const priceNum = price != null && !isNaN(Number(price)) ? Number(price) : null;

    const productLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: title,
        description: desc,
        image: absImage,
        url: canonical,
        brand: { '@type': 'Brand', name: 'Vivarium Store' },
        category: typeLabel
    };
    if (scientific) productLd.alternateName = scientific;
    if (priceNum != null) {
        productLd.offers = {
            '@type': 'Offer',
            priceCurrency: 'KWD',
            price: priceNum.toFixed(3),
            availability: 'https://schema.org/InStock',
            url: canonical
        };
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} – Vivarium Store</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)} – Vivarium Store">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:image" content="${escapeHtml(absImage)}">
  <meta property="og:site_name" content="Vivarium Store">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(absImage)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/styles.css?v=9">
  <script type="application/ld+json">${JSON.stringify(productLd).replace(/</g, '\\u003c')}</script>
  <style>
    .seo-product { max-width: 40rem; margin: 3rem auto 4rem; padding: 0 1.25rem; }
    .seo-product img { width: 100%; max-height: 360px; object-fit: cover; border-radius: 12px; background: #eee; }
    .seo-product h1 { font-family: Georgia, "DM Serif Display", serif; color: var(--primary-color, #2d5016); margin: 1rem 0 0.35rem; }
    .seo-product .sci { font-style: italic; color: #666; margin: 0 0 1rem; }
    .seo-product .price { font-weight: 700; font-size: 1.15rem; margin: 0 0 1rem; }
    .seo-product .cta { display: inline-block; padding: 0.75rem 1.25rem; background: var(--primary-color, #2d5016); color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .seo-product .cta:hover { filter: brightness(1.08); }
    .seo-product .meta { color: #666; font-size: 0.9rem; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <main class="seo-product">
    ${absImage ? '<img src="' + escapeHtml(absImage) + '" alt="' + escapeHtml(title) + '">' : ''}
    <p class="meta">${escapeHtml(typeLabel)} · Vivarium Store</p>
    <h1>${escapeHtml(title)}</h1>
    ${scientific ? '<p class="sci">' + escapeHtml(scientific) + '</p>' : ''}
    ${priceNum != null ? '<p class="price">KD ' + priceNum.toFixed(3) + '</p>' : ''}
    <p>${escapeHtml(desc)}</p>
    <p style="margin-top:1.5rem"><a class="cta" href="${escapeHtml(shopUrl)}">View in shop</a></p>
    <p class="meta"><a href="/">All products</a></p>
  </main>
  <script>
    // Humans land in the interactive shop; crawlers keep this HTML for meta/JSON-LD.
    (function () {
      var ua = navigator.userAgent || '';
      if (/bot|crawl|spider|slurp|facebookexternalhit|preview|whatsapp|telegram|discord|linkedin/i.test(ua)) return;
      var target = ${JSON.stringify(shopUrl)};
      if (target) window.location.replace(target);
    })();
  </script>
</body>
</html>`;
}

exports.handler = async function (event) {
    const { type, slug } = parseTypeSlug(event);
    if (!type || !slug || ['plant', 'supply', 'vivarium'].indexOf(type) === -1) {
        return { statusCode: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: notFoundHtml() };
    }

    try {
        let listFn, slugFn, table, list;
        if (type === 'plant') {
            listFn = listPlantsLight;
            slugFn = plantSlug;
            table = 'plants_catalog';
        } else if (type === 'supply') {
            listFn = listEquipmentLight;
            slugFn = itemSlug;
            table = 'equipment_catalog';
        } else {
            listFn = listVivariumsLight;
            slugFn = itemSlug;
            table = 'vivariums_catalog';
        }

        list = await listFn();
        // Build unique slugs the same way as the sitemap
        const used = new Set();
        const withSlugs = list.map(function (item) {
            return { item: item, slug: uniqueSlug(item, slugFn, used) };
        });
        let match = withSlugs.find(function (x) { return x.slug === slug; });
        if (!match) {
            const byRaw = findBySlug(list, slug, slugFn);
            if (byRaw) match = { item: byRaw, slug: slug };
        }
        if (!match) {
            return { statusCode: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: notFoundHtml() };
        }

        let item = match.item;
        const full = await getFullById(table, item.id);
        if (full) item = full;

        const { base } = supabaseConfig();
        const title = item.name || scientificNameString(item.scientificName) || (type + ' ' + item.id);
        const scientific = type === 'plant' ? scientificNameString(item.scientificName) : '';
        const image = resolveImageUrl(item, base);
        const canonical = SITE_ORIGIN + publicPath(type, match.slug);
        const shopUrl = shopDeepLink(type, item.id);
        const description = (item.description && String(item.description).trim()) || '';

        const html = buildProductHtml({
            type,
            item,
            slug: match.slug,
            canonical,
            image,
            title,
            description,
            price: item.price,
            shopUrl,
            scientific
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=600'
            },
            body: html
        };
    } catch (err) {
        console.error('product-page error', err);
        return {
            statusCode: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '<!DOCTYPE html><html><body><p>Catalog temporarily unavailable. <a href="/">Back to shop</a></p></body></html>'
        };
    }
};
