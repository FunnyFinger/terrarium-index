/**
 * Full article editor (Quill) — create / update / delete.
 * Gated by auth.canManageInventory().
 */
(function () {
    'use strict';

    var quill = null;
    var current = null;
    var isNew = false;
    var slugManual = false;

    var form = document.getElementById('articleEditForm');
    var gate = document.getElementById('articleEditGate');
    var statusEl = document.getElementById('articleEditStatus');
    var titleEl = document.getElementById('articleTitle');
    var slugEl = document.getElementById('articleSlug');
    var categoryEl = document.getElementById('articleCategory');
    var publishedEl = document.getElementById('articlePublishedAt');
    var readEl = document.getElementById('articleReadMinutes');
    var hiddenEl = document.getElementById('articleHidden');
    var excerptEl = document.getElementById('articleExcerpt');
    var coverPreview = document.getElementById('articleCoverPreview');
    var coverFile = document.getElementById('articleCoverFile');
    var coverClearBtn = document.getElementById('articleCoverClearBtn');
    var saveBtn = document.getElementById('articleSaveBtn');
    var deleteBtn = document.getElementById('articleDeleteBtn');

    function canEdit() {
        return !!(window.auth && typeof window.auth.canManageInventory === 'function' && window.auth.canManageInventory());
    }

    var statusClearTimer = null;
    var statusShownAt = 0;
    var STATUS_MIN_PROGRESS_MS = 800;
    var STATUS_SUCCESS_HOLD_MS = 3200;

    function setStatus(msg, isError, options) {
        options = options || {};
        if (statusClearTimer) {
            clearTimeout(statusClearTimer);
            statusClearTimer = null;
        }
        if (!statusEl) return;
        statusEl.textContent = msg || '';
        statusEl.classList.toggle('is-error', !!isError);
        statusEl.classList.toggle('is-success', !isError && msg === 'Saved.');
        statusEl.classList.toggle('is-progress', !isError && /^(Saving|Creating|Uploading|Deleting)/.test(msg || ''));
        statusShownAt = Date.now();
        if (options.autoClearMs) {
            statusClearTimer = setTimeout(function () {
                if (statusEl.textContent === msg) setStatus('');
            }, options.autoClearMs);
        }
    }

    function setStatusAfterMinProgress(msg, isError, options) {
        var elapsed = Date.now() - statusShownAt;
        var wait = Math.max(0, STATUS_MIN_PROGRESS_MS - elapsed);
        if (wait === 0) {
            setStatus(msg, isError, options);
            return;
        }
        setTimeout(function () { setStatus(msg, isError, options); }, wait);
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
        return resolveCover(article && (article.imageUrl || article.coverImage));
    }

    function resolveCover(path) {
        if (!path) return '';
        if (window.imageUtils && typeof window.imageUtils.resolveArticleImageUrl === 'function') {
            return window.imageUtils.resolveArticleImageUrl(path);
        }
        return path;
    }

    function blocksToHtml(blocks) {
        if (!Array.isArray(blocks)) return '';
        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        return blocks.map(function (block) {
            if (!block || !block.type) return '';
            if (block.type === 'h2') return '<h2>' + esc(block.text) + '</h2>';
            if (block.type === 'p') return '<p>' + esc(block.text) + '</p>';
            if (block.type === 'ul' && Array.isArray(block.items)) {
                return '<ul>' + block.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
            }
            return '';
        }).join('');
    }

    function todayIso() {
        var d = new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function renderCoverPreview(articleOrPath) {
        if (!coverPreview) return;
        var url = '';
        if (articleOrPath && typeof articleOrPath === 'object') {
            url = coverUrl(articleOrPath);
        } else if (typeof articleOrPath === 'string') {
            url = resolveCover(articleOrPath);
        }
        if (!url) {
            coverPreview.innerHTML = '<p class="article-cover-preview-empty">No cover yet — drop an image here or choose a file.</p>';
            coverPreview.classList.remove('has-image');
            return;
        }
        coverPreview.innerHTML = '<img src="' + url.replace(/"/g, '&quot;') + '" alt="Cover preview">';
        coverPreview.classList.add('has-image');
    }

    function readFormIntoArticle() {
        var slug = slugify(slugEl.value || titleEl.value);
        var bodyHtml = quill ? quill.root.innerHTML : '';
        if (bodyHtml === '<p><br></p>') bodyHtml = '';
        if (window.DOMPurify) {
            bodyHtml = window.DOMPurify.sanitize(bodyHtml, {
                USE_PROFILES: { html: true },
                ADD_ATTR: ['target', 'rel', 'src', 'alt', 'class']
            });
        }
        var article = Object.assign({}, current || {}, {
            slug: slug,
            title: (titleEl.value || '').trim() || 'Untitled article',
            excerpt: (excerptEl.value || '').trim(),
            category: (categoryEl.value || '').trim() || 'Guides',
            publishedAt: publishedEl.value || todayIso(),
            readMinutes: Math.max(1, parseInt(readEl.value, 10) || 5),
            hidden: !!(hiddenEl && hiddenEl.checked),
            bodyHtml: bodyHtml,
            coverImage: (current && current.coverImage) || null,
            imageUrl: (current && current.imageUrl) || null,
            coverVersion: (current && current.coverVersion) || null
        });
        return article;
    }

    function fillForm(article) {
        current = article;
        titleEl.value = article.title || '';
        slugEl.value = article.slug || '';
        categoryEl.value = article.category || 'Guides';
        publishedEl.value = (article.publishedAt || todayIso()).slice(0, 10);
        readEl.value = article.readMinutes || 5;
        if (hiddenEl) hiddenEl.checked = !!article.hidden;
        excerptEl.value = article.excerpt || '';
        renderCoverPreview(article);
        var html = article.bodyHtml || blocksToHtml(article.body) || '';
        if (quill) {
            quill.setContents([]);
            quill.clipboard.dangerouslyPasteHTML(html || '');
        }
        if (deleteBtn) deleteBtn.classList.toggle('hidden', isNew || article.id == null);
        document.title = (isNew ? 'New article' : 'Edit: ' + (article.title || 'Article')) + ' – Vivarium Store';
    }

    function initQuill() {
        if (!window.Quill) throw new Error('Quill failed to load');
        quill = new window.Quill('#articleEditor', {
            theme: 'snow',
            placeholder: 'Write your article…',
            modules: {
                toolbar: {
                    container: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        [{ indent: '-1' }, { indent: '+1' }],
                        ['blockquote', 'code-block'],
                        [{ align: [] }],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: function () {
                            var input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = function () {
                                var file = input.files && input.files[0];
                                if (file) uploadInlineImage(file);
                            };
                            input.click();
                        }
                    }
                }
            }
        });
    }

    function ensureSlugForUpload() {
        var slug = slugify(slugEl.value || titleEl.value);
        if (!slug) throw new Error('Set a title or slug before uploading images');
        slugEl.value = slug;
        return slug;
    }

    function uploadToArticlePath(file, filename) {
        if (!window.articleImages || typeof window.articleImages.upload !== 'function') {
            return Promise.reject(new Error('Image helpers unavailable'));
        }
        var slug = ensureSlugForUpload();
        return window.articleImages.upload(file, slug, filename);
    }

    function uploadInlineImage(file) {
        setStatus('Uploading image…');
        var ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        if (!/^(jpg|png|gif|webp)$/.test(ext)) ext = 'jpg';
        var name = 'inline-' + Date.now() + '.' + ext;
        return uploadToArticlePath(file, name).then(function (res) {
            var range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', res.url, 'user');
            quill.setSelection(range.index + 1);
            setStatus('Image inserted.');
        }).catch(function (err) {
            console.error(err);
            setStatus('Image upload failed: ' + (err && err.message ? err.message : 'error'), true);
        });
    }

    function uploadCover(file) {
        setStatus('Uploading cover…');
        var slug = ensureSlugForUpload();
        if (!window.articleImages || typeof window.articleImages.uploadCover !== 'function') {
            setStatus('Image helpers unavailable', true);
            return Promise.resolve();
        }
        return window.articleImages.uploadCover(file, slug).then(function (res) {
            if (!current) current = {};
            current.coverImage = res.path;
            current.imageUrl = res.url;
            current.coverVersion = res.version;
            renderCoverPreview(current);
            setStatus('Cover updated (save article to keep).');
        }).catch(function (err) {
            console.error(err);
            setStatus('Cover upload failed: ' + (err && err.message ? err.message : 'error'), true);
        });
    }

    function saveArticle() {
        if (!canEdit()) {
            setStatus('You do not have permission to save.', true);
            return;
        }
        if (!window.supabaseDb || !window.supabaseDb.isConfigured || !window.supabaseDb.isConfigured()) {
            setStatus('Supabase is not configured. Run supabase-articles.sql and check config.', true);
            return;
        }
        var article = readFormIntoArticle();
        if (!article.title) {
            setStatus('Title is required.', true);
            return;
        }
        saveBtn.disabled = true;
        setStatus(isNew ? 'Creating…' : 'Saving…');

        var chain = Promise.resolve(article);
        if (isNew || article.id == null) {
            chain = window.supabaseDb.getNextArticleId().then(function (id) {
                article.id = id;
                return window.supabaseDb.createArticle(article).then(function () { return article; });
            });
        } else {
            chain = window.supabaseDb.updateArticle(article.id, article).then(function () { return article; });
        }

        chain.then(function (saved) {
            current = saved;
            isNew = false;
            slugManual = true;
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            history.replaceState(null, '', 'article-edit.html?slug=' + encodeURIComponent(saved.slug));
            setStatusAfterMinProgress('Saved.', false, { autoClearMs: STATUS_SUCCESS_HOLD_MS });
            document.title = 'Edit: ' + saved.title + ' – Vivarium Store';
        }).catch(function (err) {
            console.error(err);
            setStatusAfterMinProgress(
                'Save failed: ' + (err && err.message ? err.message : 'error') + '. Did you run supabase-articles.sql?',
                true
            );
        }).finally(function () {
            saveBtn.disabled = false;
        });
    }

    function deleteArticle() {
        if (!current || current.id == null || !canEdit()) return;
        if (!confirm('Delete this article permanently?')) return;
        setStatus('Deleting…');
        window.supabaseDb.deleteArticle(current.id).then(function () {
            window.location.href = 'articles.html';
        }).catch(function (err) {
            setStatus('Delete failed: ' + (err && err.message ? err.message : 'error'), true);
        });
    }

    function loadArticle() {
        var params = new URLSearchParams(window.location.search || '');
        isNew = params.get('new') === '1' || params.get('new') === 'true';
        var slug = params.get('slug') || '';

        if (isNew) {
            fillForm({
                title: '',
                slug: '',
                category: 'Guides',
                publishedAt: todayIso(),
                readMinutes: 5,
                excerpt: '',
                coverImage: null,
                bodyHtml: '',
                hidden: false
            });
            slugManual = false;
            setStatus('New article — fill fields and save.');
            return Promise.resolve();
        }

        if (!slug) {
            setStatus('Missing article slug.', true);
            return Promise.resolve();
        }

        var db = window.supabaseDb;
        var loader = (db && db.isConfigured && db.isConfigured() && db.getArticleBySlug)
            ? db.getArticleBySlug(slug)
            : Promise.resolve(null);

        return loader.then(function (row) {
            if (row) return row;
            return fetch('data/articles.json', { cache: 'no-cache' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var list = (data && data.articles) || [];
                    return list.find(function (a) { return a.slug === slug; }) || null;
                });
        }).then(function (article) {
            if (!article) {
                setStatus('Article not found.', true);
                return;
            }
            if (!article.bodyHtml && article.body) article.bodyHtml = blocksToHtml(article.body);
            if (window.articleImages && typeof window.articleImages.assignSeedId === 'function') {
                window.articleImages.assignSeedId(article);
            }
            slugManual = true;
            fillForm(article);
            setStatus('');
        });
    }

    function showEditorUi(allowed) {
        if (gate) gate.classList.toggle('hidden', allowed);
        if (form) form.classList.toggle('hidden', !allowed);
        if (!allowed) setStatus('');
    }

    function bindUi() {
        if (titleEl) {
            titleEl.addEventListener('input', function () {
                if (!slugManual && slugEl) slugEl.value = slugify(titleEl.value);
            });
        }
        if (slugEl) {
            slugEl.addEventListener('input', function () { slugManual = true; });
        }
        if (coverFile) {
            coverFile.addEventListener('change', function () {
                var file = coverFile.files && coverFile.files[0];
                if (file) uploadCover(file);
                coverFile.value = '';
            });
        }
        if (coverClearBtn) {
            coverClearBtn.addEventListener('click', function () {
                if (!current) current = {};
                current.coverImage = null;
                current.imageUrl = null;
                current.coverVersion = null;
                renderCoverPreview(null);
                setStatus('Cover cleared (save article to keep).');
            });
        }
        if (coverPreview) {
            coverPreview.addEventListener('dragover', function (e) {
                e.preventDefault();
                coverPreview.classList.add('article-cover-dragover');
            });
            coverPreview.addEventListener('dragleave', function () {
                coverPreview.classList.remove('article-cover-dragover');
            });
            coverPreview.addEventListener('drop', function (e) {
                e.preventDefault();
                coverPreview.classList.remove('article-cover-dragover');
                var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (file && /^image\//.test(file.type)) uploadCover(file);
            });
        }
        if (saveBtn) saveBtn.addEventListener('click', function (e) {
            e.preventDefault();
            saveArticle();
        });
        if (deleteBtn) deleteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            deleteArticle();
        });
        if (form) form.addEventListener('submit', function (e) {
            e.preventDefault();
            saveArticle();
        });
    }

    function boot() {
        try {
            initQuill();
        } catch (err) {
            setStatus(err.message || 'Editor failed to load', true);
            return;
        }
        bindUi();
        showEditorUi(false);

        function afterAuth() {
            var allowed = canEdit();
            showEditorUi(allowed);
            if (!allowed) return;
            var authReady = (window.supabaseAuth && typeof window.supabaseAuth.getCurrentUser === 'function')
                ? window.supabaseAuth.getCurrentUser()
                : Promise.resolve();
            authReady.then(loadArticle).catch(loadArticle);
        }

        if (window.auth && typeof window.auth.getUser === 'function') {
            window.auth.getUser().then(afterAuth).catch(afterAuth);
        } else {
            afterAuth();
        }
        window.addEventListener('authStateChange', afterAuth);
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
