/**
 * Unified site navigation. Load on every page. Injects the same menu and binds toggle + cart.
 */
(function() {
    'use strict';

    var NAV_ICONS = {
        home: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        definitions: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/></svg>',
        taxonomy: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>',
        inventory: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        dashboard: '<svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>'
    };
    var NAV_LINKS = [
        { href: 'index.html', label: 'Home', icon: 'home' },
        { href: 'definitions.html', label: 'Definitions', icon: 'definitions' },
        { href: 'taxonomy.html', label: 'Taxonomy', icon: 'taxonomy' },
        { href: 'inventory.html', label: 'Inventory', icon: 'inventory' },
        { href: 'dashboard.html', label: 'Dashboard', icon: 'dashboard' }
    ];

    function getCurrentPage() {
        var path = window.location.pathname || '';
        var page = path.split('/').pop() || '';
        return page || 'index.html';
    }

    function buildNav() {
        var current = getCurrentPage();
        var isIndex = (current === 'index.html' || current === '' || current === 'index');
        var menuItems = NAV_LINKS.map(function(link) {
            var active = (link.href === current || (current === '' && link.href === 'index.html')) ? ' active' : '';
            var icon = (link.icon && NAV_ICONS[link.icon]) ? NAV_ICONS[link.icon] : '';
            return '<li class="nav-item"><a href="' + link.href + '" class="nav-link' + active + '"><span class="nav-link-inner">' + icon + '<span class="nav-link-text">' + link.label + '</span></span></a></li>';
        }).join('');

        var backBtnHtml = isIndex
            ? '<div class="nav-back-wrap hidden" id="navBackToListWrap"><button type="button" id="navBackToList" class="nav-back-btn" aria-label="Back to list" title="Back to list">' +
              '<svg class="nav-back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg><span class="nav-back-text">Back</span></button></div>'
            : '';

        return '<nav class="main-nav">' +
            '<button class="nav-toggle" id="navToggle" aria-label="Open menu">' +
            '<span></span><span></span><span></span>' +
            '</button>' +
            backBtnHtml +
            '<div class="nav-logo">' +
            '<a href="index.html" class="logo-link"><img src="assets/vivarium-store-logo.svg" alt="" class="logo-img" width="32" height="32"><span class="logo-text">Vivarium Store</span></a>' +
            '</div>' +
            '<div class="nav-cart-wrap">' +
            '<button type="button" id="cartToggle" class="cart-toggle" aria-label="Open cart">' +
            '<span class="cart-icon">' +
            '<svg class="cart-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
            '</span>' +
            '<span id="cartCount" class="cart-count">0</span>' +
            '</button>' +
            '</div>' +
            '<ul class="nav-menu" id="navMenu">' + menuItems + '</ul>' +
            '</nav>';
    }

    function setCartCount() {
        var el = document.getElementById('cartCount');
        if (!el) return;
        try {
            var cart = JSON.parse(localStorage.getItem('terrarium_cart') || '[]');
            var count = cart.reduce(function(s, i) { return s + (i.quantity || 0); }, 0);
            el.textContent = count;
        } catch (_) {
            el.textContent = '0';
        }
    }

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
        var current = getCurrentPage();
        if (current === 'index.html') return;
        var btn = document.getElementById('cartToggle');
        if (!btn) return;
        btn.addEventListener('click', function() {
            window.location.href = 'checkout.html';
        });
    }

    var container = document.getElementById('main-nav-container');
    if (container) {
        container.innerHTML = buildNav();
        setCartCount();
        initToggle();
        initCartRedirect();
    }
})();
