"use strict";
/* Accessible secondary mobile navigation for Penvoria's five-tab layout. */
(function mobileMoreNavigation() {
  const bar = document.querySelector(".mobile-bottom-nav");
  const trigger = document.getElementById("mobileMoreButton");
  const menu = document.getElementById("mobileMoreMenu");
  if (!bar || !trigger || !menu) return;

  const secondaryViews = new Set(["insights", "history", "recurring"]);
  function close() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  function sync() {
    const secondary = secondaryViews.has(view);
    trigger.classList.toggle("active", secondary);
    if (secondary) trigger.setAttribute("aria-current", "page");
    else trigger.removeAttribute("aria-current");
    menu.querySelectorAll("[data-mobile-view]").forEach(button => {
      const active = button.dataset.mobileView === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  trigger.addEventListener("click", () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    if (opening) menu.querySelector("button.active, button")?.focus();
  });

  menu.addEventListener("click", event => {
    if (event.target.closest("button[data-mobile-view]")) close();
  });
  document.addEventListener("pointerdown", event => {
    if (!bar.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      close();
      trigger.focus();
    }
  });
  const previousRender = render;
  render = function (...args) {
    const result = previousRender(...args);
    close();
    sync();
    return result;
  };
  sync();
})();
