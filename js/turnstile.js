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
    var widgetReady = {};

    function siteKey() {
        return (global.TURNSTILE_SITE_KEY || '').toString().trim();
    }

    function isEnabled() {
        return !!siteKey();
    }

    function slotKey(el) {
        if (!el) return 'default';
        return el.id || el.getAttribute('data-turnstile-slot') || 'default';
    }

    function loadScript() {
        if (!isEnabled()) return Promise.resolve(false);
        if (global.turnstile) return Promise.resolve(true);
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = SCRIPT_SRC;
            s.async = true;
            s.defer = true;
            s.onload = function () { resolve(true); };
            s.onerror = function () {
                scriptPromise = null;
                reject(new Error('Failed to load CAPTCHA script. Disable ad blockers and refresh.'));
            };
            document.head.appendChild(s);
        });
        return scriptPromise;
    }

    function showSlotMessage(el, msg, isError) {
        if (!el) return;
        var note = el.querySelector('.turnstile-note');
        if (!note) {
            note = document.createElement('p');
            note.className = 'turnstile-note';
            note.style.cssText = 'font-size:0.9rem;margin:0.5rem 0 0;';
            el.appendChild(note);
        }
        note.style.color = isError ? '#b91c1c' : 'inherit';
        note.textContent = msg || '';
    }

    /**
     * Render a Turnstile widget into containerEl (or element id string).
     * Returns Promise<widgetId|null>.
     */
    function render(container, options) {
        if (!isEnabled()) return Promise.resolve(null);
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return Promise.resolve(null);
        var key = slotKey(el);
        options = options || {};

        el.style.minHeight = '70px';
        if (!el.getAttribute('data-label-added')) {
            var label = document.createElement('p');
            label.className = 'turnstile-label';
            label.style.cssText = 'font-size:0.9rem;font-weight:600;margin:0 0 0.35rem;';
            label.textContent = 'Security check';
            el.insertBefore(label, el.firstChild);
            el.setAttribute('data-label-added', '1');
        }
        showSlotMessage(el, 'Loading security check…', false);

        return loadScript().then(function () {
            if (!global.turnstile) {
                showSlotMessage(el, 'CAPTCHA failed to load. Refresh the page.', true);
                return null;
            }
            if (widgetIds[key] != null) {
                try { global.turnstile.remove(widgetIds[key]); } catch (e) {}
                widgetIds[key] = null;
                widgetReady[key] = false;
            }

            // Keep label; clear previous iframe host
            var host = el.querySelector('.turnstile-host');
            if (!host) {
                host = document.createElement('div');
                host.className = 'turnstile-host';
                el.appendChild(host);
            } else {
                host.innerHTML = '';
            }
            showSlotMessage(el, '', false);

            var id = global.turnstile.render(host, {
                sitekey: siteKey(),
                theme: options.theme || 'auto',
                size: options.size || 'normal',
                appearance: options.appearance || 'always',
                callback: function (token) {
                    widgetReady[key] = true;
                    showSlotMessage(el, '', false);
                    if (options.callback) options.callback(token);
                },
                'expired-callback': function () {
                    widgetReady[key] = false;
                    showSlotMessage(el, 'Security check expired — please wait for it to refresh.', true);
                    if (options.expiredCallback) options.expiredCallback();
                },
                'error-callback': function () {
                    widgetReady[key] = false;
                    showSlotMessage(el, 'CAPTCHA error. Add this site domain in Cloudflare Turnstile, or disable ad blockers.', true);
                    if (options.errorCallback) options.errorCallback();
                }
            });
            widgetIds[key] = id;
            widgetReady[key] = false;
            return id;
        }).catch(function (err) {
            showSlotMessage(el, (err && err.message) || 'CAPTCHA failed to load.', true);
            return null;
        });
    }

    function getToken(container) {
        if (!isEnabled()) {
            return Promise.reject(new Error('CAPTCHA is not configured in the page. Refresh or contact the store.'));
        }
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) {
            return Promise.reject(new Error('CAPTCHA widget missing. Refresh the page.'));
        }
        var key = slotKey(el);
        var wid = widgetIds[key];

        function readToken() {
            if (global.turnstile && wid != null) {
                try {
                    var t = global.turnstile.getResponse(wid);
                    if (t) return t;
                } catch (e) {}
            }
            var host = el.querySelector('.turnstile-host') || el;
            var input = host.querySelector && host.querySelector('input[name="cf-turnstile-response"]');
            return (input && input.value) || '';
        }

        var existing = readToken();
        if (existing) return Promise.resolve(existing);

        // Wait briefly for managed/invisible challenge to finish
        return new Promise(function (resolve, reject) {
            var tries = 0;
            var timer = setInterval(function () {
                tries++;
                var t = readToken();
                if (t) {
                    clearInterval(timer);
                    resolve(t);
                    return;
                }
                if (tries >= 40) {
                    clearInterval(timer);
                    showSlotMessage(el, 'Please complete the security check above.', true);
                    reject(new Error('Please complete the security check (CAPTCHA), then try again.'));
                }
            }, 250);
        });
    }

    function reset(container) {
        if (!isEnabled() || !global.turnstile) return;
        var el = typeof container === 'string' ? document.getElementById(container) : container;
        var key = slotKey(el);
        var wid = widgetIds[key];
        widgetReady[key] = false;
        if (wid != null) {
            try { global.turnstile.reset(wid); } catch (e) {}
        }
    }

    /** Verify token via Netlify (for reviews / non-Supabase actions). */
    function verifyOnServer(token) {
        if (!isEnabled()) return Promise.resolve(true);
        if (!token) return Promise.reject(new Error('Please complete the security check.'));
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
