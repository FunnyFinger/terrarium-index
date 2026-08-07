/**
 * Unified site navigation. Load on every page. Injects the same menu and binds toggle + cart.
 */
(function() {
    'use strict';

    (function applyTheme() {
        var theme = typeof localStorage !== 'undefined' && localStorage.getItem('terrarium_theme');
        var resolved = theme === 'dark' ? 'dark' : (theme === 'light' ? 'light' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        if (document.documentElement) document.documentElement.setAttribute('data-theme', resolved);
    })();

    var NAV_ICONS = {
        home: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        build: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>',
        definitions: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/></svg>',
        articles: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        taxonomy: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>',
        inventory: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        dashboard: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
        access: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        account: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    };
    var NAV_LINKS = [
        { href: '/', label: 'Home', icon: 'home' },
        { href: 'build-vivarium.html', label: 'Build vivarium', icon: 'build' },
        { href: 'articles.html', label: 'Articles', icon: 'articles' },
        { href: 'definitions.html', label: 'Definitions', icon: 'definitions' },
        { href: 'taxonomy.html', label: 'Taxonomy', icon: 'taxonomy' },
        { href: 'inventory.html', label: 'Inventory', icon: 'inventory' },
        { href: 'dashboard.html', label: 'Dashboard', icon: 'dashboard' },
        { href: 'access-control.html', label: 'Access control', icon: 'access', ownerOnly: true }
    ];

    function getCurrentPage() {
        var path = window.location.pathname || '';
        var page = path.split('/').pop() || '';
        return page || 'index.html';
    }

    function buildNav() {
        var current = getCurrentPage();
        var isIndex = (current === 'index.html' || current === '' || current === 'index');
        var hasIndexBackTarget = false;
        if (isIndex && typeof document !== 'undefined') {
            hasIndexBackTarget = !!(
                (document.querySelector && document.querySelector('.main-layout.detail-view-active')) ||
                (document.querySelector && document.querySelector('.main-content.build-view-active')) ||
                (document.querySelector && document.querySelector('#plantDetailPanel:not(.hidden)')) ||
                window._buildViewActive
            );
        }
        var disableBack = isIndex && !hasIndexBackTarget;
        var canManage = (typeof window.auth !== 'undefined' && window.auth.canManageInventory) ? window.auth.canManageInventory() : false;
        var canStock = (typeof window.auth !== 'undefined' && window.auth.canManageStock) ? window.auth.canManageStock() : false;
        var isOwner = (typeof window.auth !== 'undefined' && window.auth.isOwner) ? window.auth.isOwner() : false;
        var links = NAV_LINKS.filter(function(link) {
            if (link.ownerOnly) return isOwner;
            if (link.href === 'dashboard.html') return canManage;
            if (link.href === 'inventory.html') return canStock;
            return true;
        });
        var menuItems = links.map(function(link) {
            var active = (link.href === current || ((current === '' || current === 'index.html' || current === 'index') && (link.href === '/' || link.href === 'index.html'))) ? ' active' : '';
            var icon = (link.icon && NAV_ICONS[link.icon]) ? NAV_ICONS[link.icon] : '';
            return '<li class="nav-item"><a href="' + link.href + '" class="nav-link' + active + '"><span class="nav-link-inner">' + icon + '<span class="nav-link-text">' + link.label + '</span></span></a></li>';
        }).join('');

        var backSvg = '<svg class="nav-back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg><span class="nav-back-text">Back</span>';
        var backWrapClass = 'nav-back-wrap' + (disableBack ? ' nav-back-disabled' : '');
        var backDisabled = disableBack ? ' disabled' : '';
        var backBtnHtml = '<div class="' + backWrapClass + '" id="navBackToListWrap"><button type="button" id="navBackToList" class="nav-back-btn" aria-label="Back to store" title="Back to store"' + backDisabled + '>' + backSvg + '</button></div>';

        var authHtml = '';
        var user = (typeof window.auth !== 'undefined' && window.auth.getCurrentUser) ? window.auth.getCurrentUser() : null;
        var accountIcon = '<svg class="nav-auth-account-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        if (user) {
            var name = (user.name || user.email || 'Account').replace(/</g, '&lt;');
            authHtml = '<div class="nav-auth-wrap" id="navAuthWrap">' +
                '<button type="button" class="nav-auth-trigger" id="navAuthTrigger" title="Account (' + name + ')" aria-label="Account menu" aria-expanded="false" aria-haspopup="true">' +
                accountIcon +
                '<svg class="nav-auth-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</button>' +
                '<div class="nav-auth-dropdown" id="navAuthDropdown" role="menu">' +
                '<div class="nav-auth-dropdown-user">You are logged in as: <strong>' + name + '</strong></div>' +
                '<a href="account.html" class="nav-auth-dropdown-link" role="menuitem">My account</a>' +
                '<a href="settings.html" class="nav-auth-dropdown-link" role="menuitem">Settings</a>' +
                '<button type="button" id="navLogout" class="nav-auth-dropdown-btn" role="menuitem" aria-label="Log out">Logout</button>' +
                '</div>' +
                '</div>';
        } else {
            authHtml = '<div class="nav-auth-wrap" id="navAuthWrap">' +
                '<button type="button" class="nav-auth-trigger" id="navAuthTrigger" title="Account" aria-label="Account menu" aria-expanded="false" aria-haspopup="true">' +
                accountIcon +
                '<svg class="nav-auth-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</button>' +
                '<div class="nav-auth-dropdown" id="navAuthDropdown" role="menu">' +
                '<div class="nav-auth-dropdown-user">You are not logged in.</div>' +
                '<a href="settings.html" class="nav-auth-dropdown-link" role="menuitem">Settings</a>' +
                '<a href="auth.html" class="nav-auth-dropdown-link" role="menuitem">Login</a>' +
                '</div>' +
                '</div>';
        }
        var authMenuItems = '';
        return '<nav class="main-nav">' +
            '<button class="nav-toggle" id="navToggle" aria-label="Open menu">' +
            '<span></span><span></span><span></span>' +
            '</button>' +
            backBtnHtml +
            '<div class="nav-logo-spacer"></div>' +
            '<div class="nav-logo">' +
            '<a href="/" class="logo-link"><img src="assets/vivarium-store-logo.svg?v=2" alt="" class="logo-img" width="32" height="32"><span class="logo-text"><span class="logo-text-main">Vivarium</span> <span class="logo-text-accent">Store</span></span></a>' +
            '</div>' +
            '<div class="nav-search" id="navSearch">' +
            '<button type="button" class="nav-search-toggle" id="navSearchToggle" aria-label="Open search" title="Search" aria-expanded="false">' +
            '<svg class="nav-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
            '</button>' +
            '<div class="nav-search-panel" id="navSearchPanel" role="search">' +
            '<label for="searchInput" class="visually-hidden">Search catalog</label>' +
            '<input type="search" id="searchInput" class="nav-search-input" placeholder="Search…" autocomplete="off" enterkeyhint="search">' +
            '<button type="button" id="searchBtn" class="nav-search-submit" aria-label="Search">' +
            '<svg class="nav-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
            '</button>' +
            '<button type="button" class="nav-search-close" id="navSearchClose" aria-label="Close search">' +
            '<svg class="nav-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
            '</div>' +
            '</div>' +
            '<div class="nav-cart-wrap">' +
            '<button type="button" id="cartToggle" class="cart-toggle" aria-label="Open cart">' +
            '<span class="cart-icon-wrap">' +
            '<span class="cart-icon"><svg class="cart-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></span>' +
            '<span id="cartCount" class="cart-count">0</span>' +
            '</span>' +
            '</button>' +
            '</div>' +
            authHtml +
            '<ul class="nav-menu" id="navMenu">' + menuItems + authMenuItems + '</ul>' +
            '</nav>';
    }

    /** Unique line items only (qty of 3 of one plant still counts as 1). */
    function cartBadgeCount(cart) {
        if (!cart || !cart.length) return 0;
        var n = 0;
        for (var i = 0; i < cart.length; i++) {
            var qty = parseFloat(cart[i].quantity);
            if (!isNaN(qty) && qty > 0) n += 1;
        }
        return n;
    }

    function setCartCount() {
        var el = document.getElementById('cartCount');
        if (!el) return;
        try {
            var cart = JSON.parse(localStorage.getItem('terrarium_cart') || '[]');
            el.textContent = String(cartBadgeCount(cart));
        } catch (_) {
            el.textContent = '0';
        }
    }

    // Keep badge in sync after clear/checkout/auth re-render (fresh DOM query)
    window.updateNavCartCount = setCartCount;

    // Called by addToCart to animate the cart badge on item add
    window.navBounceCartCount = function() {
        setCartCount();
        var wrap = document.querySelector('.cart-icon-wrap');
        if (!wrap) return;
        wrap.classList.remove('cart-bounce');
        // Trigger reflow so the class removal is processed before re-adding
        void wrap.offsetWidth;
        wrap.classList.add('cart-bounce');
        wrap.addEventListener('animationend', function handler() {
            wrap.classList.remove('cart-bounce');
            wrap.removeEventListener('animationend', handler);
        });
    };

    function initToggle() {
        var navToggle = document.getElementById('navToggle');
        var navMenu = document.getElementById('navMenu');
        if (!navToggle || !navMenu) return;
        navToggle.addEventListener('click', function() {
            navToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        document.addEventListener('click', function(e) {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }

    function initCartRedirect() {
        var btn = document.getElementById('cartToggle');
        if (!btn) return;
        btn.addEventListener('click', function() {
            var drawer = document.getElementById('cartDrawer');
            var overlay = document.getElementById('cartOverlay');
            if (drawer && overlay) {
                drawer.classList.remove('hidden');
                overlay.classList.remove('hidden');
                drawer.classList.add('open');
                overlay.classList.add('open');
            } else {
                window.location.href = '/?openCart=1';
            }
        });
    }

    function isShopIndexPage() {
        var current = getCurrentPage();
        return current === 'index.html' || current === '' || current === 'index';
    }

    function initNavSearch() {
        var wrap = document.getElementById('navSearch');
        var toggle = document.getElementById('navSearchToggle');
        var closeBtn = document.getElementById('navSearchClose');
        var input = document.getElementById('searchInput');
        var submit = document.getElementById('searchBtn');
        if (!wrap || !input) return;

        function setOpen(open) {
            wrap.classList.toggle('open', open);
            if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                setTimeout(function() { input.focus(); }, 0);
            }
        }

        if (toggle) {
            toggle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(!wrap.classList.contains('open'));
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
            });
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && wrap.classList.contains('open')) setOpen(false);
        });

        function goSearchFromOtherPage() {
            var q = (input.value || '').trim();
            var url = q ? ('/?q=' + encodeURIComponent(q)) : '/';
            window.location.href = url;
        }

        if (!isShopIndexPage()) {
            if (submit) {
                submit.addEventListener('click', function(e) {
                    e.preventDefault();
                    goSearchFromOtherPage();
                });
            }
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    goSearchFromOtherPage();
                }
            });
        }

        if (typeof window.bindShopNavSearch === 'function') {
            window.bindShopNavSearch();
        }
    }

    function initBackButton() {
        var current = getCurrentPage();
        var isIndex = (current === 'index.html' || current === '' || current === 'index');
        if (isIndex) return;
        var backBtn = document.getElementById('navBackToList');
        if (backBtn) backBtn.addEventListener('click', function() { window.location.href = '/'; });
    }

    function initAuth() {
        function doLogout() {
            var p = (typeof window.auth !== 'undefined') ? window.auth.logout() : null;
            Promise.resolve(p).then(function () { window.location.reload(); });
        }
        var logoutBtn = document.getElementById('navLogout');
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

        var authWrap = document.getElementById('navAuthWrap');
        var authTrigger = document.getElementById('navAuthTrigger');
        var authDropdown = document.getElementById('navAuthDropdown');
        if (authTrigger && authDropdown && authWrap) {
            authTrigger.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var open = authWrap.classList.toggle('open');
                authTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
            document.addEventListener('click', function(e) {
                if (!authWrap.contains(e.target)) {
                    authWrap.classList.remove('open');
                    authTrigger.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }

    function renderNav() {
        var container = document.getElementById('main-nav-container');
        if (!container) return;
        container.innerHTML = buildNav();
        setCartCount();
        initToggle();
        initCartRedirect();
        initBackButton();
        initAuth();
        initNavSearch();
    }

    var container = document.getElementById('main-nav-container');
    if (container) {
        renderNav();
        window.addEventListener('authStateChange', renderNav);
    }
})();
