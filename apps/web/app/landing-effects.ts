/* eslint-disable */
// @ts-nocheck
/**
 * Scroll choreography for the landing page, transcribed from the design
 * export's own script.
 *
 * Deliberately kept close to the original rather than rewritten. It is ~500
 * lines of hand-tuned animation maths — pinned sequences, scrubbed card stacks,
 * a converge panel, count-ups and reveals — and every constant in it was chosen
 * against the design. Re-deriving that from the rendered result would be
 * guesswork; porting it verbatim makes the page behave as designed, and any
 * later change is a diff against something known-good.
 *
 * The only structural changes: the class's `this._x` handles become fields on a
 * local `state` object, componentDidMount becomes the effect body, and
 * componentWillUnmount becomes the returned cleanup. Type checking is off for
 * this file — it is ported JavaScript, and annotating it would mean editing the
 * very lines that are meant to stay untouched.
 *
 * Everything it drives is addressed by id or data-attribute on markup the
 * converter emits, so it fails quietly if an element is missing rather than
 * throwing and taking the page down with it.
 */
export function initLandingEffects(): () => void {
  const state: any = {}

  function setupConverge(sec: any, pin: any) {
    const barLeft = document.getElementById('cvBarLeft');
    const barRight = document.getElementById('cvBarRight');
    const circle = document.getElementById('cvCircle');
    const content = [
      document.getElementById('cvEyebrow'),
      document.getElementById('cvHead'),
      document.getElementById('cvSub'),
      document.getElementById('cvBtn'),
    ];

    const SCALE_FINAL = 30;
    const BAR_START = 0.16;

    const easePower2Out = (t) => 1 - (1 - t) * (1 - t);
    const easeBackOut = (t) => { const c1 = 1.70158, c3 = c1 + 1; const x = t - 1; return 1 + c3 * x * x * x + c1 * x * x; };
    const easeExpoOut = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const seg = (p, a, b) => clamp01((p - a) / (b - a));

    const render = (p) => {
      const barT = easePower2Out(seg(p, 0, 0.2));
      const barScale = BAR_START + (1 - BAR_START) * barT;
      const barOpacity = 1 - seg(p, 0.42, 1.0);
      barLeft.style.transform = `translateY(-50%) scaleX(${barScale})`;
      barRight.style.transform = `translateY(-50%) scaleX(${barScale})`;
      barLeft.style.opacity = barOpacity;
      barRight.style.opacity = barOpacity;

      const dotT = easeBackOut(seg(p, 0.35, 0.42));
      const expT = easeExpoOut(seg(p, 0.42, 1.0));
      let circleScale;
      if (p <= 0.42) circleScale = dotT;
      else circleScale = 1 + (SCALE_FINAL - 1) * expT;
      circle.style.transform = `translate(-50%,-50%) scale(${Math.max(0, circleScale)})`;
      circle.style.left = '50%';
      circle.style.top = '50%';
      circle.style.marginLeft = '0';
      circle.style.marginTop = '0';

      const spanStart = 0.42, spanEnd = 1.0;
      const t = easePower2Out(seg(p, spanStart, spanEnd));
      content.forEach((el) => {
        el.style.opacity = t;
        el.style.transform = `translateY(${16 * (1 - t)}px)`;
      });
    };

    circle.style.left = '50%'; circle.style.top = '50%'; circle.style.marginLeft = '0'; circle.style.marginTop = '0';
    barLeft.style.transform = `translateY(-50%) scaleX(${BAR_START})`;
    barRight.style.transform = `translateY(-50%) scaleX(${BAR_START})`;
    circle.style.transform = 'translate(-50%,-50%) scale(0)';
    content.forEach((el) => { el.style.opacity = '0'; el.style.transform = 'translateY(16px)'; });

    const update = () => {
      const r = sec.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      if (r.top <= 0 && r.bottom >= window.innerHeight) {
        pin.style.position = 'fixed';
        pin.style.top = '0px';
        pin.style.width = r.width + 'px';
        pin.style.left = r.left + 'px';
      } else {
        document.documentElement.removeAttribute('data-lp-pinned');
        pin.style.position = 'absolute';
        pin.style.width = '100%';
        pin.style.left = '0px';
        pin.style.top = (r.top > 0 ? 0 : Math.max(0, travel)) + 'px';
      }
      const p = clamp01(-r.top / Math.max(1, travel));
      render(p);
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    state._cvCleanup = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    update();
  }

  function initConverge() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const trySetup = (attemptsLeft) => {
      const sec = document.getElementById('cvSec');
      const pin = document.getElementById('cvPin');
      if (!sec || !pin) {
        if (attemptsLeft > 0) requestAnimationFrame(() => trySetup(attemptsLeft - 1));
        return;
      }
      setupConverge(sec, pin);
    };
    trySetup(120); // retry across ~2s of frames while the streamed template finishes mounting
  }

  function initExpandHero() {
    const img = document.getElementById('expandImg');
    const bg = document.getElementById('bgImg');
    const section = document.getElementById('expandSection');
    const pin = document.getElementById('expandPin');
    if (!img || !section || !pin) return;
    img.style.width = '260px';
    img.style.height = '260px';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    let raf = null;
    const compute = () => {
      const minW = 260, maxW = Math.min(window.innerWidth * 0.92, 1100);
      const minH = 260, maxH = Math.min(window.innerHeight * 0.82, 720);
      const rect = section.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      img.style.width = (minW + progress * (maxW - minW)) + 'px';
      img.style.height = (minH + progress * (maxH - minH)) + 'px';
      img.style.borderRadius = (24 - progress * 12) + 'px';
      if (bg) bg.style.opacity = String(1 - progress);
      // sticky fails inside this page's overflow wrapper — pin with fixed instead
      if (rect.top <= 0 && rect.bottom >= window.innerHeight) {
        // While this section owns the whole viewport its card grows to fill it,
        // and the sticky header sits on top of the card the entire way through.
        // The export never hits this because its own nav is inside an overflow
        // wrapper and stops sticking; ours is a real sticky header, so it is
        // faded out for the duration and comes back after.
        document.documentElement.setAttribute('data-lp-pinned', '');
        pin.style.position = 'fixed';
        pin.style.top = '0px';
        pin.style.width = rect.width + 'px';
        pin.style.left = rect.left + 'px';
      } else {
        document.documentElement.removeAttribute('data-lp-pinned');
        pin.style.position = 'absolute';
        pin.style.width = '100%';
        pin.style.left = '0px';
        pin.style.top = (rect.top > 0 ? 0 : Math.max(0, travel)) + 'px';
      }
      raf = null;
    };
    const onScroll = () => { if (raf === null) raf = requestAnimationFrame(compute); };
    state._onExpandScroll = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    compute();
  }

  // ── componentDidMount ────────────────────────────────────────────────────

    initConverge();
    initExpandHero();
    const stackOuter = document.querySelector('.stack-outer');
    const stackPin = document.querySelector('.stack-pin');
    const stackCards = Array.from(document.querySelectorAll('[data-stack-card]'));
    if (stackOuter && stackPin && stackCards.length > 1) {
      const N = stackCards.length;
      const peek = 40;
      const gap = 40;
      const cardHeights = stackCards.map(c => c.getBoundingClientRect().height || 380);
      const cardHeight = Math.max(...cardHeights);
      stackPin.style.height = cardHeight + 'px';
      const pinHeight = cardHeight;
      const segment = 1 / (N - 1);
      stackPin.style.overflow = 'visible';
      const onStackScroll = () => {
        const outerRect = stackOuter.getBoundingClientRect();
        const scrollable = Math.max(1, stackOuter.offsetHeight - pinHeight);
        const progress = Math.min(1, Math.max(0, -outerRect.top / scrollable));
        let prevY = 0;
        stackCards.forEach((card, i) => {
          if (i === 0) { card.style.transform = 'translateY(0px)'; card.style.zIndex = 1; prevY = 0; return; }
          const segStart = (i - 1) * segment;
          const segEnd = i * segment;
          const finalY = i * peek;
          const waitY = prevY + cardHeights[i - 1] + gap;
          let y;
          if (progress <= segStart) { y = waitY; }
          else if (progress < segEnd) {
            const t = (progress - segStart) / segment;
            y = waitY + (finalY - waitY) * t;
          } else { y = finalY; }
          card.style.transform = `translateY(${y.toFixed(1)}px)`;
          card.style.zIndex = 1 + i;
          prevY = y;
        });
      };
      window.addEventListener('scroll', onStackScroll, { passive: true });
      window.addEventListener('resize', onStackScroll, { passive: true });
      state._onStackScroll = onStackScroll;
      onStackScroll();
    }
    const onCampaignScroll = () => {
      const cards = Array.from(document.querySelectorAll('[data-pcard]'));
      const n = cards.length;
      cards.forEach((card, i) => {
        const cRect = card.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, 1 - cRect.top / (window.innerHeight * 0.4)));
        const targetScale = 1 - (n - 1 - i) * 0.03;
        const scale = 1 - (1 - targetScale) * Math.min(1, progress);
        card.style.transform = `scale(${scale})`;
      });
    };
    window.addEventListener('scroll', onCampaignScroll, { passive: true });
    window.addEventListener('resize', onCampaignScroll, { passive: true });
    state._onCampaignScroll = onCampaignScroll;
    onCampaignScroll();

    const brandRow = document.getElementById('brandPillRow');
    if (brandRow) {
      const pills = Array.from(brandRow.querySelectorAll('.brand-pill'));
      if (pills.length > 4) {
        const track = document.createElement('div');
        track.className = 'brand-pill-track';
        pills.forEach(p => track.appendChild(p));
        pills.forEach(p => track.appendChild(p.cloneNode(true)));
        brandRow.innerHTML = '';
        brandRow.appendChild(track);
        brandRow.classList.add('marquee-active');
      }
    }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // scroll progress + nav condense (native scroll — no smooth-scroll library)
    const progress = document.getElementById('scrollProgress');
    const navBar = document.getElementById('navBar');
    const onScroll = () => {
      const h = document.documentElement;
      const p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
      if (progress) progress.style.width = (p * 100) + '%';
      if (navBar) navBar.style.padding = h.scrollTop > 20 ? '5px 8px 5px 16px' : '8px 10px 8px 20px';
    };
    // pinned How-it-works sequence (scroll-progress driven)
    const hwSec = document.querySelector('.hw-sec');
    const hwPin = document.querySelector('.hw-pin');
    const hwCards = Array.from(document.querySelectorAll('[data-hw-card]'));
    const hwTexts = Array.from(document.querySelectorAll('[data-hw-text]'));
    const hwDots = Array.from(document.querySelectorAll('[data-hw-dot]'));
    const hwTints = Array.from(document.querySelectorAll('[data-hw-tint]'));
    const N = 4;
    const cl = (v, a, b) => Math.min(b, Math.max(a, v));
    // continuous scroll-scrubbed sequence: each step gets a dwell, transitions are big moves
    const applyHw = (p) => {
      const H = window.innerHeight, unit = 1 / (N - 1);
      let near = 0, nd = 99;
      for (let i = 0; i < N; i++) {
        const d = cl(((p - i * unit) / unit) * 2.4, -1.9, 1.9);
        const a = Math.abs(d);
        if (a < nd) { nd = a; near = i; }
        const card = hwCards[i];
        if (card) {
          card.style.transform = 'translate3d(' + (-d * 52) + 'px,' + (-d * 0.82 * H) + 'px,0) rotate(' + (-d * 8.5) + 'deg) scale(' + (1 - Math.min(a, 1) * 0.17) + ')';
          card.style.opacity = String(cl(1 - (a - 0.6) / 0.5, 0, 1));
          card.style.zIndex = String(40 - Math.round(a * 10));
        }
        const t = hwTexts[i];
        if (t) {
          t.style.transform = 'translate3d(0,' + (-d * 140) + 'px,0)';
          t.style.opacity = String(cl(1 - (a - 0.55) / 0.75, 0, 1));
          const hd = t.querySelector('.hw-head');
          if (hd) hd.style.transform = 'translate3d(0,' + (-d * 78) + 'px,0)';
        }
        const tint = hwTints[i];
        if (tint) tint.style.opacity = i === 0 ? '1' : String(cl(1 - (a - 0.5) / 0.85, 0, 1));
      }
      hwDots.forEach((el, i) => { i === near ? el.setAttribute('data-hw-on', '') : el.removeAttribute('data-hw-on'); });
      const topbar = document.getElementById('hwTopbar');
      if (topbar) topbar.style.opacity = '1';
    };
    const updateHw = () => {
      if (!hwSec || !hwPin) return;
      if (getComputedStyle(hwPin).display === 'none') { hwPin.removeAttribute('data-hw-fixed'); return; }
      const r = hwSec.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
      applyHw(p);
      // sticky fails inside this page's overflow wrapper — pin with fixed instead
      if (r.top <= 0 && r.bottom >= window.innerHeight) {
        hwPin.setAttribute('data-hw-fixed', '');
        hwPin.style.top = '0px';
        hwPin.style.width = r.width + 'px';
        hwPin.style.left = r.left + 'px';
      } else {
        hwPin.removeAttribute('data-hw-fixed');
        hwPin.style.width = '100%';
        hwPin.style.left = '0px';
        hwPin.style.top = (r.top > 0 ? 0 : Math.max(0, travel)) + 'px';
      }
    };

    // pinned manifesto sequence removed with the mf-sec markup; keep shared seg()/setupDash() for the meet-section below
    const seg = (s0, s1, v) => cl((v - s0) / (s1 - s0), 0, 1);
    const setupDash = (el) => { if (!el || !el.getTotalLength) return null; const len = el.getTotalLength(); el.style.strokeDasharray = String(len); el.style.strokeDashoffset = String(len); return len; };

    const onScrollAll = () => { onScroll(); updateHw(); };

    window.addEventListener('scroll', onScrollAll, { passive: true });
    document.addEventListener('scroll', onScrollAll, { passive: true, capture: true });
    window.addEventListener('resize', onScrollAll);
    // snap to the next/prev card (in scroll direction) once scrolling settles inside the pinned How-it-works section
    let hwSnapTimer = null, hwLastP = null, hwSnapping = false;
    const hwSnapCheck = () => {
      if (hwSnapping) return;
      clearTimeout(hwSnapTimer);
      hwSnapTimer = setTimeout(() => {
        if (!hwSec || !hwPin || getComputedStyle(hwPin).display === 'none') return;
        const r = hwSec.getBoundingClientRect();
        const travel = r.height - window.innerHeight;
        if (travel <= 0) return;
        const p = Math.min(1, Math.max(0, -r.top / travel));
        if (p <= 0.01 || p >= 0.99) { hwLastP = p; return; }
        const N = 4;
        const step = 1 / (N - 1);
        const curIdx = p / step;
        const atCard = Math.abs(curIdx - Math.round(curIdx)) < 0.02;
        if (atCard) { hwLastP = p; return; }
        const dir = hwLastP === null ? 0 : Math.sign(p - hwLastP);
        const targetIdx = dir >= 0 ? Math.ceil(curIdx - 0.02) : Math.floor(curIdx + 0.02);
        const nearest = Math.min(N - 1, Math.max(0, targetIdx)) * step;
        hwLastP = p;
        hwSnapping = true;
        const targetTop = window.scrollY + (nearest - p) * travel;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
        setTimeout(() => { hwSnapping = false; }, 500);
      }, 90);
    };
    window.addEventListener('scroll', hwSnapCheck, { passive: true });
    document.addEventListener('scroll', hwSnapCheck, { passive: true, capture: true });
    // rAF ticker: the page may scroll inside a wrapper that never fires window scroll
    let lastTop = null, lastTopMf = null, lastTopMeet = null;
    const tick = () => {
      let changed = false;
      if (hwSec) { const t = Math.round(hwSec.getBoundingClientRect().top); if (t !== lastTop) { lastTop = t; changed = true; } }
      if (changed) onScrollAll();
      state._raf = requestAnimationFrame(tick);
    };
    state._raf = requestAnimationFrame(tick);
    state._onScroll = onScrollAll;
    onScroll();
    applyHw(0);
    updateHw();


    // scroll reveals
    if (!reduce) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('sr-in'); e.target.classList.add('anim-on'); }
          else { e.target.classList.remove('anim-on'); }
        });
      }, { threshold: 0.01 });
      document.querySelectorAll('.sr').forEach(el => io.observe(el));
      state._io = io;
    } else {
      document.querySelectorAll('.sr').forEach(el => { el.classList.add('sr-in'); });
    }

    const mosEls = document.querySelectorAll('[data-mos]');
    if (mosEls.length) {
      if (reduce) { mosEls.forEach(el => el.classList.add('mos-in')); }
      else {
        const mosIo = new IntersectionObserver((entries) => {
          entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('mos-in'); mosIo.unobserve(e.target); } });
        }, { threshold: 0.2 });
        mosEls.forEach(el => mosIo.observe(el));
      }
    }
    // stat count-up
    const countIo = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        countIo.unobserve(e.target);
        const el = e.target;
        const target = parseFloat(el.getAttribute('data-countup'));
        if (isNaN(target)) return;
        const suffix = el.getAttribute('data-suffix') || '';
        if (reduce) { el.textContent = target + suffix; return; }
        const dur = 1200, t0 = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('[data-countup]').forEach(el => countIo.observe(el));
    state._countIo = countIo;

    // magnetic buttons
    if (!reduce && window.matchMedia('(pointer:fine)').matches) {
      state._magnetCleanups = [];
      document.querySelectorAll('.magnet').forEach((el) => {
        const onM = (e) => {
          const r = el.getBoundingClientRect();
          const mx = e.clientX - (r.left + r.width / 2), my = e.clientY - (r.top + r.height / 2);
          el.style.transform = 'translate(' + (mx * 0.22) + 'px,' + (my * 0.22) + 'px)';
        };
        const onL = () => { el.style.transform = 'translate(0,0)'; };
        el.addEventListener('mousemove', onM);
        el.addEventListener('mouseleave', onL);
        state._magnetCleanups.push(() => { el.removeEventListener('mousemove', onM); el.removeEventListener('mouseleave', onL); });
      });
    }

  

  // ── componentWillUnmount ─────────────────────────────────────────────────
  return () => {
    document.documentElement.removeAttribute('data-lp-pinned');
    if (state._cvCleanup) state._cvCleanup();
    if (state._onStackScroll) { window.removeEventListener('scroll', state._onStackScroll); window.removeEventListener('resize', state._onStackScroll); }
    if (state._onScroll) { window.removeEventListener('scroll', state._onScroll); window.removeEventListener('resize', state._onScroll); }
    if (state._io) state._io.disconnect();
    if (state._countIo) state._countIo.disconnect();
    (state._magnetCleanups || []).forEach(fn => fn());
  }
}
