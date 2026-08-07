/**
 * Articles list + detail for articles.html
 * Data: data/articles.json
 */
(function () {
    'use strict';

    var articles = [];
    var listEl = document.getElementById('articlesList');
    var detailEl = document.getElementById('articleDetail');
    var emptyEl = document.getElementById('articlesEmpty');
    var countEl = document.getElementById('articlesCount');

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) return escapeHtml(iso);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function getSlugFromUrl() {
        var params = new URLSearchParams(window.location.search || '');
        var slug = params.get('slug') || '';
        if (slug) return slug;
        var hash = (window.location.hash || '').replace(/^#/, '');
        if (hash.indexOf('article=') === 0) return hash.slice(8);
        return hash || '';
    }

    function setUrlSlug(slug, replace) {
        var url = new URL(window.location.href);
        if (slug) {
            url.searchParams.set('slug', slug);
        } else {
            url.searchParams.delete('slug');
        }
        url.hash = '';
        if (replace) {
            history.replaceState(null, '', url.pathname + url.search);
        } else {
            history.pushState(null, '', url.pathname + url.search);
        }
    }

    function renderBody(blocks) {
        if (!Array.isArray(blocks)) return '';
        return blocks.map(function (block) {
            if (!block || !block.type) return '';
            if (block.type === 'h2') {
                return '<h2 class="article-body-h2">' + escapeHtml(block.text) + '</h2>';
            }
            if (block.type === 'p') {
                return '<p class="article-body-p">' + escapeHtml(block.text) + '</p>';
            }
            if (block.type === 'ul' && Array.isArray(block.items)) {
                var items = block.items.map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('');
                return '<ul class="article-body-ul">' + items + '</ul>';
            }
            return '';
        }).join('');
    }

    function renderList() {
        if (!listEl) return;
        if (!articles.length) {
            listEl.innerHTML = '';
            listEl.classList.add('hidden');
            if (detailEl) detailEl.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (countEl) countEl.textContent = 'No articles yet';
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (detailEl) detailEl.classList.add('hidden');
        listEl.classList.remove('hidden');
        if (countEl) {
            countEl.textContent = articles.length + ' article' + (articles.length === 1 ? '' : 's');
        }
        listEl.innerHTML = articles.map(function (article) {
            return (
                '<article class="article-card">' +
                    '<a class="article-card-link" href="articles.html?slug=' + encodeURIComponent(article.slug) + '" data-slug="' + escapeHtml(article.slug) + '">' +
                        '<div class="article-card-meta">' +
                            '<span class="article-card-category">' + escapeHtml(article.category || 'Article') + '</span>' +
                            '<span class="article-card-date">' + formatDate(article.publishedAt) + '</span>' +
                            (article.readMinutes ? '<span class="article-card-read">' + escapeHtml(article.readMinutes) + ' min read</span>' : '') +
                        '</div>' +
                        '<h2 class="article-card-title">' + escapeHtml(article.title) + '</h2>' +
                        '<p class="article-card-excerpt">' + escapeHtml(article.excerpt || '') + '</p>' +
                        '<span class="article-card-cta">Read article</span>' +
                    '</a>' +
                '</article>'
            );
        }).join('');
    }

    function renderDetail(article) {
        if (!detailEl || !article) return;
        if (listEl) listEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        detailEl.classList.remove('hidden');
        if (countEl) countEl.textContent = article.category || 'Article';
        document.title = article.title + ' – Vivarium Store';
        detailEl.innerHTML =
            '<button type="button" class="article-back-btn" id="articleBackBtn">← All articles</button>' +
            '<header class="article-detail-header">' +
                '<div class="article-card-meta">' +
                    '<span class="article-card-category">' + escapeHtml(article.category || 'Article') + '</span>' +
                    '<span class="article-card-date">' + formatDate(article.publishedAt) + '</span>' +
                    (article.readMinutes ? '<span class="article-card-read">' + escapeHtml(article.readMinutes) + ' min read</span>' : '') +
                '</div>' +
                '<h1 class="article-detail-title">' + escapeHtml(article.title) + '</h1>' +
                (article.excerpt ? '<p class="article-detail-excerpt">' + escapeHtml(article.excerpt) + '</p>' : '') +
            '</header>' +
            '<div class="article-detail-body">' + renderBody(article.body) + '</div>';

        var backBtn = document.getElementById('articleBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                showList(false);
            });
        }
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

    function bindListClicks() {
        if (!listEl) return;
        listEl.addEventListener('click', function (e) {
            var link = e.target.closest('a[data-slug]');
            if (!link) return;
            e.preventDefault();
            showArticle(link.getAttribute('data-slug'), false);
        });
    }

    function loadArticles() {
        return fetch('data/articles.json', { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error('Failed to load articles');
                return res.json();
            })
            .then(function (data) {
                articles = Array.isArray(data && data.articles) ? data.articles.slice() : [];
                articles.sort(function (a, b) {
                    return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
                });
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindListClicks();
        window.addEventListener('popstate', function () {
            routeFromUrl(true);
        });
        loadArticles()
            .then(function () { routeFromUrl(true); })
            .catch(function () {
                articles = [];
                renderList();
                if (countEl) countEl.textContent = 'Could not load articles';
            });
    });
})();
