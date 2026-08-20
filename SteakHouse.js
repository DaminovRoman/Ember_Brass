/* ==========================================================================
   EMBER & BRASS ATELIER — Interaction Layer
   Vanilla JS. No dependencies. GPU-friendly transforms only.
   ========================================================================== */
(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarsePointer = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const html = document.documentElement;
  const body = document.body;

  /* ------------------------------------------------------------------
     0. PRELOADER — real asset progress + graceful exit
     ------------------------------------------------------------------ */
  const preloader = document.getElementById('preloader');
  let releaseHeroEntrance = null; // set by section 4 below, called when preloader exits

  const runPreloader = () => {
    if (!preloader) {
      releaseHeroEntrance && releaseHeroEntrance();
      return;
    }

    const percentEl = document.getElementById('preloader-percent');
    const barFillEl = document.getElementById('preloader-bar-fill');
    const ringEl = document.querySelector('.preloader-ring-progress');
    const RING_CIRCUMFERENCE = 339.3;

    let displayed = 0;   // what we show (eased toward target)
    let target = 0;      // real known progress (0-1)
    let finished = false;
    let rafId = null;
    const startTime = performance.now();
    // letter-by-letter wordmark animation finishes around ~1050ms; never cut it short
    const MIN_DISPLAY_MS = prefersReducedMotion ? 0 : 1400;

    const setProgress = (p) => {
      const pct = Math.round(p * 100);
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (barFillEl) barFillEl.style.width = `${pct}%`;
      if (ringEl) ringEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - p));
    };

    let lastFrameTime = startTime;

    const tick = (now) => {
      const dt = Math.min(now - lastFrameTime, 100); // clamp in case of tab-switch jumps
      lastFrameTime = now;

      // Displayed value never jumps: it creeps forward at a steady rate,
      // only "capped" by real target progress (or by 0.98 until truly finished,
      // so it never sits stalled at 100% before assets are ready).
      const cap = finished ? 1 : Math.min(Math.max(target, 0.96), 0.98);
      const diff = cap - displayed;

      // Slow, constant crawl (per ms) plus gentle easing as it nears the cap —
      // this reads as one continuous count-up instead of jump/settle/jump.
      const crawlRate = 0.00028; // ~2.8% per second baseline
      const easeRate = diff * 0.0022;
      displayed += crawlRate * dt + easeRate * dt;

      if (displayed >= cap) displayed = cap;
      if (displayed > 1) displayed = 1;
      setProgress(displayed);

      const elapsed = now - startTime;
      if (finished && displayed >= 0.999 && elapsed >= MIN_DISPLAY_MS) {
        exitPreloader();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    const exitPreloader = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setProgress(1);

      const doExit = () => {
        preloader.classList.add('is-leaving');
        body.classList.remove('is-loading');
        releaseHeroEntrance && releaseHeroEntrance();

        const cleanup = () => {
          preloader.classList.add('is-hidden');
          preloader.removeEventListener('transitionend', cleanup);
        };
        preloader.addEventListener('transitionend', cleanup);
        // safety fallback in case transitionend doesn't fire
        setTimeout(cleanup, 1400);
      };

      if (prefersReducedMotion) {
        preloader.classList.add('is-leaving', 'is-hidden');
        body.classList.remove('is-loading');
        releaseHeroEntrance && releaseHeroEntrance();
      } else {
        // brief hold at 100% so the ring/number registers before curtains part
        setTimeout(doExit, 260);
      }
    };

    // --- track real progress: images + fonts ---
    const trackedImgs = Array.from(document.images);
    const totalAssets = Math.max(trackedImgs.length, 1);
    let loadedAssets = 0;

    const bumpAsset = () => {
      loadedAssets += 1;
      target = Math.min(loadedAssets / totalAssets, 1);
    };

    trackedImgs.forEach((img) => {
      if (img.complete) {
        bumpAsset();
      } else {
        img.addEventListener('load', bumpAsset, { once: true });
        img.addEventListener('error', bumpAsset, { once: true });
      }
    });

    const fontsReady = document.fonts && document.fonts.ready
      ? document.fonts.ready
      : Promise.resolve();

    Promise.all([
      fontsReady,
      new Promise((resolve) => {
        if (document.readyState === 'complete') resolve();
        else window.addEventListener('load', resolve, { once: true });
      }),
    ]).then(() => {
      target = 1;
      finished = true;
    });

    // hard ceiling: never let the experience hang indefinitely
    const MAX_WAIT_MS = 6000;
    setTimeout(() => {
      target = 1;
      finished = true;
    }, MAX_WAIT_MS);

    setProgress(0);
    rafId = requestAnimationFrame((firstTime) => {
      lastFrameTime = firstTime;
      tick(firstTime);
    });
  };

  /* ------------------------------------------------------------------
     1. HEADER STATE ON SCROLL
     ------------------------------------------------------------------ */
  const header = document.querySelector('.site-header');
  const setHeaderState = () => {
    if (!header) return;
    header.dataset.state = window.scrollY > 40 ? 'scrolled' : 'top';
  };
  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });

  /* ------------------------------------------------------------------
     2. MOBILE NAV TOGGLE
     ------------------------------------------------------------------ */
  const navToggle = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!isOpen));
      mobileNav.hidden = isOpen;
      html.style.overflow = isOpen ? '' : 'hidden';
      if (header) header.classList.toggle('is-menu-open', !isOpen);
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        mobileNav.hidden = true;
        html.style.overflow = '';
        if (header) header.classList.remove('is-menu-open');
      });
    });
  }

  /* ------------------------------------------------------------------
     3. SCROLL STORYTELLING — IntersectionObserver reveals
     ------------------------------------------------------------------ */
  const revealTargets = document.querySelectorAll('[data-reveal]');

  if (revealTargets.length) {
    revealTargets.forEach((el) => {
      const delay = el.dataset.revealDelay;
      if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`);
    });

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  /* ------------------------------------------------------------------
     4. HERO ENTRANCE — fire-reveal mask + text breathing
     ------------------------------------------------------------------ */
  const heroImg = document.querySelector('.reveal-mask');
  const breatheEls = document.querySelectorAll('.fx-breathe');

  breatheEls.forEach((el) => {
    const delay = el.dataset.delay;
    if (delay) el.style.setProperty('--fx-delay', `${delay}ms`);
  });

  releaseHeroEntrance = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (heroImg) heroImg.classList.add('is-revealed');
        breatheEls.forEach((el) => el.classList.add('is-visible'));
      });
    });
  };

  // Kick off the preloader now that releaseHeroEntrance is defined.
  runPreloader();

  /* ------------------------------------------------------------------
     5. PARALLAX IMAGES — requestAnimationFrame, translate3d only
     ------------------------------------------------------------------ */
  const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'));

  if (parallaxEls.length && !prefersReducedMotion) {
    let ticking = false;

    const updateParallax = () => {
      const viewportH = window.innerHeight;

      parallaxEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // Only compute for elements near the viewport
        if (rect.bottom < -200 || rect.top > viewportH + 200) return;

        const speed = parseFloat(el.dataset.parallax) || 0.15;
        const offset = (rect.top - viewportH / 2) * speed * -1;
        const clamped = Math.max(Math.min(offset, 120), -120);

        const img = el.tagName === 'IMG' ? el : el.querySelector('img');
        if (img) {
          img.style.transform = `translate3d(0, ${clamped * 0.3}px, 0) scale(1.12)`;
        }
      });

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateParallax();
  }

  /* ------------------------------------------------------------------
     6. MAGNETIC BUTTONS
     ------------------------------------------------------------------ */
  if (!isCoarsePointer && !prefersReducedMotion) {
    document.querySelectorAll('.btn-magnetic').forEach((btn) => {
      const strength = 8;

      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const moveX = (x / rect.width) * strength * 2;
        const moveY = (y / rect.height) * strength * 2;
        btn.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate3d(0, 0, 0)';
      });
    });
  }

  /* ------------------------------------------------------------------
     7. EMBER CURSOR — custom light-point cursor (signature element)
     ------------------------------------------------------------------ */
  const cursor = document.querySelector('.ember-cursor');

  if (cursor && !isCoarsePointer && !prefersReducedMotion) {
    let cx = 0, cy = 0, tx = 0, ty = 0;
    let cursorActive = false;

    window.addEventListener('mousemove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!cursorActive) {
        cursorActive = true;
        cursor.classList.add('is-active');
      }
    });

    window.addEventListener('mouseleave', () => {
      cursor.classList.remove('is-active');
      cursorActive = false;
    });

    const hoverables = 'a, button, .cut-card-trigger, input, select, textarea';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverables)) cursor.classList.add('is-hovering');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverables)) cursor.classList.remove('is-hovering');
    });

    const animateCursor = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(animateCursor);
    };
    animateCursor();
  }

  /* ------------------------------------------------------------------
     8. THE ROOM — zone switcher
     ------------------------------------------------------------------ */
  const roomImages = {
    main: 'img/11.png',
    private: 'img/12.png',
    bar: 'img/13.png',
    lounge: 'img/14.png',
  };

  const roomImageEl = document.getElementById('room-image');
  const roomButtons = document.querySelectorAll('.room-nav-btn');

  roomButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const zone = btn.dataset.room;
      if (!roomImageEl || !roomImages[zone]) return;

      roomButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      roomImageEl.classList.add('is-switching');
      window.setTimeout(() => {
        roomImageEl.src = roomImages[zone];
        roomImageEl.alt = `Интерьер ресторана — зона ${btn.textContent.trim()}`;
        roomImageEl.classList.remove('is-switching');
      }, 260);
    });
  });

  /* ------------------------------------------------------------------
     9. REVIEWS — testimonial carousel
     ------------------------------------------------------------------ */

  /* review tabs removed — quote is now static, testimonials shown in scrollable carousel below */

  /* ------------------------------------------------------------------
     9b. CUT DETAIL DIALOG — dish showcase
     ------------------------------------------------------------------ */
  const cutData = {
    ribeye: {
      name: 'Рибай',
      origin: 'USDA Prime',
      weight: '300 г',
      aging: '35 дней сухой выдержки',
      serve: 'Открытый огонь, ручная подача',
      price: '3 900 ₽',
      image: 'img/3.png',
      desc: 'Мраморная классика с насыщенным жировым рисунком. Обжарка на открытом огне подчёркивает ореховую глубину вкуса, а долгая выдержка делает текстуру мягкой и плотной одновременно.',
    },
    tomahawk: {
      name: 'Томагавк',
      origin: 'Black Angus',
      weight: '900 г',
      aging: '28 дней сухой выдержки',
      serve: 'На кости, для компании',
      price: '8 400 ₽',
      image: 'img/4.png',
      desc: 'Стейк-жест на длинной кости — центр стола и повод для разговора. Готовится над живым огнём, подаётся крупно нарезанным для совместной трапезы.',
    },
    filet: {
      name: 'Филе-миньон',
      origin: 'USDA Prime',
      weight: '220 г',
      aging: '21 день сухой выдержки',
      serve: 'Нежная текстура, тонкий срез',
      price: '4 600 ₽',
      image: 'img/5.png',
      desc: 'Самая деликатная часть отруба — минимум жира, максимум мягкости. Короткое время на огне сохраняет сочность и лёгкий, чистый вкус мяса.',
    },
    nyStrip: {
      name: 'Нью-Йорк стрип',
      origin: 'USDA Prime',
      weight: '280 г',
      aging: '30 дней сухой выдержки',
      serve: 'Плотная корочка, насыщенный вкус',
      price: '4 100 ₽',
      image: 'img/6.png',
      desc: 'Плотный, слегка волокнистый отруб с выраженным мясным характером. Тёмная корочка от открытого огня контрастирует с сочной серединой.',
    },
  };

  const cutDialog = document.getElementById('cut-dialog');
  const cutTriggers = document.querySelectorAll('.cut-card-trigger');
  const cutCloseTriggers = document.querySelectorAll('[data-close-cut]');
  const cutDialogImg = document.getElementById('cut-dialog-img');
  const cutDialogTitle = document.getElementById('cut-dialog-title');
  const cutDialogOrigin = document.getElementById('cut-dialog-origin');
  const cutDialogDesc = document.getElementById('cut-dialog-desc');
  const cutDialogAging = document.getElementById('cut-dialog-aging');
  const cutDialogWeight = document.getElementById('cut-dialog-weight');
  const cutDialogServe = document.getElementById('cut-dialog-serve');
  const cutDialogPrice = document.getElementById('cut-dialog-price');

  const openCutDialog = (key) => {
    const data = cutData[key];
    if (!cutDialog || !data) return;

    if (cutDialogImg) { cutDialogImg.src = data.image; cutDialogImg.alt = data.name; }
    if (cutDialogTitle) cutDialogTitle.textContent = data.name;
    if (cutDialogOrigin) cutDialogOrigin.textContent = data.origin;
    if (cutDialogDesc) cutDialogDesc.textContent = data.desc;
    if (cutDialogAging) cutDialogAging.textContent = data.aging;
    if (cutDialogWeight) cutDialogWeight.textContent = data.weight;
    if (cutDialogServe) cutDialogServe.textContent = data.serve;
    if (cutDialogPrice) cutDialogPrice.textContent = data.price;

    if (typeof cutDialog.showModal === 'function') {
      cutDialog.showModal();
    } else {
      cutDialog.setAttribute('open', '');
    }
    html.style.overflow = 'hidden';
  };

  const closeCutDialog = () => {
    if (!cutDialog) return;
    if (typeof cutDialog.close === 'function') {
      cutDialog.close();
    } else {
      cutDialog.removeAttribute('open');
    }
    html.style.overflow = '';
  };

  cutTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      openCutDialog(trigger.dataset.cut);
    });
  });

  cutCloseTriggers.forEach((trigger) => {
    trigger.addEventListener('click', closeCutDialog);
  });

  if (cutDialog) {
    cutDialog.addEventListener('click', (e) => {
      const rect = cutDialog.getBoundingClientRect();
      const clickedOutside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;
      if (clickedOutside) closeCutDialog();
    });

    cutDialog.addEventListener('close', () => {
      html.style.overflow = '';
    });
  }

  /* ------------------------------------------------------------------
     10. BOOKING DIALOG
     ------------------------------------------------------------------ */
  const bookingDialog = document.getElementById('booking-dialog');
  const openTriggers = document.querySelectorAll('[data-open-booking]');
  const closeTrigger = document.querySelector('[data-close-booking]');
  const bookingForm = document.getElementById('booking-form');
  const formStatus = document.getElementById('form-status');
  const typeField = document.getElementById('field-type');
  const bookingTitle = document.getElementById('booking-title');

  const openBooking = (isPrivate) => {
    if (!bookingDialog) return;
    if (typeField) typeField.value = isPrivate ? 'private' : 'table';
    if (bookingTitle) {
      bookingTitle.textContent = isPrivate ? 'Запрос приватного обеда.' : 'Подтвердите вечер.';
    }
    if (typeof bookingDialog.showModal === 'function') {
      bookingDialog.showModal();
    } else {
      bookingDialog.setAttribute('open', '');
    }
    html.style.overflow = 'hidden';
  };

  const closeBooking = () => {
    if (!bookingDialog) return;
    if (typeof bookingDialog.close === 'function') {
      bookingDialog.close();
    } else {
      bookingDialog.removeAttribute('open');
    }
    html.style.overflow = '';
  };

  openTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      openBooking(trigger.dataset.bookingType === 'private');
    });
  });

  if (closeTrigger) closeTrigger.addEventListener('click', closeBooking);

  if (bookingDialog) {
    bookingDialog.addEventListener('click', (e) => {
      const rect = bookingDialog.getBoundingClientRect();
      const clickedOutside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;
      if (clickedOutside) closeBooking();
    });

    bookingDialog.addEventListener('close', () => {
      html.style.overflow = '';
    });
  }

  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!bookingForm.checkValidity()) {
        bookingForm.reportValidity();
        return;
      }

      const formData = new FormData(bookingForm);
      const type = formData.get('type');

      if (formStatus) {
        formStatus.textContent =
          type === 'private'
            ? 'Заявка на Private Dining отправлена. Мы свяжемся с вами в течение часа.'
            : 'Стол забронирован. Ждём вас в Ember & Brass.';
      }

      window.setTimeout(() => {
        closeBooking();
        bookingForm.reset();
        if (formStatus) formStatus.textContent = '';
      }, 2200);
    });
  }

  /* ------------------------------------------------------------------
     11. SET MIN DATE ON BOOKING FIELD TO TODAY
     ------------------------------------------------------------------ */
  const dateField = document.getElementById('field-date');
  if (dateField) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateField.min = `${yyyy}-${mm}-${dd}`;
  }

  /* ------------------------------------------------------------------
     12. CUTS CAROUSEL SCROLL INDICATOR
     ------------------------------------------------------------------ */
  const cutsGallery = document.querySelector('.cuts-gallery');
  const cutsThumb = document.getElementById('cuts-scrollbar-thumb');
  if (cutsGallery && cutsThumb) {
    const updateThumb = () => {
      const maxScroll = cutsGallery.scrollWidth - cutsGallery.clientWidth;
      const thumbWidthPct = Math.max((cutsGallery.clientWidth / cutsGallery.scrollWidth) * 100, 10);
      cutsThumb.style.width = `${thumbWidthPct}%`;
      if (maxScroll <= 0) {
        cutsThumb.style.transform = 'translateX(0)';
        return;
      }
      const progress = cutsGallery.scrollLeft / maxScroll;
      const trackWidth = cutsThumb.parentElement.clientWidth;
      const maxThumbTravel = trackWidth - (thumbWidthPct / 100) * trackWidth;
      cutsThumb.style.transform = `translateX(${progress * maxThumbTravel}px)`;
    };
    updateThumb();
    cutsGallery.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb);
  }

})();
