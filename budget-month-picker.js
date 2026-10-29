"use strict";

/*
  Penvoria budget month selector.
  The native <input type="month"> remains the source of truth.
  Selecting a tile dispatches its existing "change" event, so
  all views, calculations, and cloud logic stay unchanged.
*/
(() => {
  const input = document.getElementById("monthPicker");
  const container = input?.closest(".month-label");
  if (!input || !container || input.dataset.penvoriaMonthPicker) return;

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const keyPattern = /^([0-9]{4})-(0[1-9]|1[0-2])$/;
  const isValidMonth = (key) => {
    const match = keyPattern.exec(String(key));
    return Boolean(match && Number(match[1]) >= 1);
  };
  const thisMonth = () => {
    const now = new Date();
    return String(now.getFullYear()).padStart(4, "0") + "-" +
      String(now.getMonth() + 1).padStart(2, "0");
  };
  const keyFor = (year, index) =>
    String(year).padStart(4, "0") + "-" + String(index + 1).padStart(2, "0");

  let displayedYear = Number((isValidMonth(input.value) ? input.value : thisMonth()).slice(0, 4));
  let currentKey = "";
  input.dataset.penvoriaMonthPicker = "true";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "budgetMonthTrigger";
  trigger.className = "bm-trigger";
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "budgetMonthPanel");
  trigger.innerHTML =
    '<svg class="bm-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<path d="M7 3v4M17 3v4M3 10h18"/></svg>' +
    '<span class="bm-selected"></span>' +
    '<svg class="bm-chevron" width="15" height="15" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path d="m6 9 6 6 6-6"/></svg>';

  const panel = document.createElement("div");
  panel.id = "budgetMonthPanel";
  panel.className = "bm-panel";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Choose a budget month");

  input.insertAdjacentElement("afterend", trigger);
  trigger.insertAdjacentElement("afterend", panel);
  // Progressive enhancement: if the script didn't run, the native input
  // would still be visible and functional.
  input.type = "hidden";
  input.hidden = true;

  function closePanel(restoreFocus = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function sync(key) {
    if (!isValidMonth(key)) return;
    const changed = key !== currentKey;
    currentKey = key;
    input.value = key;
    const year = Number(key.slice(0, 4));
    const monthIndex = Number(key.slice(5, 7)) - 1;
    const label = MONTHS[monthIndex] + " " + year;
    trigger.querySelector(".bm-selected").textContent = label;
    trigger.setAttribute("aria-label", "Budget month: " + label + ". Choose another month");
    if (changed) {
      displayedYear = year;
      closePanel(false);
    }
  }

  function renderPanel() {
    const selectedKey = isValidMonth(input.value) ? input.value : thisMonth();
    const today = thisMonth();
    const buttons = MONTHS.map((name, index) => {
      const key = keyFor(displayedYear, index);
      const active = key === selectedKey;
      const current = key === today;
      return '<button type="button" class="bm-month' +
        (active ? " is-selected" : "") +
        (current ? " is-current" : "") +
        '" data-budget-month="' + key + '"' +
        ' aria-label="' + name + " " + displayedYear + '"' +
        ' aria-pressed="' + active + '"' +
        (current ? ' aria-current="date"' : "") +
        '>' + name.slice(0, 3) + '</button>';
    }).join("");

    panel.innerHTML =
      '<div class="bm-header">' +
      '<span class="bm-heading">Choose month</span>' +
      '<span class="bm-heading-tag">Budget view</span></div>' +
      '<div class="bm-year-row">' +
      '<button type="button" class="bm-year-nav" data-bm-nav="-1"' +
      (displayedYear <= 1 ? " disabled" : "") +
      ' aria-label="Previous year">‹</button>' +
      '<strong class="bm-year" aria-live="polite">' + displayedYear + '</strong>' +
      '<button type="button" class="bm-year-nav" data-bm-nav="1"' +
      (displayedYear >= 9999 ? " disabled" : "") +
      ' aria-label="Next year">›</button></div>' +
      '<div class="bm-month-grid" role="group" aria-label="Months in ' +
      displayedYear + '">' + buttons + '</div>' +
      '<div class="bm-footer">' +
      '<button type="button" class="bm-current-shortcut" data-bm-current>' +
      'Current month</button>' +
      '<span>Switch budget view</span></div>';
  }

  function openPanel() {
    const selectedKey = isValidMonth(input.value) ? input.value : thisMonth();
    displayedYear = Number(selectedKey.slice(0, 4));
    renderPanel();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function chooseMonth(key) {
    if (!isValidMonth(key)) return;
    closePanel(false);
    const changed = input.value !== key;
    input.value = key;
    sync(key);
    if (changed) {
      // Existing app.js handler selects the month and calls render().
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else closePanel(true);
  });

  panel.addEventListener("click", (event) => {
    const tile = event.target.closest("button[data-budget-month]");
    if (tile && panel.contains(tile)) {
      chooseMonth(tile.dataset.budgetMonth);
      return;
    }

    const yearNav = event.target.closest("button[data-bm-nav]");
    if (yearNav && panel.contains(yearNav)) {
      const nextYear = displayedYear + Number(yearNav.dataset.bmNav);
      if (nextYear < 1 || nextYear > 9999) return;
      const direction = yearNav.dataset.bmNav;
      displayedYear = nextYear;
      renderPanel();
      panel.querySelector('button[data-bm-nav="' + direction + '"]')?.focus();
      return;
    }

    if (event.target.closest("button[data-bm-current]")) {
      chooseMonth(thisMonth());
    }
  });

  // Arrow keys move through months. Enter/Space are handled by the buttons.
  panel.addEventListener("keydown", (event) => {
    const tile = event.target.closest("button[data-budget-month]");
    if (!tile) return;
    const index = Number(tile.dataset.budgetMonth.slice(5, 7)) - 1;
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    let next = index;
    if (Object.hasOwn(steps, event.key)) next += steps[event.key];
    else if (event.key === "Home") next = Math.floor(index / 3) * 3;
    else if (event.key === "End") next = Math.floor(index / 3) * 3 + 2;
    else return;

    event.preventDefault();
    next = Math.max(0, Math.min(11, next));
    panel.querySelector('button[data-budget-month="' +
      keyFor(displayedYear, next) + '"]')?.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !container.contains(event.target)) closePanel(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePanel(true);
    }
  }, true);

  // Keep the visible label in sync when the month changes through
  // History or the existing native month field logic.
  input.addEventListener("change", () => sync(input.value));
  sync(isValidMonth(input.value) ? input.value : thisMonth());

  window.PenvoriaBudgetMonthPicker = { sync };
})();
