/* =======================================================================
   KUBRA BUILDING SERVICES P/L — interactions
   ======================================================================= */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* -----------------------------------------------------------------------
   HERO — scroll-driven build
   Desktop: canvas WEBP FRAME-SEQUENCE (zero seek latency — synchronous paint)
   Mobile: <video> scrub of portrait/fallback encode
----------------------------------------------------------------------- */
(function heroScrub() {
    const hero = document.getElementById("hero");
    const video = document.getElementById("heroVideo");
    const fallback = document.getElementById("heroFallback");
    const canvas = document.getElementById("heroCanvas");
    const scrim = document.getElementById("heroScrim");
    const content = document.getElementById("heroContent");
    const cue = document.getElementById("heroCue");
    const bar = document.getElementById("heroBar");
    const nav = document.getElementById("nav");
    if (!hero) return;

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const ctx = (!isMobile && canvas) ? canvas.getContext("2d") : null;
    const useFrames = !!ctx;

    /* ---- LOADER GATE ---- */
    const loader = document.getElementById("loader");
    const loaderBar = document.getElementById("loaderBar");
    const loaderPct = document.getElementById("loaderPct");
    const gateStart = performance.now();
    let gateDone = false;

    function setGate(p) {
        p = clamp(p, 0, 1);
        if (loaderBar) loaderBar.style.width = (p * 100).toFixed(1) + "%";
        if (loaderPct) loaderPct.textContent = Math.round(p * 100);
        if (p >= 1) finishGate();
    }
    function finishGate() {
        if (gateDone) return;
        gateDone = true;
        const wait = Math.max(0, 700 - (performance.now() - gateStart));
        setTimeout(() => {
            if (loaderBar) loaderBar.style.width = "100%";
            if (loaderPct) loaderPct.textContent = "100";
            if (loader) loader.classList.add("is-done");
            document.body.classList.remove("is-loading");
            setTimeout(() => { if (loader) loader.remove(); }, 800);
        }, wait);
    }
    setTimeout(finishGate, 15000); // hard release timeout

    /* Fetch video with progress fallback */
    async function fetchVideoGated(url) {
        try {
            const res = await fetch(url);
            if (!res.ok || !res.body) throw new Error("fetch failed");
            const total = +res.headers.get("Content-Length") || 0;
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;
            for (; ;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                setGate(total ? received / total : Math.min(0.95, received / 12e6));
            }
            return URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
        } catch (e) {
            setGate(1);
            return url;
        }
    }

    /* Media sources */
    if (isMobile && video) {
        video.poster = "assets/hero-poster.jpg";
        if (fallback) fallback.src = "assets/hero-poster.jpg";
        fetchVideoGated("assets/build.mp4")
            .then((src) => { video.src = src; video.load(); setGate(1); })
            .catch(() => { video.src = "assets/build.mp4"; video.load(); finishGate(); });
    } else if (!useFrames && video) {
        fetchVideoGated("assets/build.mp4")
            .then((src) => { video.src = src; video.load(); setGate(1); })
            .catch(() => { video.src = "assets/build.mp4"; video.load(); finishGate(); });
    }

    /* ---- CACHED GEOMETRY (ZERO LAYOUT THRASHING) ---- */
    let heroTop = 0, heroHeight = 0, windowHeight = window.innerHeight, totalScrollable = 0, cachedNavH = 74;

    function measureLayout() {
        const rect = hero.getBoundingClientRect();
        heroTop = rect.top + window.scrollY;
        heroHeight = hero.offsetHeight;
        windowHeight = window.innerHeight;
        totalScrollable = Math.max(1, heroHeight - windowHeight);
        cachedNavH = nav ? (nav.offsetHeight || 74) : 74;
        if (useFrames) sizeCanvas();
        requestTick();
    }

    function setNav(heroBottomRelative) {
        if (nav) {
            nav.classList.toggle("nav--solid", heroBottomRelative <= cachedNavH + 2);
        }
    }

    function getProgress() {
        const scrolled = clamp(window.scrollY - heroTop, 0, totalScrollable);
        return totalScrollable > 0 ? scrolled / totalScrollable : 0;
    }

    /* =====================================================================
       FRAME-SEQUENCE ENGINE (desktop)
       ===================================================================== */
    const FRAME_COUNT = 226;
    const framePath = (i) => "assets/frames/f" + String(i + 1).padStart(4, "0") + ".webp";
    const frames = new Array(FRAME_COUNT);
    let curIdx = -1, firstDrawn = false, lastDrawnPos = -1, canvasDirty = true;

    function sizeCanvas() {
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round((r.width || window.innerWidth) * dpr));
        const h = Math.max(1, Math.round((r.height || window.innerHeight) * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
            canvasDirty = true;
        }
    }

    const loadedAt = (idx) => {
        const im = frames[idx];
        return im && im.complete && im.naturalWidth ? im : null;
    };

    function paintCover(im, alpha) {
        if (!ctx || !canvas) return;
        const cw = canvas.width, ch = canvas.height, iw = im.naturalWidth, ih = im.naturalHeight;
        const scale = Math.max(cw / iw, ch / ih);
        const dw = iw * scale, dh = ih * scale;
        ctx.globalAlpha = alpha;
        ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        ctx.globalAlpha = 1;
    }

    function drawFrame(pos) {
        if (!useFrames) return;
        pos = clamp(pos, 0, FRAME_COUNT - 1);
        let i0 = Math.floor(pos);
        let frac = pos - i0;
        let a = loadedAt(i0);
        if (!a) {
            let j = i0;
            while (j > 0 && !loadedAt(j)) j--;
            a = loadedAt(j);
            if (!a) return;
            i0 = j; frac = 0;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paintCover(a, 1);
        if (frac > 0.02 && i0 + 1 <= FRAME_COUNT - 1) {
            const b = loadedAt(i0 + 1);
            if (b) paintCover(b, frac);
        }
        curIdx = i0;
        canvasDirty = false;
    }

    function preloadFrames(count) {
        let settled = 0;
        const tally = () => {
            settled++;
            setGate(settled / count);
        };
        for (let i = 0; i < count; i++) {
            const im = new Image();
            im.decoding = "async";
            im.onload = () => {
                tally();
                if (!firstDrawn) {
                    firstDrawn = true;
                    if (canvas) canvas.classList.add("is-active");
                    drawFrame(0);
                } else if (i === curIdx || i === curIdx + 1) {
                    canvasDirty = true;
                    requestTick();
                }
            };
            im.onerror = tally;
            im.src = framePath(i);
            frames[i] = im;
        }
    }

    /* ---- Reduced Motion ---- */
    if (reduceMotion) {
        finishGate();
        if (useFrames) {
            preloadFrames(1);
        } else if (video) {
            const showFirst = () => { try { video.pause(); video.currentTime = 0.001; } catch (e) { } };
            if (video.readyState >= 1) showFirst(); else video.addEventListener("loadedmetadata", showFirst);
        }
        window.addEventListener("scroll", measureLayout, { passive: true });
        measureLayout();
        return;
    }

    if (useFrames) preloadFrames(FRAME_COUNT);

    /* ---- Video Engine Fallback ---- */
    let duration = 0, shown = 0, seeking = false, firstFrameDone = false;

    if (!useFrames && video) {
        const setDuration = () => {
            if (video.duration && isFinite(video.duration) && video.duration > 0) {
                duration = video.duration;
                video.classList.add("is-active");
                if (!firstFrameDone) {
                    firstFrameDone = true;
                    try { video.pause(); video.currentTime = 0.001; } catch (e) { }
                }
            }
        };
        video.addEventListener("loadedmetadata", setDuration);
        video.addEventListener("durationchange", setDuration);
        if (video.readyState >= 1) setDuration();

        video.addEventListener("seeking", () => { seeking = true; });
        video.addEventListener("seeked", () => { seeking = false; });

        let primed = false;
        window.__heroPrimeAt = 0;
        function prime() {
            if (primed) return;
            primed = true;
            window.__heroPrimeAt = performance.now();
            const stop = () => { try { video.pause(); } catch (e) { } };
            const p = video.play();
            if (p && p.then) p.then(stop).catch(() => { primed = false; });
            else stop();
            setTimeout(stop, 300);
        }
        ["touchstart", "touchmove", "wheel", "pointerdown", "keydown"].forEach((ev) =>
            window.addEventListener(ev, prime, { passive: true })
        );
    }

    /* =====================================================================
       SMART RENDER LOOP (PAUSES WHEN SETTLED)
       ===================================================================== */
    let shownP = 0;
    let isTicking = false;

    function renderStep() {
        const p = getProgress();
        const heroBottomRel = (heroTop + heroHeight) - window.scrollY;

        // Visual opacity & style updates
        const fade = 1 - clamp(p / 0.18, 0, 1);
        if (content) {
            content.style.opacity = fade.toFixed(3);
            content.style.visibility = fade <= 0.001 ? "hidden" : "visible";
        }
        if (scrim) scrim.style.opacity = (0.15 + 0.85 * fade).toFixed(3);
        if (cue) cue.style.opacity = p > 0.04 ? "0" : "1";
        if (bar) bar.style.width = (p * 100).toFixed(2) + "%";
        setNav(heroBottomRel);

        let needsAnotherFrame = false;

        if (useFrames) {
            const diff = p - shownP;
            shownP += diff * 0.18;
            if (Math.abs(diff) < 0.0002) shownP = p;
            else needsAnotherFrame = true;

            const target = shownP * (FRAME_COUNT - 1);
            if (canvasDirty || Math.abs(target - lastDrawnPos) > 0.002) {
                drawFrame(target);
                lastDrawnPos = target;
            }
        } else if (video && duration > 0) {
            let wanted = p * (duration - 0.05);
            const br = video.buffered;
            if (br.length) {
                const maxEnd = br.end(br.length - 1) - 0.05;
                if (wanted > maxEnd) wanted = Math.max(0, maxEnd);
            }
            const diff = wanted - shown;
            if (Math.abs(diff) > 0.6) shown = wanted;
            else {
                shown += diff * 0.2;
                if (Math.abs(diff) < 0.004) shown = wanted;
                else needsAnotherFrame = true;
            }
            if (!seeking && video.readyState >= 2 && Math.abs(video.currentTime - shown) > 0.008) {
                try { video.currentTime = shown; } catch (e) { }
            }
            const pAt = window.__heroPrimeAt || 0;
            if (!video.paused && (!pAt || performance.now() - pAt > 350)) {
                try { video.pause(); } catch (e) { }
            }
        } else if (fallback && !useFrames) {
            fallback.style.transform = `scale(${(1.08 - p * 0.08).toFixed(4)})`;
        }

        if (needsAnotherFrame) {
            requestAnimationFrame(renderStep);
        } else {
            isTicking = false;
        }
    }

    function requestTick() {
        if (!isTicking) {
            isTicking = true;
            requestAnimationFrame(renderStep);
        }
    }

    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", measureLayout, { passive: true });
    window.addEventListener("orientationchange", measureLayout, { passive: true });

    measureLayout();
})();

/* -----------------------------------------------------------------------
   REVEAL ON SCROLL
----------------------------------------------------------------------- */
const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
}, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* -----------------------------------------------------------------------
   LIQUID-GLASS POINTER SHEEN (cards)
----------------------------------------------------------------------- */
document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
});

/* -----------------------------------------------------------------------
   STAT COUNT-UP
----------------------------------------------------------------------- */
const statIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseInt(el.dataset.count, 10);
        const dur = 1100;
        let started = null;
        function step(now) {
            if (started === null) started = now;
            const t = clamp((now - started) / dur, 0, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(eased * target).toString();
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        statIO.unobserve(el);
    });
}, { threshold: 0.6 });
document.querySelectorAll(".stat__num").forEach((el) => statIO.observe(el));

/* -----------------------------------------------------------------------
   MISC
----------------------------------------------------------------------- */
const yr = document.getElementById("yr");
if (yr) yr.textContent = new Date().getFullYear();

/* -----------------------------------------------------------------------
   ESTIMATE MODAL
----------------------------------------------------------------------- */
(function initEstimateModal() {
    const modal = document.getElementById("estimateModal");
    const backdrop = document.getElementById("modalBackdrop");
    const closeBtn = document.getElementById("modalClose");
    const form = document.getElementById("estimateForm");
    const formBody = document.getElementById("modalFormBody");
    const successBox = document.getElementById("modalSuccess");
    const successClose = document.getElementById("modalSuccessClose");
    if (!modal) return;

    function openModal(e) {
        if (e) e.preventDefault();
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
    }

    function closeModal() {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        setTimeout(() => {
            if (formBody) formBody.style.display = "block";
            if (successBox) successBox.style.display = "none";
            if (form) form.reset();
        }, 400);
    }

    // Attach modal trigger to all "Request an estimate" & "Free Estimate" buttons
    document.querySelectorAll('.nav__cta, .nav__cta-mobile, [data-open-estimate], a[href="#contact"], a[href^="mailto:"]').forEach((btn) => {
        const txt = (btn.textContent || "").toLowerCase();
        if (txt.includes("estimate") || txt.includes("start your build") || btn.classList.contains("nav__cta") || btn.hasAttribute("data-open-estimate")) {
            btn.addEventListener("click", openModal);
        }
    });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (backdrop) backdrop.addEventListener("click", closeModal);
    if (successClose) successClose.addEventListener("click", closeModal);

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("is-open")) {
            closeModal();
        }
    });

    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (formBody) formBody.style.display = "none";
            if (successBox) successBox.style.display = "block";
        });
    }
})();

/* ---- MOBILE NAV TOGGLE ---- */
(function mobileNav() {
    function initNav() {
        const nav = document.getElementById("nav");
        const toggle = document.getElementById("navToggle");
        const menu = document.getElementById("navMenu");
        if (!toggle || !menu || !nav) return;

        toggle.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = nav.classList.toggle("is-open");
            toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });

        menu.querySelectorAll("a, button").forEach((item) => {
            item.addEventListener("click", () => {
                nav.classList.remove("is-open");
                toggle.setAttribute("aria-expanded", "false");
            });
        });

        document.addEventListener("click", (e) => {
            if (!nav.contains(e.target)) {
                nav.classList.remove("is-open");
                toggle.setAttribute("aria-expanded", "false");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNav);
    } else {
        initNav();
    }
})();