/* Waco Aero — click-to-expand image viewer.
   Self-contained: injects its own styles, binds every content <img> on the page.
   Opt an image out with the data-no-lightbox attribute.
   Video: give a poster <img> a data-video="clip.mp4" attribute; it opens and plays in the viewer.
   Group: images inside a [data-gallery] element are browsed only among themselves. */
(function () {
    'use strict';

    var CSS = [
        '.lb-thumb { cursor: zoom-in; }',
        '.lb-overlay {',
        '  position: fixed; inset: 0; z-index: 9999;',
        '  display: flex; align-items: center; justify-content: center;',
        '  background: rgba(6, 9, 18, 0.94);',
        '  opacity: 0; transition: opacity 220ms ease;',
        '  visibility: hidden;',
        '}',
        '.lb-overlay.lb-open { opacity: 1; visibility: visible; }',
        '.lb-stage { position: absolute; inset: 0; }',
        '.lb-img {',
        '  position: absolute; transform-origin: top left;',
        '  will-change: transform; display: block;',
        '  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);',
        '}',
        '.lb-caption {',
        '  position: absolute; left: 50%; bottom: 1.35rem; transform: translateX(-50%);',
        '  max-width: min(880px, 90vw); text-align: center;',
        '  font-family: Archivo, \'Helvetica Neue\', Helvetica, Arial, sans-serif;',
        '  font-size: 0.95rem; line-height: 1.5; color: #e2e8f0;',
        '  background: rgba(10, 14, 26, 0.82); border: 1px solid #334155;',
        '  border-radius: 8px; padding: 0.6rem 1rem;',
        '  opacity: 0; transition: opacity 200ms ease 120ms;',
        '  pointer-events: none;',
        '}',
        '.lb-open .lb-caption { opacity: 1; }',
        '.lb-btn {',
        '  position: absolute; z-index: 2; display: flex;',
        '  align-items: center; justify-content: center;',
        '  width: 46px; height: 46px; padding: 0;',
        '  background: rgba(15, 23, 42, 0.78); color: #f8fafc;',
        '  border: 1px solid #334155; border-radius: 50%;',
        '  cursor: pointer; opacity: 0;',
        '  transition: opacity 200ms ease 120ms, background 150ms ease, border-color 150ms ease;',
        '}',
        '.lb-open .lb-btn { opacity: 1; }',
        '.lb-btn:hover { background: #f97316; border-color: #f97316; }',
        '.lb-btn:focus-visible { outline: 2px solid #f97316; outline-offset: 3px; }',
        '.lb-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
        '.lb-close { top: 1.1rem; right: 1.1rem; }',
        '.lb-prev { top: 50%; left: 1.1rem; margin-top: -23px; }',
        '.lb-next { top: 50%; right: 1.1rem; margin-top: -23px; }',
        '.lb-count {',
        '  position: absolute; top: 1.5rem; left: 50%; transform: translateX(-50%);',
        '  font-family: Archivo, \'Helvetica Neue\', Helvetica, Arial, sans-serif; letter-spacing: 0.05em; font-size: 0.78rem;',
        '  color: #94a3b8; opacity: 0; transition: opacity 200ms ease 120ms;',
        '}',
        '.lb-open .lb-count { opacity: 1; }',
        '.lb-video {',
        '  position: absolute; display: block; background: #000;',
        '  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);',
        '}',
        '.lb-hidden { display: none !important; }',
        '@media (max-width: 600px) {',
        '  .lb-btn { width: 40px; height: 40px; }',
        '  .lb-prev { left: 0.5rem; } .lb-next { right: 0.5rem; }',
        '  .lb-caption { font-size: 0.85rem; bottom: 0.75rem; }',
        '}',
        '@media (max-height: 499px) and (orientation: landscape) {',
        '  .lb-caption, .lb-count { display: none; }',
        '  .lb-btn { width: 40px; height: 40px; }',
        '  .lb-close { top: 0.5rem; right: 0.5rem; }',
        '  .lb-prev { left: 0.5rem; } .lb-next { right: 0.5rem; }',
        '}',
        '@media (prefers-reduced-motion: reduce) {',
        '  .lb-overlay, .lb-img, .lb-caption, .lb-btn, .lb-count { transition-duration: 1ms !important; }',
        '}'
    ].join('\n');

    var DURATION = 280;
    var EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

    var thumbs = [];
    var overlay, stage, imgEl, videoEl, capEl, countEl, prevBtn, nextBtn, closeBtn;
    var videoTimer = 0;
    var current = -1;
    var animating = false;
    var lastFocus = null;
    var scrollLock = 0;

    function reducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function captionFor(img) {
        if (img.getAttribute('data-caption')) return img.getAttribute('data-caption');
        // A caption is usually the next sibling, or the next sibling of the wrapper.
        var probes = [img.nextElementSibling,
                      img.parentElement && img.parentElement.nextElementSibling];
        for (var i = 0; i < probes.length; i++) {
            var el = probes[i];
            if (el && /photo-caption|project-image-caption|chart-caption/.test(el.className || '')) {
                return el.textContent.trim();
            }
            if (el && el.tagName === 'FIGCAPTION') return el.textContent.trim();
        }
        return img.getAttribute('alt') || '';
    }

    /* Largest rect with the image's aspect ratio that fits the viewport. */
    function fitRect(natW, natH) {
        // Measure the fixed overlay itself: on iOS it tracks rotation more reliably than window.inner*.
        var vw = (overlay && overlay.clientWidth) || window.innerWidth;
        var vh = (overlay && overlay.clientHeight) || window.innerHeight;
        // Landscape phones are wide but short: drop the caption gutter and use the full height.
        var short = vh < 500 && vw > vh;
        var padX = short ? 56 : (vw < 600 ? 16 : 72);
        var padY = short ? 0 : (vw < 600 ? 88 : 104);
        var availW = Math.max(80, vw - padX * 2);
        var availH = Math.max(80, vh - padY * 2);
        var ratio = natW / natH;
        var w = availW, h = w / ratio;
        if (h > availH) { h = availH; w = h * ratio; }
        // Never upscale a small image beyond its natural size.
        if (w > natW) { w = natW; h = natH; }
        return {
            width: w, height: h,
            left: (vw - w) / 2,
            top: (vh - h) / 2
        };
    }

    function placeFinal(rect) {
        [imgEl, videoEl].forEach(function (el) {
            el.style.left = rect.left + 'px';
            el.style.top = rect.top + 'px';
            el.style.width = rect.width + 'px';
            el.style.height = rect.height + 'px';
        });
    }

    /* Thumbs browsable alongside the given one: its [data-gallery] group, else all ungrouped images. */
    function groupOf(thumb) {
        var g = thumb.closest('[data-gallery]');
        return thumbs.filter(function (t) { return t.closest('[data-gallery]') === g; });
    }

    function stopVideo() {
        window.clearTimeout(videoTimer);
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.classList.add('lb-hidden');
        imgEl.classList.remove('lb-hidden');
    }

    /* Swap the poster for the playing clip once it has finished growing into place. */
    function startVideo(thumb, delay) {
        videoTimer = window.setTimeout(function () {
            videoEl.src = thumb.getAttribute('data-video');
            videoEl.poster = thumb.currentSrc || thumb.src;
            videoEl.classList.remove('lb-hidden');
            imgEl.classList.add('lb-hidden');
            var p = videoEl.play();
            if (p && p.catch) p.catch(function () {});
        }, delay);
    }

    /* Transform that maps the final rect onto the thumbnail's on-screen box. */
    function thumbTransform(rect, thumb) {
        var t = thumb.getBoundingClientRect();
        if (!t.width || !t.height) return null;
        var sx = t.width / rect.width;
        var sy = t.height / rect.height;
        var dx = t.left - rect.left;
        var dy = t.top - rect.top;
        return 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    }

    function thumbRadius(thumb) {
        var r = window.getComputedStyle(thumb).borderRadius;
        if (r && r !== '0px') return r;
        // Round crops (e.g. team portraits) put the radius on a clipping wrapper.
        var parent = thumb.parentElement;
        if (parent) {
            var ps = window.getComputedStyle(parent);
            if (ps.overflow === 'hidden' && ps.borderRadius && ps.borderRadius !== '0px') {
                return ps.borderRadius;
            }
        }
        return '0px';
    }

    function lockScroll() {
        scrollLock = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = -scrollLock + 'px';
        document.body.style.width = '100%';
    }

    function unlockScroll() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollLock);
    }

    function render(index, animateFrom) {
        var thumb = thumbs[index];
        current = index;
        stopVideo();
        var isVideo = thumb.hasAttribute('data-video');

        var natW = thumb.naturalWidth || thumb.offsetWidth || 1200;
        var natH = thumb.naturalHeight || thumb.offsetHeight || 800;

        imgEl.src = thumb.currentSrc || thumb.src;
        imgEl.alt = thumb.alt || '';

        var rect = fitRect(natW, natH);
        placeFinal(rect);

        var cap = captionFor(thumb);
        capEl.textContent = cap;
        capEl.classList.toggle('lb-hidden', !cap);

        var group = groupOf(thumb);
        countEl.textContent = group.length > 1 ? (group.indexOf(thumb) + 1) + ' / ' + group.length : '';
        var solo = group.length < 2;
        prevBtn.classList.toggle('lb-hidden', solo);
        nextBtn.classList.toggle('lb-hidden', solo);

        if (animateFrom && !reducedMotion()) {
            var tf = thumbTransform(rect, thumb);
            if (tf) {
                animating = true;
                imgEl.style.transition = 'none';
                imgEl.style.transform = tf;
                imgEl.style.borderRadius = thumbRadius(thumb);
                // Force layout so the start state is committed before transitioning.
                void imgEl.offsetWidth;
                imgEl.style.transition = 'transform ' + DURATION + 'ms ' + EASING +
                                         ', border-radius ' + DURATION + 'ms ' + EASING;
                imgEl.style.transform = 'translate(0,0) scale(1,1)';
                imgEl.style.borderRadius = '0px';
                window.setTimeout(function () { animating = false; }, DURATION);
                if (isVideo) startVideo(thumb, DURATION);
                return;
            }
        }
        imgEl.style.transition = 'none';
        imgEl.style.transform = 'translate(0,0) scale(1,1)';
        imgEl.style.borderRadius = '0px';
        if (isVideo) startVideo(thumb, 0);
    }

    function open(index) {
        if (animating) return;
        lastFocus = document.activeElement;
        overlay.setAttribute('aria-hidden', 'false');
        lockScroll();
        overlay.classList.add('lb-open');
        render(index, true);
        closeBtn.focus({ preventScroll: true });
    }

    function close() {
        if (animating || current < 0) return;
        var thumb = thumbs[current];
        stopVideo();
        var finish = function () {
            overlay.classList.remove('lb-open');
            overlay.setAttribute('aria-hidden', 'true');
            imgEl.removeAttribute('src');
            unlockScroll();
            current = -1;
            animating = false;
            if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
        };

        var rect = { left: parseFloat(imgEl.style.left), top: parseFloat(imgEl.style.top),
                     width: parseFloat(imgEl.style.width), height: parseFloat(imgEl.style.height) };
        var tf = thumb ? thumbTransform(rect, thumb) : null;

        if (tf && !reducedMotion() && isInViewport(thumb)) {
            animating = true;
            overlay.style.transition = 'opacity ' + DURATION + 'ms ' + EASING;
            overlay.classList.remove('lb-open');
            overlay.classList.add('lb-closing');
            overlay.style.visibility = 'visible';
            overlay.style.opacity = '0';
            imgEl.style.transition = 'transform ' + DURATION + 'ms ' + EASING +
                                     ', border-radius ' + DURATION + 'ms ' + EASING;
            imgEl.style.transform = tf;
            imgEl.style.borderRadius = thumbRadius(thumb);
            window.setTimeout(function () {
                overlay.classList.remove('lb-closing');
                overlay.style.transition = '';
                overlay.style.opacity = '';
                overlay.style.visibility = '';
                finish();
            }, DURATION);
        } else {
            finish();
        }
    }

    function isInViewport(el) {
        var r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    }

    function step(delta) {
        var group = groupOf(thumbs[current]);
        if (group.length < 2 || animating) return;
        var pos = group.indexOf(thumbs[current]);
        render(thumbs.indexOf(group[(pos + delta + group.length) % group.length]), false);
    }

    function build() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        overlay = document.createElement('div');
        overlay.className = 'lb-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Image viewer');
        overlay.setAttribute('aria-hidden', 'true');

        stage = document.createElement('div');
        stage.className = 'lb-stage';

        imgEl = document.createElement('img');
        imgEl.className = 'lb-img';

        videoEl = document.createElement('video');
        videoEl.className = 'lb-video lb-hidden';
        videoEl.controls = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('playsinline', '');
        videoEl.preload = 'auto';

        capEl = document.createElement('div');
        capEl.className = 'lb-caption';

        countEl = document.createElement('div');
        countEl.className = 'lb-count';

        closeBtn = button('lb-close', 'Close image viewer', '<path d="M6 6l12 12M18 6L6 18"/>');
        prevBtn = button('lb-prev', 'Previous image', '<path d="M15 5l-7 7 7 7"/>');
        nextBtn = button('lb-next', 'Next image', '<path d="M9 5l7 7-7 7"/>');

        stage.appendChild(imgEl);
        stage.appendChild(videoEl);
        overlay.appendChild(stage);
        overlay.appendChild(capEl);
        overlay.appendChild(countEl);
        overlay.appendChild(closeBtn);
        overlay.appendChild(prevBtn);
        overlay.appendChild(nextBtn);
        document.body.appendChild(overlay);

        closeBtn.addEventListener('click', close);
        prevBtn.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
        nextBtn.addEventListener('click', function (e) { e.stopPropagation(); step(1); });
        // Clicking the backdrop closes; clicking the photo itself does not.
        overlay.addEventListener('click', function (e) {
            if (e.target === imgEl || e.target === videoEl) return;
            close();
        });

        document.addEventListener('keydown', function (e) {
            if (!overlay.classList.contains('lb-open')) return;
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
            else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
        });

        function relayout() {
            if (current < 0 || overlay.classList.contains('lb-closing')) return;
            var t = thumbs[current];
            imgEl.style.transition = 'none';
            imgEl.style.transform = 'translate(0,0) scale(1,1)';
            placeFinal(fitRect(t.naturalWidth || 1200, t.naturalHeight || 800));
        }
        // Phones report the new size late during a rotation, so measure again once it settles.
        var relayoutTimers = [];
        function relayoutSoon() {
            relayout();
            relayoutTimers.forEach(window.clearTimeout);
            relayoutTimers = [150, 400, 800].map(function (ms) { return window.setTimeout(relayout, ms); });
        }
        window.addEventListener('resize', relayoutSoon);
        window.addEventListener('orientationchange', relayoutSoon);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', relayoutSoon);

        var sx = 0, sy = 0, onControls = false;
        overlay.addEventListener('touchstart', function (e) {
            sx = e.changedTouches[0].clientX; sy = e.changedTouches[0].clientY;
            var vr = videoEl.getBoundingClientRect();
            onControls = !videoEl.classList.contains('lb-hidden') && sy > vr.bottom - 60 && sy < vr.bottom;
        }, { passive: true });
        overlay.addEventListener('touchend', function (e) {
            if (onControls) return;
            var dx = e.changedTouches[0].clientX - sx;
            var dy = e.changedTouches[0].clientY - sy;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
            else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) close();
        }, { passive: true });
    }

    function button(cls, label, path) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lb-btn ' + cls;
        b.setAttribute('aria-label', label);
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
        return b;
    }

    function bind() {
        var all = document.querySelectorAll('img:not([data-no-lightbox])');
        Array.prototype.forEach.call(all, function (img) {
            if (img.closest('.lb-overlay')) return;
            thumbs.push(img);
            img.classList.add('lb-thumb');
            if (!img.hasAttribute('tabindex')) img.setAttribute('tabindex', '0');
            img.setAttribute('role', 'button');
            img.setAttribute('aria-label', (img.hasAttribute('data-video') ? 'Play video' : 'Expand image') + (img.alt ? ': ' + img.alt : ''));
            img.addEventListener('click', function () { open(thumbs.indexOf(img)); });
            img.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open(thumbs.indexOf(img));
                }
            });
        });
    }

    function init() {
        build();
        bind();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
