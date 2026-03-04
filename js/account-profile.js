/**
 * Profile page: Overview, Addresses, Order history, Reviews.
 * Requires: auth, profileDb, inventoryDb (optional for orders).
 * Waits for auth.whenReady() so session is restored before showing guest vs profile.
 */
(function () {
    'use strict';

    var el = document.getElementById('accountContent');
    if (!el) return;

    if (typeof window.auth === 'undefined') {
        el.innerHTML = '<div class="profile-guest"><p>Auth not available.</p><a href="index.html">Back to store</a></div>';
        return;
    }

    function showGuest() {
        el.innerHTML = '<div class="profile-guest"><p>You are not signed in.</p><a href="auth.html">Login</a> or <a href="auth.html?mode=register">Register</a></div>';
    }

    function run() {
        var whenReady = window.auth.whenReady ? window.auth.whenReady() : Promise.resolve();
        whenReady.then(function () {
            var user = window.auth.getCurrentUser();
            if (!user) {
                showGuest();
                return;
            }
            runProfile(user);
        });
    }

    function runProfile(user) {
    var name = (user.name || user.email || 'User').trim();
    var initials = name.split(/\s+/).map(function (w) { return (w[0] || '').toUpperCase(); }).slice(0, 2).join('') || (user.email ? user.email[0].toUpperCase() : '?');
    var roleLabel = (user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : user.role === 'stock' ? 'Stock' : 'User');
    var roleClass = user.role || 'user';
    var memberSince = '';
    if (user.createdAt) {
        try {
            var d = new Date(user.createdAt);
            memberSince = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {}
    }

    function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

    var quickLinks = [];
    if (user.role === 'owner') quickLinks.push({ href: 'access-control.html', label: 'Access control', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' });
    if (window.auth.canManageInventory()) quickLinks.push({ href: 'dashboard.html', label: 'Dashboard', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>' });
    if (window.auth.canManageStock()) quickLinks.push({ href: 'inventory.html', label: 'Inventory', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' });
    quickLinks.push({ href: 'index.html', label: 'Back to store', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' });

    var linksHtml = quickLinks.map(function (l) {
        return '<li><a href="' + l.href + '" class="profile-link"><span>' + esc(l.label) + '</span>' + l.svg + '</a></li>';
    }).join('');

    function switchTab(tabId) {
        document.querySelectorAll('.profile-tab').forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        document.querySelectorAll('.profile-panel').forEach(function (p) { p.classList.remove('active'); });
        var t = document.querySelector('.profile-tab[data-tab="' + tabId + '"]');
        var p = document.getElementById('profilePanel' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
        if (t) { t.classList.add('active'); t.setAttribute('aria-selected', 'true'); }
        if (p) p.classList.add('active');
    }

    function formatPrice(amount) {
        if (amount == null || isNaN(Number(amount))) return '—';
        return 'KD ' + Number(amount).toFixed(2);
    }

    function formatDate(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });
    }

    // --- Overview panel
    var overviewHtml =
        '<div class="profile-hero">' +
        '<div class="profile-avatar" aria-hidden="true">' + esc(initials) + '</div>' +
        '<h2 class="profile-name">' + esc(name) + '</h2>' +
        '<span class="profile-role-badge ' + roleClass + '">' + esc(roleLabel) + '</span>' +
        '</div>' +
        '<section class="profile-section"><h3 class="profile-section-title">Account details</h3>' +
        '<div class="profile-detail"><span class="profile-detail-label">Email</span><span class="profile-detail-value">' + esc(user.email || '—') + '</span></div>' +
        '<div class="profile-detail"><span class="profile-detail-label">Name</span><span class="profile-detail-value">' + esc(name) + '</span></div>' +
        '<div class="profile-detail"><span class="profile-detail-label">Role</span><span class="profile-detail-value">' + esc(roleLabel) + '</span></div>' +
        (memberSince ? '<div class="profile-detail"><span class="profile-detail-label">Member since</span><span class="profile-detail-value">' + esc(memberSince) + '</span></div>' : '') +
        '</section>' +
        '<section class="profile-section"><h3 class="profile-section-title">Quick links</h3><ul class="profile-links">' + linksHtml + '</ul></section>' +
        '<div class="profile-actions">' +
        '<a href="index.html" class="profile-btn profile-btn-primary">Back to store</a>' +
        '<button type="button" id="accountLogout" class="profile-btn profile-btn-danger">Log out</button></div>';

    // --- Addresses panel (filled by loadAddresses)
    var addressesPanelHtml =
        '<section class="profile-section"><h3 class="profile-section-title">Shipping addresses</h3>' +
        '<div id="profileShippingList"></div>' +
        '<button type="button" id="profileAddAddress" class="profile-btn profile-btn-outline profile-btn-small">+ Add address</button></section>' +
        '<section class="profile-section"><h3 class="profile-section-title">Billing address</h3>' +
        '<div id="profileBillingDisplay"></div>' +
        '<button type="button" id="profileEditBilling" class="profile-btn profile-btn-outline profile-btn-small">Edit billing address</button></section>';

    // --- Orders panel (filled by loadOrders)
    var ordersPanelHtml =
        '<section class="profile-section"><h3 class="profile-section-title">Order history</h3>' +
        '<p class="profile-empty" id="profileOrdersEmpty">Loading…</p>' +
        '<div id="profileOrdersList"></div></section>';

    // --- Reviews panel (filled by loadReviews)
    var reviewsPanelHtml =
        '<section class="profile-section"><h3 class="profile-section-title">My reviews &amp; ratings</h3>' +
        '<p class="profile-empty" id="profileReviewsEmpty">Loading…</p>' +
        '<div id="profileReviewsList"></div>' +
        '<button type="button" id="profileAddReview" class="profile-btn profile-btn-outline profile-btn-small" style="margin-top: 0.5rem;">+ Add a review</button></section>';

    el.innerHTML =
        '<div class="profile-tabs" role="tablist">' +
        '<button type="button" class="profile-tab active" data-tab="overview" role="tab" aria-selected="true" id="tabOverview">Overview</button>' +
        '<button type="button" class="profile-tab" data-tab="addresses" role="tab" aria-selected="false" id="tabAddresses">Addresses</button>' +
        '<button type="button" class="profile-tab" data-tab="orders" role="tab" aria-selected="false" id="tabOrders">Orders</button>' +
        '<button type="button" class="profile-tab" data-tab="reviews" role="tab" aria-selected="false" id="tabReviews">Reviews</button>' +
        '</div>' +
        '<div id="profilePanelOverview" class="profile-panel active">' + overviewHtml + '</div>' +
        '<div id="profilePanelAddresses" class="profile-panel">' + addressesPanelHtml + '</div>' +
        '<div id="profilePanelOrders" class="profile-panel">' + ordersPanelHtml + '</div>' +
        '<div id="profilePanelReviews" class="profile-panel">' + reviewsPanelHtml + '</div>';

    document.querySelectorAll('.profile-tab').forEach(function (t) {
        t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
    });

    document.getElementById('accountLogout').addEventListener('click', function () {
        window.auth.logout();
        window.location.href = 'auth.html';
    });

    // --- Addresses
    function renderAddressLine(addr) {
        var parts = [addr.line1, addr.line2, [addr.city, addr.state].filter(Boolean).join(', '), addr.postalCode, addr.country].filter(Boolean);
        return parts.join(', ') || '—';
    }

    function loadAddresses() {
        if (!window.profileDb) return;
        var uid = user.id;
        window.profileDb.getSavedAddresses(uid).then(function (list) {
            var listEl = document.getElementById('profileShippingList');
            if (!listEl) return;
            if (!list || list.length === 0) {
                listEl.innerHTML = '<p class="profile-empty">No saved addresses. Add one for faster checkout.</p>';
                return;
            }
            listEl.innerHTML = list.map(function (a) {
                return '<div class="addr-card" data-addr-id="' + esc(a.id) + '">' +
                    '<div class="addr-card-head"><span class="addr-card-label">' + esc(a.label || 'Address') + '</span>' +
                    (a.isDefault ? '<span class="addr-card-default">Default</span>' : '') + '</div>' +
                    '<p style="margin:0;font-size:0.9rem;">' + esc(renderAddressLine(a)) + '</p>' +
                    (a.phone ? '<p style="margin:0.25rem 0 0 0;font-size:0.9rem;">' + esc(a.phone) + '</p>' : '') +
                    '<div class="addr-card-actions">' +
                    '<button type="button" class="profile-btn profile-btn-outline profile-btn-small profile-addr-edit" data-addr-id="' + esc(a.id) + '">Edit</button> ' +
                    '<button type="button" class="profile-btn profile-btn-danger profile-btn-small profile-addr-delete" data-addr-id="' + esc(a.id) + '">Delete</button></div></div>';
            }).join('');
            listEl.querySelectorAll('.profile-addr-edit').forEach(function (btn) {
                btn.addEventListener('click', function () { openAddressModal(btn.getAttribute('data-addr-id'), list); });
            });
            listEl.querySelectorAll('.profile-addr-delete').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!confirm('Delete this address?')) return;
                    window.profileDb.deleteAddress(uid, btn.getAttribute('data-addr-id')).then(loadAddresses);
                });
            });
        });
        window.profileDb.getBillingAddress(uid).then(function (billing) {
            var disp = document.getElementById('profileBillingDisplay');
            if (!disp) return;
            if (!billing || (!billing.line1 && !billing.city)) {
                disp.innerHTML = '<p class="profile-empty">No billing address saved.</p>';
                return;
            }
            disp.innerHTML = '<p style="margin:0;font-size:0.9rem;">' + esc(renderAddressLine(billing)) + '</p>' + (billing.phone ? '<p style="margin:0.25rem 0 0 0;font-size:0.9rem;">' + esc(billing.phone) + '</p>' : '');
        });
    }

    var addrModal = document.getElementById('profileAddressModal');
    var addrForm = document.getElementById('profileAddressForm');
    function openAddressModal(editId, list) {
        var title = document.getElementById('profileAddressModalTitle');
        document.getElementById('addrId').value = editId || '';
        if (editId && list) {
            var a = list.find(function (x) { return x.id === editId; });
            if (a) {
                title.textContent = 'Edit address';
                document.getElementById('addrLabel').value = a.label || '';
                document.getElementById('addrName').value = a.name || '';
                document.getElementById('addrLine1').value = a.line1 || '';
                document.getElementById('addrLine2').value = a.line2 || '';
                document.getElementById('addrCity').value = a.city || '';
                document.getElementById('addrState').value = a.state || '';
                document.getElementById('addrPostal').value = a.postalCode || '';
                document.getElementById('addrCountry').value = a.country || '';
                document.getElementById('addrPhone').value = a.phone || '';
                document.getElementById('addrIsDefault').checked = !!a.isDefault;
                addrModal.style.display = 'flex';
                return;
            }
        }
        title.textContent = 'Add address';
        addrForm.reset();
        document.getElementById('addrId').value = '';
        addrModal.style.display = 'flex';
    }

    if (addrForm) {
        addrForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var id = document.getElementById('addrId').value;
            var payload = {
                id: id || undefined,
                label: document.getElementById('addrLabel').value.trim() || 'Home',
                name: document.getElementById('addrName').value.trim(),
                line1: document.getElementById('addrLine1').value.trim(),
                line2: document.getElementById('addrLine2').value.trim(),
                city: document.getElementById('addrCity').value.trim(),
                state: document.getElementById('addrState').value.trim(),
                postalCode: document.getElementById('addrPostal').value.trim(),
                country: document.getElementById('addrCountry').value.trim(),
                phone: document.getElementById('addrPhone').value.trim(),
                isDefault: document.getElementById('addrIsDefault').checked
            };
            window.profileDb.saveAddress(user.id, payload).then(function () {
                addrModal.style.display = 'none';
                loadAddresses();
            });
        });
    }
    if (document.getElementById('profileAddressCancel')) {
        document.getElementById('profileAddressCancel').addEventListener('click', function () { addrModal.style.display = 'none'; });
    }
    if (document.getElementById('profileAddAddress')) {
        document.getElementById('profileAddAddress').addEventListener('click', function () { openAddressModal(null, []); });
    }

    var billModal = document.getElementById('profileBillingModal');
    var billForm = document.getElementById('profileBillingForm');
    if (billForm) {
        billForm.addEventListener('submit', function (e) {
            e.preventDefault();
            window.profileDb.saveBillingAddress(user.id, {
                name: document.getElementById('billName').value.trim(),
                line1: document.getElementById('billLine1').value.trim(),
                line2: document.getElementById('billLine2').value.trim(),
                city: document.getElementById('billCity').value.trim(),
                state: document.getElementById('billState').value.trim(),
                postalCode: document.getElementById('billPostal').value.trim(),
                country: document.getElementById('billCountry').value.trim(),
                phone: document.getElementById('billPhone').value.trim()
            }).then(function () {
                billModal.style.display = 'none';
                loadAddresses();
            });
        });
    }
    if (document.getElementById('profileBillingCancel')) {
        document.getElementById('profileBillingCancel').addEventListener('click', function () { billModal.style.display = 'none'; });
    }
    if (document.getElementById('profileEditBilling')) {
        document.getElementById('profileEditBilling').addEventListener('click', function () {
            window.profileDb.getBillingAddress(user.id).then(function (b) {
                if (b) {
                    document.getElementById('billName').value = b.name || '';
                    document.getElementById('billLine1').value = b.line1 || '';
                    document.getElementById('billLine2').value = b.line2 || '';
                    document.getElementById('billCity').value = b.city || '';
                    document.getElementById('billState').value = b.state || '';
                    document.getElementById('billPostal').value = b.postalCode || '';
                    document.getElementById('billCountry').value = b.country || '';
                    document.getElementById('billPhone').value = b.phone || '';
                } else billForm.reset();
                billModal.style.display = 'flex';
            });
        });
    }

    // --- Orders
    function loadOrders() {
        var listEl = document.getElementById('profileOrdersList');
        var emptyEl = document.getElementById('profileOrdersEmpty');
        if (!listEl || !emptyEl) return;
        if (!window.inventoryDb || !window.inventoryDb.getOrdersByCustomerEmail) {
            emptyEl.textContent = 'Order history is not available.';
            return;
        }
        window.inventoryDb.getOrdersByCustomerEmail(user.email, 100).then(function (orders) {
            if (!orders || orders.length === 0) {
                emptyEl.textContent = 'No orders yet.';
                emptyEl.style.display = 'block';
                listEl.innerHTML = '';
                return;
            }
            emptyEl.style.display = 'none';
            listEl.innerHTML = orders.map(function (o) {
                var status = (o.status || 'confirmed').replace('_', ' ');
                var items = (o.items || []).map(function (i) {
                    return '<tr><td>' + esc(i.name || 'Item') + '</td><td>' + (i.quantity || 0) + '</td><td>' + formatPrice(i.lineTotal) + '</td></tr>';
                }).join('');
                return '<div class="order-row" data-order-id="' + o.id + '">' +
                    '<span><strong>#' + o.id + '</strong> ' + formatDate(o.createdAt) + '</span>' +
                    '<span>' + formatPrice(o.totalAmount) + ' · ' + esc(status) + '</span></div>' +
                    '<div class="order-row-expand" id="orderExpand' + o.id + '">' +
                    '<table style="width:100%;font-size:0.9rem;"><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>' + items + '</tbody></table></div>';
            }).join('');
            listEl.querySelectorAll('.order-row').forEach(function (row) {
                row.addEventListener('click', function () {
                    var id = row.getAttribute('data-order-id');
                    var exp = document.getElementById('orderExpand' + id);
                    if (exp) exp.classList.toggle('open');
                });
            });
        });
    }

    // --- Reviews: add-review form (inline)
    var addReviewFormHtml =
        '<div id="profileAddReviewForm" class="profile-section" style="display: none; margin-top: 0.75rem;">' +
        '<h3 class="profile-section-title">Add a review</h3>' +
        '<form id="profileReviewForm" class="profile-form">' +
        '<label>Product name <input type="text" id="reviewProductName" placeholder="e.g. Monstera deliciosa" required></label>' +
        '<label>Rating <select id="reviewRating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select></label>' +
        '<label>Comment <textarea id="reviewComment" placeholder="Your review (optional)"></textarea></label>' +
        '<div class="profile-form-actions"><button type="submit" class="profile-btn profile-btn-primary">Save review</button> <button type="button" id="profileReviewCancel" class="profile-btn profile-btn-outline">Cancel</button></div>' +
        '</form></div>';

    function showAddReviewForm() {
        var formEl = document.getElementById('profileAddReviewForm');
        if (formEl) formEl.style.display = 'block';
    }
    function hideAddReviewForm() {
        var formEl = document.getElementById('profileAddReviewForm');
        if (formEl) formEl.style.display = 'none';
    }

    // --- Reviews
    function loadReviews() {
        var listEl = document.getElementById('profileReviewsList');
        var emptyEl = document.getElementById('profileReviewsEmpty');
        if (!listEl || !emptyEl) return;
        if (!window.profileDb) {
            emptyEl.textContent = 'Reviews are not available.';
            return;
        }
        window.profileDb.getReviewsByUser(user.id, 50).then(function (reviews) {
            if (!reviews || reviews.length === 0) {
                emptyEl.textContent = 'You haven’t left any reviews yet.';
                emptyEl.style.display = 'block';
                listEl.innerHTML = '';
                return;
            }
            emptyEl.style.display = 'none';
            var stars = function (n) { var s = ''; for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆'; return s; };
            listEl.innerHTML = reviews.map(function (r) {
                return '<div class="review-card" data-review-id="' + r.id + '">' +
                    '<div class="review-card-head">' +
                    '<span class="review-card-product">' + esc(r.productName || 'Product #' + r.productId) + '</span>' +
                    '<span class="review-stars" aria-label="' + r.rating + ' out of 5">' + stars(r.rating) + '</span></div>' +
                    (r.comment ? '<p style="margin:0.35rem 0 0 0;font-size:0.9rem;">' + esc(r.comment) + '</p>' : '') +
                    '<p style="margin:0.35rem 0 0 0;font-size:0.8rem;color:var(--text-light);">' + formatDate(r.createdAt) + '</p>' +
                    '<div style="margin-top:0.5rem;">' +
                    '<button type="button" class="profile-btn profile-btn-outline profile-btn-small profile-review-delete" data-review-id="' + r.id + '">Delete</button></div></div>';
            }).join('');
            listEl.querySelectorAll('.profile-review-delete').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!confirm('Delete this review?')) return;
                    window.profileDb.deleteReview(btn.getAttribute('data-review-id')).then(loadReviews);
                });
            });
        });
    }

    (function injectAddReviewForm() {
        var listEl = document.getElementById('profileReviewsList');
        var addBtn = document.getElementById('profileAddReview');
        if (!listEl || !listEl.parentNode) return;
        var wrap = document.createElement('div');
        wrap.innerHTML = addReviewFormHtml;
        var formEl = wrap.firstElementChild;
        if (formEl) listEl.parentNode.insertBefore(formEl, listEl.nextSibling);
    })();
    if (document.getElementById('profileAddReview')) {
        document.getElementById('profileAddReview').addEventListener('click', showAddReviewForm);
    }
    if (document.getElementById('profileReviewCancel')) {
        document.getElementById('profileReviewCancel').addEventListener('click', hideAddReviewForm);
    }
    if (document.getElementById('profileReviewForm')) {
        document.getElementById('profileReviewForm').addEventListener('submit', function (e) {
            e.preventDefault();
            var name = document.getElementById('reviewProductName').value.trim();
            var rating = parseInt(document.getElementById('reviewRating').value, 10) || 5;
            var comment = (document.getElementById('reviewComment').value || '').trim();
            if (!name) return;
            window.profileDb.saveReview(user.id, {
                productType: 'plant',
                productId: 0,
                productName: name,
                rating: rating,
                comment: comment
            }).then(function () {
                document.getElementById('profileReviewForm').reset();
                hideAddReviewForm();
                loadReviews();
            });
        });
    }

    // Load data when switching to a panel
    function onShowPanel(tabId) {
        if (tabId === 'addresses') loadAddresses();
        else if (tabId === 'orders') loadOrders();
        else if (tabId === 'reviews') loadReviews();
    }

    document.querySelectorAll('.profile-tab').forEach(function (t) {
        t.addEventListener('click', function () { onShowPanel(t.getAttribute('data-tab')); });
    });

    loadAddresses();
    }

    run();
    window.addEventListener('authStateChange', run);
})();
