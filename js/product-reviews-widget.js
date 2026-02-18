/**
 * Product reviews & ratings widget for plant/equipment/vivarium detail views.
 * Renders existing reviews and (if logged in) a form to add a review.
 * Requires: profileDb, auth (optional for form).
 */
(function (global) {
    'use strict';

    function escapeHtml(s) {
        if (s == null) return '';
        var str = String(s);
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatDate(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });
    }

    function starsHtml(rating) {
        var n = Math.min(5, Math.max(0, Number(rating) || 0));
        var parts = [];
        for (var i = 0; i < 5; i++) parts.push('<span class="star' + (i < n ? ' filled' : '') + '" aria-hidden="true">★</span>');
        return '<span class="product-review-stars product-review-stars-display" aria-label="' + n + ' out of 5 stars">' + parts.join('') + '</span>';
    }

    function canDeleteReviews() {
        var auth = global.auth;
        if (!auth) return false;
        return (auth.isOwner && auth.isOwner()) || (auth.isAdmin && auth.isAdmin());
    }

    function renderWidget(container, productType, productId, productName) {
        if (!container || typeof global.profileDb === 'undefined') return;

        var user = typeof global.auth !== 'undefined' && global.auth.getCurrentUser ? global.auth.getCurrentUser() : null;
        var showDelete = canDeleteReviews();

        /* Same structure as other modal widgets: h3 + content (no extra wrapper; container is modal-section) */
        container.innerHTML =
            '<h3 id="product-reviews-head">Reviews &amp; ratings</h3>' +
            '<p class="product-reviews-average" id="product-reviews-average" aria-live="polite"></p>' +
            '<div class="product-reviews-list"></div>' +
            (user ?
                '<form class="product-reviews-form">' +
                '<label>Your rating</label>' +
                '<div class="product-review-stars-input" role="group" aria-label="Your rating">' +
                '<input type="hidden" id="product-review-rating" name="rating" value="0">' +
                '<button type="button" class="star" data-value="1" aria-label="1 star">★</button>' +
                '<button type="button" class="star" data-value="2" aria-label="2 stars">★</button>' +
                '<button type="button" class="star" data-value="3" aria-label="3 stars">★</button>' +
                '<button type="button" class="star" data-value="4" aria-label="4 stars">★</button>' +
                '<button type="button" class="star" data-value="5" aria-label="5 stars">★</button>' +
                '</div>' +
                '<label for="product-review-comment">Comment (optional)</label>' +
                '<textarea id="product-review-comment" class="product-review-comment" rows="3" placeholder="Share your experience..."></textarea>' +
                '<button type="submit" class="product-review-submit">Submit review</button>' +
                '</form>' : '<p class="product-reviews-login"> <a href="auth.html">Log in</a> to leave a review.</p>');

        var listEl = container.querySelector('.product-reviews-list');
        var averageEl = container.querySelector('#product-reviews-average');

        function renderList(reviews) {
            if (!listEl) return;
            var count = (reviews || []).length;
            if (averageEl) {
                if (count === 0) {
                    averageEl.textContent = '';
                    averageEl.className = 'product-reviews-average';
                } else {
                    var sum = reviews.reduce(function (s, r) { return s + (Number(r.rating) || 0); }, 0);
                    var avg = Math.round((sum / count) * 10) / 10;
                    averageEl.innerHTML = '<span class="product-reviews-average-value">' + escapeHtml(String(avg)) + ' ★</span> <span class="product-reviews-average-count">' + count + ' review' + (count !== 1 ? 's' : '') + '</span>';
                    averageEl.className = 'product-reviews-average product-reviews-average-visible';
                }
            }
            if (!reviews || reviews.length === 0) {
                listEl.innerHTML = '<p class="product-reviews-empty">No reviews yet. Be the first to review!</p>';
                return;
            }
            listEl.innerHTML = reviews.map(function (r) {
                var displayName = (r.userDisplayName || '').trim() || ('User ' + (r.userId || ''));
                var deleteBtn = showDelete && r.id ? '<button type="button" class="product-review-delete" data-review-id="' + escapeHtml(String(r.id)) + '" title="Delete review" aria-label="Delete review">×</button>' : '';
                return '<div class="product-review-item" data-review-id="' + (r.id ? escapeHtml(String(r.id)) : '') + '">' +
                    (deleteBtn ? '<div class="product-review-item-actions">' + deleteBtn + '</div>' : '') +
                    '<p class="product-review-meta product-review-by">' + escapeHtml(displayName) + '</p>' +
                    starsHtml(r.rating) +
                    (r.comment ? '<p class="product-review-comment-text">' + escapeHtml(r.comment) + '</p>' : '') +
                    '<p class="product-review-meta product-review-date">' + escapeHtml(formatDate(r.createdAt)) + '</p>' +
                    '</div>';
            }).join('');
        }

        function load() {
            global.profileDb.getReviewsByProduct(productType, productId).then(renderList);
        }

        if (showDelete && listEl) {
            listEl.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest && e.target.closest('.product-review-delete');
                if (!btn) return;
                var reviewId = btn.getAttribute('data-review-id');
                if (!reviewId) return;
                if (global.confirm && !global.confirm('Delete this review?')) return;
                global.profileDb.deleteReview(reviewId).then(load);
            });
        }

        load();

        if (user && container.querySelector('.product-reviews-form')) {
            var form = container.querySelector('.product-reviews-form');
            var ratingInput = container.querySelector('#product-review-rating');
            var starsWrap = container.querySelector('.product-review-stars-input');
            var starBtns = starsWrap ? starsWrap.querySelectorAll('.star') : [];

            function updateStarsVisual(value) {
                var v = Math.min(5, Math.max(0, parseInt(value, 10) || 0));
                starBtns.forEach(function (btn, i) {
                    btn.classList.toggle('filled', i < v);
                });
            }

            starBtns.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var v = parseInt(btn.getAttribute('data-value'), 10);
                    if (ratingInput) ratingInput.value = v;
                    updateStarsVisual(v);
                });
                btn.addEventListener('mouseenter', function () {
                    var v = parseInt(btn.getAttribute('data-value'), 10);
                    updateStarsVisual(v);
                    starsWrap.classList.add('hover');
                });
            });
            if (starsWrap) {
                starsWrap.addEventListener('mouseleave', function () {
                    starsWrap.classList.remove('hover');
                    updateStarsVisual(ratingInput ? ratingInput.value : 0);
                });
            }

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var commentEl = document.getElementById('product-review-comment');
                var rating = ratingInput ? parseInt(ratingInput.value, 10) || 0 : 0;
                if (rating < 1 || rating > 5) rating = 5;
                var comment = commentEl ? commentEl.value.trim() : '';
                var displayName = (user.name || user.email || 'User').trim();
                global.profileDb.saveReview(user.id, {
                    productType: productType,
                    productId: productId,
                    productName: productName || '',
                    userDisplayName: displayName,
                    rating: rating,
                    comment: comment
                }).then(function () {
                    if (ratingInput) ratingInput.value = '0';
                    updateStarsVisual(0);
                    if (commentEl) commentEl.value = '';
                    load();
                });
            });
        }
    }

    /** Call with a container element that has data-product-type, data-product-id, data-product-name. */
    function initWidget(container) {
        if (!container) return;
        var type = container.getAttribute('data-product-type');
        var id = container.getAttribute('data-product-id');
        var name = container.getAttribute('data-product-name') || '';
        if (type && id) renderWidget(container, type, id, name);
    }

    if (global.window) {
        global.window.renderProductReviewsWidget = renderWidget;
        global.window.initProductReviewsWidget = initWidget;
    }
})(typeof window !== 'undefined' ? window : this);
