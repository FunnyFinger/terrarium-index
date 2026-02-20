/**
 * User settings: theme, notifications. Persisted in localStorage.
 * Theme key: terrarium_theme ('light' | 'dark' | 'system')
 * Other settings key: terrarium_settings (guest) or terrarium_settings_{userId} (logged-in)
 */
(function(global) {
    'use strict';
    if (!global) return;

    var THEME_KEY = 'terrarium_theme';
    var SETTINGS_KEY_PREFIX = 'terrarium_settings';

    function getSettingsKey() {
        var user = (global.auth && global.auth.getCurrentUser) ? global.auth.getCurrentUser() : null;
        return user ? SETTINGS_KEY_PREFIX + '_' + user.id : SETTINGS_KEY_PREFIX;
    }

    function getTheme() {
        try {
            return global.localStorage.getItem(THEME_KEY) || 'system';
        } catch (e) {
            return 'system';
        }
    }

    function setTheme(value) {
        try {
            global.localStorage.setItem(THEME_KEY, value);
        } catch (e) {}
        applyThemeToDocument(value);
    }

    function applyThemeToDocument(theme) {
        var resolved = theme === 'dark' ? 'dark' : (theme === 'light' ? 'light' : (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        if (global.document && global.document.documentElement) {
            global.document.documentElement.setAttribute('data-theme', resolved);
        }
    }

    function getSettings() {
        try {
            var raw = global.localStorage.getItem(getSettingsKey());
            if (!raw) return defaultSettings();
            var s = JSON.parse(raw);
            var def = defaultSettings();
            var out = {};
            for (var k in def) out[k] = def[k];
            for (var k in s) if (s.hasOwnProperty(k)) out[k] = s[k];
            return out;
        } catch (e) {
            return defaultSettings();
        }
    }

    function defaultSettings() {
        return {
            emailOrderUpdates: true,
            emailMarketing: false
        };
    }

    function saveSettings(settings) {
        try {
            global.localStorage.setItem(getSettingsKey(), JSON.stringify(settings));
        } catch (e) {}
    }

    if (global.window) {
        global.settingsStore = {
            getTheme: getTheme,
            setTheme: setTheme,
            applyThemeToDocument: applyThemeToDocument,
            getSettings: getSettings,
            saveSettings: saveSettings,
            getSettingsKey: getSettingsKey
        };
    }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
