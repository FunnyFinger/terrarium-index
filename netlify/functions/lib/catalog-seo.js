/**
 * Shared SEO helpers for dynamic product URLs + sitemap.
 * Catalog-driven: any new plant/supply/vivarium in Supabase is included automatically.
 */

const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://vivarium-store.com').replace(/\/$/, '');

function supabaseConfig() {
    const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const key =
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        '';
    return { base, key };
}

function toSlug(value) {
    if (value == null) return '';
    let s = typeof value === 'string'
        ? value
        : (value.scientificName || value.name || String(value));
    if (!s) return '';
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    return s
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function scientificNameString(scientificName) {
    if (!scientificName) return '';
    if (typeof scientificName === 'string') return scientificName;
    return scientificName.scientificName || scientificName.name || '';
}

/** Plants: scientific slug, else name, else id. */
function plantSlug(plant) {
    if (!plant) return '';
    return toSlug(scientificNameString(plant.scientificName)) || toSlug(plant.name) || String(plant.id);
}

/** Supplies / vivariums: name slug, else id. */
function itemSlug(item) {
    if (!item) return '';
    return toSlug(item.name) || String(item.id);
}

function isHidden(item) {
    return !!(item && item.hidden === true);
}

function resolveImageUrl(item, supabaseBase) {
    if (!item) return '';
    let u = item.imageUrl || (Array.isArray(item.images) && item.images[0]) || '';
    if (!u || typeof u !== 'string') return '';
    if (/^https?:\/\//i.test(u)) return u;
    const base = (supabaseBase || '').replace(/\/$/, '');
    if (!base) return u;
    const storagePrefix = base + '/storage/v1/object/public/vivarium-assets/';
    if (u.startsWith('/storage/')) return base + u;
    if (u.startsWith('plants/')) return storagePrefix + u;
    if (u.startsWith('images/plants/')) return storagePrefix + u.slice(7);
    if (u.startsWith('equipment/') || u.startsWith('vivariums/')) return storagePrefix + u;
    return u;
}

async function fetchCatalog(table, select) {
    const { base, key } = supabaseConfig();
    if (!base || !key) {
        const err = new Error('Supabase is not configured on Netlify (SUPABASE_URL + key)');
        err.code = 'NO_SUPABASE';
        throw err;
    }
    const path = '/rest/v1/' + table + '?select=' + encodeURIComponent(select) + '&order=id.asc';
    const res = await fetch(base + path, {
        headers: {
            apikey: key,
            Authorization: 'Bearer ' + key,
            Accept: 'application/json'
        }
    });
    if (!res.ok) {
        const err = new Error('Supabase ' + table + ' ' + res.status);
        err.code = 'SUPABASE_HTTP';
        throw err;
    }
    return res.json();
}

/** Flatten projected rows (id + data->fields) or {id,data} rows into plant-like objects. */
function normalizeRows(rows) {
    return (rows || []).map(function (r) {
        if (r && r.data && typeof r.data === 'object' && r.name == null) {
            var d = Object.assign({}, r.data);
            d.id = r.id;
            return d;
        }
        var out = Object.assign({}, r);
        if (out.id == null && r.id != null) out.id = r.id;
        return out;
    });
}

async function listPlantsLight() {
    const keys = ['name', 'scientificName', 'imageUrl', 'hidden', 'price', 'description'];
    const select = 'id,' + keys.map(function (k) { return 'data->' + k; }).join(',');
    return normalizeRows(await fetchCatalog('plants_catalog', select)).filter(function (p) {
        return p && p.id != null && !isHidden(p);
    });
}

async function listEquipmentLight() {
    const keys = ['name', 'imageUrl', 'hidden', 'price', 'description', 'category'];
    const select = 'id,' + keys.map(function (k) { return 'data->' + k; }).join(',');
    return normalizeRows(await fetchCatalog('equipment_catalog', select)).filter(function (p) {
        return p && p.id != null && !isHidden(p);
    });
}

async function listVivariumsLight() {
    const keys = ['name', 'imageUrl', 'hidden', 'price', 'description', 'type'];
    const select = 'id,' + keys.map(function (k) { return 'data->' + k; }).join(',');
    return normalizeRows(await fetchCatalog('vivariums_catalog', select)).filter(function (p) {
        return p && p.id != null && !isHidden(p);
    });
}

async function getFullById(table, id) {
    const { base, key } = supabaseConfig();
    if (!base || !key || !Number.isFinite(Number(id))) return null;
    const res = await fetch(
        base + '/rest/v1/' + table + '?id=eq.' + Number(id) + '&select=id,data',
        { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = normalizeRows(await res.json());
    return data[0] || null;
}

function escapeXml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function shopDeepLink(type, id) {
    const tab = type === 'plant' ? 'plants' : (type === 'supply' ? 'equipment' : 'vivariums');
    return '/?tab=' + tab + '&id=' + encodeURIComponent(id);
}

function publicPath(type, slug) {
    if (type === 'plant') return '/plants/' + slug;
    if (type === 'supply') return '/supplies/' + slug;
    return '/vivariums/' + slug;
}

/**
 * Resolve slug → item. Prefer exact slug; if duplicates, prefer matching id suffix `name-{id}`.
 */
function findBySlug(items, slug, slugFn) {
    if (!slug) return null;
    const exact = [];
    for (let i = 0; i < items.length; i++) {
        const s = slugFn(items[i]);
        if (s === slug) exact.push(items[i]);
        else if (s + '-' + items[i].id === slug) return items[i];
    }
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
        // Disambiguate: /plants/foo-123 style already handled; pick lowest id for stability
        exact.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
        return exact[0];
    }
    // Numeric fallback: /plants/123
    if (/^\d+$/.test(slug)) {
        const id = Number(slug);
        return items.find(function (x) { return x.id === id; }) || null;
    }
    return null;
}

/** Unique public slug (append -id when name/scientific collides). */
function uniqueSlug(item, slugFn, used) {
    let base = slugFn(item) || String(item.id);
    if (!used.has(base)) {
        used.add(base);
        return base;
    }
    const withId = base + '-' + item.id;
    used.add(withId);
    return withId;
}

module.exports = {
    SITE_ORIGIN,
    supabaseConfig,
    toSlug,
    plantSlug,
    itemSlug,
    isHidden,
    resolveImageUrl,
    listPlantsLight,
    listEquipmentLight,
    listVivariumsLight,
    getFullById,
    escapeXml,
    escapeHtml,
    shopDeepLink,
    publicPath,
    findBySlug,
    uniqueSlug,
    scientificNameString
};
