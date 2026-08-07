/**
 * Quill 2 registers non-passive touchstart on list items, which Chrome logs as
 * [Violation] noise. Our toolbar only uses bullet/ordered lists (not checklists),
 * so defaulting scroll-blocking touch listeners to passive is safe here.
 */
(function () {
    'use strict';
    if (window.__quillPassivePatchApplied) return;
    window.__quillPassivePatchApplied = true;

    var passiveTypes = { touchstart: 1, touchmove: 1, wheel: 1, mousewheel: 1 };
    var supportsPassive = false;
    try {
        var opts = Object.defineProperty({}, 'passive', {
            get: function () { supportsPassive = true; }
        });
        window.addEventListener('testPassive', null, opts);
        window.removeEventListener('testPassive', null, opts);
    } catch (e) { /* ignore */ }

    if (!supportsPassive) return;

    var original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (!passiveTypes[type]) {
            return original.call(this, type, listener, options);
        }
        if (options === true) {
            options = { capture: true, passive: true };
        } else if (options === false || options === undefined) {
            options = { passive: true };
        } else if (typeof options === 'object' && options.passive !== false) {
            options = Object.assign({}, options, { passive: true });
        }
        return original.call(this, type, listener, options);
    };
})();
