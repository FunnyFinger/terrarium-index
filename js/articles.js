/**
 * Articles list (plant-card grid) + detail + cover drag-drop for editors.
 * Loads from Supabase articles table; falls back to data/articles.json.
 */
(function () {
    'use strict';

    var articles = [];
    var listEl = document.getElementById('articlesList');
    var detailEl = document.getElementById('articleDetail');
    var emptyEl = document.getElementById('articlesEmpty');
    var countEl = document.getElementById('articlesCount');
    var addBtn = document.getElementById('articlesAddBtn');
    var listViewEl = document.getElementById('articlesListView');

    var EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

    function canEdit() {
        return !!(window.auth && typeof window.auth.canManageInventory === 'function' && window.auth.canManageInventory());
    }

    function applyShopperMode() {
        if (!document.body) return;
        if (canEdit()) document.body.classList.remove('shopper-mode');
        else document.body.classList.add('shopper-mode');
        if (addBtn) addBtn.classList.toggle('hidden', !canEdit());
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
        if (isNaN(d.getTime())) return escapeHtml(iso);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function blocksToHtml(blocks) {
        if (!Array.isArray(blocks)) return '';
        return blocks.map(function (block) {
            if (!block || !block.type) return '';
            if (block.type === 'h2') return '<h2>' + escapeHtml(block.text) + '</h2>';
            if (block.type === 'p') return '<p>' + escapeHtml(block.text) + '</p>';
            if (block.type === 'ul' && Array.isArray(block.items)) {
                return '<ul>' + block.items.map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('') + '</ul>';
            }
            return '';
        }).join('');
    }

    function normalizeArticle(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var a = Object.assign({}, raw);
        if (!a.slug && a.title) a.slug = slugify(a.title);
        if (!a.bodyHtml && Array.isArray(a.body)) a.bodyHtml = blocksToHtml(a.body);
        if (a.bodyHtml == null) a.bodyHtml = '';
        if (a.hidden == null) a.hidden = false;
        if (window.articleImages && typeof window.articleImages.assignSeedId === 'function') {
            window.articleImages.assignSeedId(a);
        }
        return a;
    }

    function slugify(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'article';
    }

    function coverUrl(article) {
        if (window.articleImages && typeof window.articleImages.coverDisplayUrl === 'function') {
            return window.articleImages.coverDisplayUrl(article);
        }
        if (!article) return '';
        var raw = article.imageUrl || article.coverImage;
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        return resolveCover(raw);
    }

    function resolveCover(path) {
        if (!path) return '';
        if (window.imageUtils && typeof window.imageUtils.resolveArticleImageUrl === 'function') {
            return window.imageUtils.resolveArticleImageUrl(path);
        }
        return path;
    }

    function sanitizeHtml(html) {
        if (!html) return '';
        if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
            return window.DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
                ADD_ATTR: ['target', 'rel', 'src', 'alt', 'class']
            });
        }
        return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    }

    function getSlugFromUrl() {
        var params = new URLSearchParams(window.location.search || '');
        return params.get('slug') || '';
    }

    function setUrlSlug(slug, replace) {
        var url = new URL(window.location.href);
        if (slug) url.searchParams.set('slug', slug);
        else url.searchParams.delete('slug');
        url.hash = '';
        var next = url.pathname + url.search;
        if (replace) history.replaceState(null, '', next);
        else history.pushState(null, '', next);
    }

    function visibleArticles() {
        return articles.filter(function (a) {
            if (!a) return false;
            if (a.hidden && !canEdit()) return false;
            return true;
        });
    }

    function createCard(article) {
        var cover = coverUrl(article);
        var hasCover = !!cover;
        var excerpt = article.excerpt || '';
        if (excerpt.length > 110) excerpt = excerpt.slice(0, 107) + '…';

        var imgHtml = hasCover
            ? '<img class="plant-image" src="' + escapeHtml(cover) + '" alt="' + escapeHtml(article.title) + '" loading="lazy" decoding="async">'
            : '<div class="image-placeholder article-cover-dropzone" data-slug="' + escapeHtml(article.slug) + '">' +
                '<span class="article-cover-drop-hint">Drop or click to add cover</span>' +
              '</div>';

        var editHtml =
            '<div class="card-icons plant-card-icons">' +
                '<button type="button" class="card-edit-icon article-card-edit" data-slug="' + escapeHtml(article.slug) + '" title="Edit article" aria-label="Edit article">' + EDIT_SVG + '</button>' +
            '</div>';

        var badges = '<div class="plant-badges">' +
            '<span class="badge">' + escapeHtml(article.category || 'Article') + '</span>' +
            (article.readMinutes ? '<span class="badge badge-muted">' + escapeHtml(article.readMinutes) + ' min</span>' : '') +
            (article.hidden ? '<span class="badge">Hidden</span>' : '') +
            '</div>';

        var card = document.createElement('div');
        card.className = 'plant-card article-plant-card' + (article.hidden ? ' product-hidden' : '');
        card.setAttribute('data-slug', article.slug);
        card.innerHTML =
            '<div class="plant-image-container article-cover-wrap" data-slug="' + escapeHtml(article.slug) + '">' +
                imgHtml +
                editHtml +
            '</div>' +
            '<div class="plant-info">' +
                '<div class="plant-name">' + escapeHtml(article.title) + '</div>' +
                '<div class="plant-scientific">' + escapeHtml(excerpt) + '</div>' +
                '<div class="article-card-date-line">' + formatDate(article.publishedAt) + '</div>' +
                badges +
            '</div>';
        return card;
    }

    function renderList() {
        if (!listEl) return;
        var list = visibleArticles();
        if (listViewEl) listViewEl.classList.remove('hidden');
        if (detailEl) {
            detailEl.classList.add('hidden');
            detailEl.innerHTML = '';
        }
        if (!list.length) {
            listEl.innerHTML = '';
            listEl.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (countEl) countEl.textContent = 'No articles yet';
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        listEl.classList.remove('hidden');
        if (countEl) countEl.textContent = list.length + ' article' + (list.length === 1 ? '' : 's');
        listEl.innerHTML = '';
        list.forEach(function (article) {
            listEl.appendChild(createCard(article));
        });
    }

    function renderDetail(article) {
        if (!detailEl || !article) return;
        if (listViewEl) listViewEl.classList.add('hidden');
        detailEl.classList.remove('hidden');
        if (countEl) countEl.textContent = article.category || 'Article';
        document.title = article.title + ' – Vivarium Store';

        var cover = coverUrl(article);
        var coverBlock = cover
            ? '<div class="article-detail-cover"><img src="' + escapeHtml(cover) + '" alt=""></div>'
            : '';

        var editLink = canEdit()
            ? '<a class="article-edit-link" href="article-edit.html?slug=' + encodeURIComponent(article.slug) + '">Edit article</a>'
            : '';

        detailEl.innerHTML =
            '<div class="article-detail-actions">' +
                '<button type="button" class="article-back-btn" id="articleBackBtn">← All articles</button>' +
                editLink +
            '</div>' +
            coverBlock +
            '<div class="article-detail-header">' +
                '<div class="article-card-meta">' +
                    '<span class="article-card-category">' + escapeHtml(article.category || 'Article') + '</span>' +
                    '<span class="article-card-date">' + formatDate(article.publishedAt) + '</span>' +
                    (article.readMinutes ? '<span class="article-card-read">' + escapeHtml(article.readMinutes) + ' min read</span>' : '') +
                '</div>' +
                '<h1 class="article-detail-title">' + escapeHtml(article.title) + '</h1>' +
                (article.excerpt ? '<p class="article-detail-excerpt">' + escapeHtml(article.excerpt) + '</p>' : '') +
            '</div>' +
            '<div class="article-detail-body">' + sanitizeHtml(article.bodyHtml) + '</div>';

        var backBtn = document.getElementById('articleBackBtn');
        if (backBtn) backBtn.addEventListener('click', function () { showList(false); });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showList(replace) {
        document.title = 'Articles – Plants & Terrariums | Vivarium Store';
        setUrlSlug('', !!replace);
        renderList();
    }

    function showArticle(slug, replace) {
        var article = articles.find(function (a) { return a.slug === slug; });
        if (!article) {
            showList(true);
            return;
        }
        setUrlSlug(slug, !!replace);
        renderDetail(article);
    }

    function routeFromUrl(replace) {
        var slug = getSlugFromUrl();
        if (slug) showArticle(slug, replace);
        else showList(true);
    }

    function findArticle(slug) {
        return articles.find(function (a) { return a.slug === slug; }) || null;
    }

    function updateLocalArticle(updated) {
        var idx = articles.findIndex(function (a) { return a.id === updated.id || a.slug === updated.slug; });
        if (idx >= 0) articles[idx] = updated;
        else articles.push(updated);
    }

    function uploadCoverFile(article, file) {
        if (!article || !file || !canEdit()) return Promise.reject(new Error('Cannot upload'));
        if (!window.articleImages || typeof window.articleImages.uploadCover !== 'function') {
            return Promise.reject(new Error('Image helpers unavailable'));
        }
        var slug = article.slug;
        if (!slug) return Promise.reject(new Error('Article slug missing'));

        return window.articleImages.uploadCover(file, slug).then(function (res) {
            var next = Object.assign({}, article, {
                coverImage: res.path,
                imageUrl: res.url,
                coverVersion: res.version
            });
            if (typeof window.supabaseDb.updateArticle === 'function' && next.id != null) {
                return window.supabaseDb.updateArticle(next.id, next).then(function () { return next; });
            }
            return next;
        }).then(function (next) {
            updateLocalArticle(next);
            renderList();
            return next;
        });
    }

    function pickCoverFile(article) {
        if (!article || !canEdit()) return;
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px;';
        document.body.appendChild(input);
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            document.body.removeChild(input);
            if (!file) return;
            uploadCoverFile(article, file).catch(function (err) {
                console.error(err);
                alert('Cover upload failed: ' + (err && err.message ? err.message : 'unknown error'));
            });
        }, { once: true });
        input.click();
    }

    function bindListEvents() {
        if (!listEl) return;
        listEl.addEventListener('click', function (e) {
            var editBtn = e.target.closest('.article-card-edit');
            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();
                var slug = editBtn.getAttribute('data-slug');
                if (slug) window.location.href = 'article-edit.html?slug=' + encodeURIComponent(slug);
                return;
            }
            var dropzone = e.target.closest('.article-cover-dropzone');
            if (dropzone && canEdit()) {
                e.preventDefault();
                e.stopPropagation();
                var slugDrop = dropzone.getAttribute('data-slug') || dropzone.closest('[data-slug]') && dropzone.closest('[data-slug]').getAttribute('data-slug');
                var art = slugDrop && findArticle(slugDrop);
                if (art) pickCoverFile(art);
                return;
            }
            var card = e.target.closest('.article-plant-card');
            if (!card) return;
            var slug2 = card.getAttribute('data-slug');
            if (slug2) showArticle(slug2, false);
        });

        listEl.addEventListener('dragover', function (e) {
            if (!canEdit()) return;
            var zone = e.target.closest('.article-cover-wrap');
            if (!zone) return;
            e.preventDefault();
            zone.classList.add('article-cover-dragover');
        });
        listEl.addEventListener('dragleave', function (e) {
            var zone = e.target.closest('.article-cover-wrap');
            if (zone) zone.classList.remove('article-cover-dragover');
        });
        listEl.addEventListener('drop', function (e) {
            if (!canEdit()) return;
            var zone = e.target.closest('.article-cover-wrap');
            if (!zone) return;
            e.preventDefault();
            zone.classList.remove('article-cover-dragover');
            var slug = zone.getAttribute('data-slug');
            var article = findArticle(slug);
            if (!article) return;
            var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file || !/^image\//.test(file.type)) return;
            zone.classList.add('article-cover-uploading');
            uploadCoverFile(article, file).catch(function (err) {
                console.error(err);
                alert('Cover upload failed: ' + (err && err.message ? err.message : 'unknown error'));
            }).finally(function () {
                zone.classList.remove('article-cover-uploading');
            });
        });
    }

    function loadFromJsonFallback() {
        return fetch('data/articles.json', { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error('Failed to load articles');
                return res.json();
            })
            .then(function (data) {
                return (Array.isArray(data && data.articles) ? data.articles : [])
                    .map(normalizeArticle)
                    .filter(Boolean);
            });
    }

    function loadArticles() {
        var db = window.supabaseDb;
        if (db && typeof db.getArticles === 'function' && db.isConfigured && db.isConfigured()) {
            return db.getArticles().then(function (rows) {
                var list = (rows || []).map(normalizeArticle).filter(Boolean);
                if (list.length) return list;
                return loadFromJsonFallback();
            }).catch(function () {
                return loadFromJsonFallback();
            });
        }
        return loadFromJsonFallback();
    }

    function sortArticles(list) {
        return list.slice().sort(function (a, b) {
            return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.body.classList.add('shopper-mode');
        applyShopperMode();
        if (window.auth && typeof window.auth.getUser === 'function') {
            window.auth.getUser().then(applyShopperMode).catch(applyShopperMode);
        }
        window.addEventListener('authStateChange', applyShopperMode);

        if (addBtn) {
            addBtn.addEventListener('click', function () {
                window.location.href = 'article-edit.html?new=1';
            });
        }

        bindListEvents();
        window.addEventListener('popstate', function () { routeFromUrl(true); });

        loadArticles()
            .then(function (list) {
                articles = sortArticles(list);
                routeFromUrl(true);
            })
            .catch(function () {
                articles = [];
                renderList();
                if (countEl) countEl.textContent = 'Could not load articles';
            });
    });
})();
