"use strict";

/*
  Penvoria — iPhone entry-form scroll lock

  Locks the financial dashboard while an
  entry form is open, but keeps the form
  itself scrollable.
*/

(() => {
  const overlay = document.querySelector("#overlay");
  const modal = overlay?.querySelector(".modal");
  const main = document.querySelector(".main");

  if (!overlay || !modal || !main) return;

  const isStandaloneMobile = () =>
    window.matchMedia("(max-width: 700px) and (display-mode: standalone)")
      .matches;

  let locked = false;
  let savedMainScroll = 0;
  let savedWindowScroll = 0;
  let previousTouchY = null;
  let restoreTimer = null;

  function restorePosition(mainTop, windowTop) {
    if (locked) return;

    main.scrollTop = mainTop;

    if (Math.abs(window.scrollY - windowTop) > 1) {
      window.scrollTo(0, windowTop);
    }
  }

  function lockBackground() {
    if (locked || !isStandaloneMobile()) return;

    if (restoreTimer !== null) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }

    savedMainScroll = main.scrollTop;
    savedWindowScroll = window.scrollY;

    locked = true;

    document.documentElement.classList.add("entry-scroll-locked");
  }

  function unlockBackground() {
    if (!locked) return;

    const mainTop = savedMainScroll;
    const windowTop = savedWindowScroll;

    locked = false;
    previousTouchY = null;

    document.documentElement.classList.remove("entry-scroll-locked");

    // Restore position immediately after closing.
    requestAnimationFrame(() => {
      restorePosition(mainTop, windowTop);
    });

    // iOS keyboard dismissal may finish later.
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      restorePosition(mainTop, windowTop);
    }, 400);
  }

  function syncModalState() {
    if (overlay.classList.contains("hidden")) {
      unlockBackground();
    } else {
      lockBackground();
    }
  }

  // Automatically detect form opening and closing.
  new MutationObserver(syncModalState).observe(overlay, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Capture the starting finger position.
  document.addEventListener(
    "touchstart",
    (event) => {
      if (!locked) return;

      previousTouchY = event.touches[0]?.clientY ?? null;
    },
    {
      passive: true,
      capture: true,
    },
  );

  // Block scrolling outside the form and stop
  // swipes at the form's scroll boundaries.
  document.addEventListener(
    "touchmove",
    (event) => {
      if (!locked || !event.cancelable) return;

      if (event.touches.length !== 1) return;

      const y = event.touches[0].clientY;
      const deltaY = previousTouchY === null ? 0 : y - previousTouchY;

      previousTouchY = y;

      // Touches outside the form must not scroll
      // the financial dashboard.
      if (!modal.contains(event.target)) {
        event.preventDefault();
        return;
      }

      const maxScroll = Math.max(0, modal.scrollHeight - modal.clientHeight);

      const atTop = modal.scrollTop <= 1;
      const atBottom = modal.scrollTop >= maxScroll - 1;

      // Allow normal scrolling inside the form,
      // but don't pass overflow gestures through
      // to the background.
      const cannotScroll =
        maxScroll <= 1 || (atTop && deltaY > 0) || (atBottom && deltaY < 0);

      if (cannotScroll) {
        event.preventDefault();
      }
    },
    {
      passive: false,
      capture: true,
    },
  );

  document.addEventListener(
    "touchend",
    () => {
      previousTouchY = null;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchcancel",
    () => {
      previousTouchY = null;
    },
    { passive: true },
  );

  // Additional protection against scroll movement
  // while iOS is opening or closing the keyboard.
  main.addEventListener(
    "scroll",
    () => {
      if (locked && Math.abs(main.scrollTop - savedMainScroll) > 1) {
        main.scrollTop = savedMainScroll;
      }
    },
    { passive: true },
  );

  syncModalState();
})();
