/**
 * Cloudflare Turnstile helper.
 * Set window.TURNSTILE_SITE_KEY in js/config.js. If empty, CAPTCHA is skipped (no widget).
 */
(function (global) {
    'use strict';
    if (!global) return;

    var SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    var scriptPromise = null;
    var widgetIds = {};

    function siteKey() {
        return (global.TURNSTILE_SITE_KEY || '').toString().trim();
    }

    function isEnabled() {
        return !!siteKey();
    }

    function loadScript() {
        if (!isEnabled()) return Promise.resolve(false);
        if (global.turnstile) return Promise.resolve(true);
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = SCRIPT_SRC;
            s.async = true;
            s.onload = function () { resolve(true); };
            s.onerror = function () { scriptPromise = null; reject(new Error('Failed to load CAPTCHA')); };
            document.head.appendChild(s);
        });
        return scriptPromise;
    }

    /**
     * Render a Turnstile widget into containerEl (or element id string).
     * Returns Promise<widgetId|null>.
     */
    function render(container, options) {
        if (!isEnabled()) return Promise.resolve(null);
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return Promise.resolve(null);
        var key = el.id || el.getAttribute('data-turnstile-slot') || 'default';
        return loadScript().then(function () {
            if (!global.turnstile) return null;
            if (widgetIds[key] != null) {
                try { global.turnstile.remove(widgetIds[key]); } catch (e) {}
                widgetIds[key] = null;
            }
            el.innerHTML = '';
            var id = global.turnstile.render(el, {
                sitekey: siteKey(),
                theme: (options && options.theme) || 'auto',
                size: (options && options.size) || 'normal',
                callback: options && options.callback,
                'expired-callback': options && options.expiredCallback,
                'error-callback': options && options.errorCallback
            });
            widgetIds[key] = id;
            return id;
        });
    }

    function getToken(container) {
        if (!isEnabled()) return Promise.resolve('');
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        var key = el && (el.id || el.getAttribute('data-turnstile-slot')) || 'default';
        var wid = widgetIds[key];
        if (global.turnstile && wid != null) {
            try {
                var t = global.turnstile.getResponse(wid);
                if (t) return Promise.resolve(t);
            } catch (e) {}
        }
        // Fallback: hidden input turnstile injects
        var input = el && el.querySelector && el.querySelector('input[name="cf-turnstile-response"]');
        if (input && input.value) return Promise.resolve(input.value);
        return Promise.reject(new Error('Please complete the CAPTCHA.'));
    }

    function reset(container) {
        if (!isEnabled() || !global.turnstile) return;
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        var key = el && (el.id || el.getAttribute('data-turnstile-slot')) || 'default';
        var wid = widgetIds[key];
        if (wid != null) {
            try { global.turnstile.reset(wid); } catch (e) {}
        }
    }

    /** Verify token via Netlify (for reviews / non-Supabase actions). */
    function verifyOnServer(token) {
        if (!isEnabled()) return Promise.resolve(true);
        if (!token) return Promise.reject(new Error('Please complete the CAPTCHA.'));
        return fetch('/.netlify/functions/verify-turnstile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || !data || !data.ok) {
                    throw new Error((data && data.error) || 'CAPTCHA verification failed');
                }
                return true;
            });
        });
    }

    global.turnstileHelper = {
        isEnabled: isEnabled,
        loadScript: loadScript,
        render: render,
        getToken: getToken,
        reset: reset,
        verifyOnServer: verifyOnServer
    };
})(typeof window !== 'undefined' ? window : this);
