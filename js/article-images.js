/**
 * Shared article image helpers: auth-gated upload + URL resolution.
 */
(function (global) {
    'use strict';

    var SEED_ARTICLE_IDS = {
        'closed-terrarium-basics': 70001,
        'vivarium-substrate-guide': 70002,
        'humidity-and-airflow': 70003,
        'lighting-tropical-plants': 70004,
        'paludarium-intro': 70005
    };

    function resolvePath(path) {
        if (!path || typeof path !== 'string') return '';
        if (window.imageUtils && typeof window.imageUtils.resolveArticleImageUrl === 'function') {
            return window.imageUtils.resolveArticleImageUrl(path);
        }
        return path;
    }

    function coverDisplayUrl(article) {
        if (!article) return '';
        var raw = article.imageUrl || article.coverImage;
        if (!raw) return '';
        var url = /^https?:\/\//i.test(raw) ? raw : resolvePath(raw);
        if (!url) return '';
        if (article.coverVersion) {
            url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(String(article.coverVersion));
        }
        return url;
    }

    function assignSeedId(article) {
        if (!article || article.id != null || !article.slug) return article;
        if (SEED_ARTICLE_IDS[article.slug]) article.id = SEED_ARTICLE_IDS[article.slug];
        return article;
    }

    function ensureAuth() {
        return new Promise(function (resolve, reject) {
            function tokenReady() {
                return global.supabaseAuth &&
                    typeof global.supabaseAuth.getAccessToken === 'function' &&
                    global.supabaseAuth.getAccessToken();
            }
            if (tokenReady()) return resolve(tokenReady());
            if (global.supabaseAuth && typeof global.supabaseAuth.getCurrentUser === 'function') {
                return global.supabaseAuth.getCurrentUser().then(function (user) {
                    if (!user) return reject(new Error('Sign in as owner or admin to upload images'));
                    if (tokenReady()) return resolve(tokenReady());
                    return reject(new Error('Session not ready — wait a moment and try again'));
                }).catch(function () {
                    reject(new Error('Sign in as owner or admin to upload images'));
                });
            }
            reject(new Error('Sign in to upload images'));
        });
    }

    function fileExt(file) {
        var ext = (file && file.name && file.name.split('.').pop()) ? file.name.split('.').pop().toLowerCase() : 'jpg';
        if (ext === 'jpeg') ext = 'jpg';
        if (!/^(jpg|png|gif|webp)$/.test(ext)) ext = 'jpg';
        return ext;
    }

    function upload(file, slug, filename) {
        if (!file || !slug || !filename) return Promise.reject(new Error('Missing upload parameters'));
        if (!global.supabaseDb || typeof global.supabaseDb.uploadToStorage !== 'function') {
            return Promise.reject(new Error('Storage unavailable'));
        }
        var objectPath = 'articles/' + slug + '/' + filename;
        return ensureAuth().then(function () {
            return global.supabaseDb.uploadToStorage(file, objectPath);
        }).then(function (publicUrl) {
            return {
                path: objectPath,
                url: publicUrl,
                version: Date.now()
            };
        });
    }

    function uploadCover(file, slug) {
        return upload(file, slug, 'cover.' + fileExt(file));
    }

    global.articleImages = {
        SEED_ARTICLE_IDS: SEED_ARTICLE_IDS,
        assignSeedId: assignSeedId,
        coverDisplayUrl: coverDisplayUrl,
        resolvePath: resolvePath,
        ensureAuth: ensureAuth,
        upload: upload,
        uploadCover: uploadCover
    };
})(typeof window !== 'undefined' ? window : this);
