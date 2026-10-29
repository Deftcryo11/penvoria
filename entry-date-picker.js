"use strict";

/*
  Penvoria entry-date calendar.
  Progressive enhancement: without this script, the native
  date input in app.js still works. The selected budget month
  remains the only selectable month.
*/
(() => {
  const pad = (number) => String(number).padStart(2, "0");
  const validMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const formatDay = (monthKey, day) => monthKey + "-" + pad(day);

  function dateInMonth(value, monthKey, maxDay) {
    if (!new RegExp("^" + monthKey + "-\\d{2}$").test(value)) return false;
    const day = Number(value.slice(-2));
    return Number.isInteger(day) && day >= 1 && day <= maxDay;
  }

  function displayDate(value) {
    const pieces = value.split("-").map(Number);
    const date = new Date(pieces[0], pieces[1] - 1, pieces[2], 12);
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function mount(root) {
    if (!root) return;

    const input = root.querySelector('input[type="date"][name="date"]');
    if (!input || input.dataset.penvoriaPicker) return;

    const monthKey = String(input.min || "").slice(0, 7);
    if (!validMonth(monthKey) || String(input.max || "").slice(0, 7) !== monthKey) {
      // Preserve the native picker when range constraints differ.
      return;
    }

    const year = Number(monthKey.slice(0, 4));
    const monthNumber = Number(monthKey.slice(5, 7));
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const selected = dateInMonth(input.value, monthKey, lastDay) ? input.value : "";
    const monthTitle = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric"
    }).format(new Date(year, monthNumber - 1, 1, 12));

    input.dataset.penvoriaPicker = "true";
    input.type = "hidden";
    input.hidden = true;
    input.required = false;

    const label = root.querySelector('label[for="f_date"]');
    if (label) label.htmlFor = "pd-trigger";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "pd-trigger";
    trigger.className = "pd-trigger";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "pd-calendar");
    trigger.innerHTML =
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="5" width="18" height="16" rx="2"/>' +
      '<path d="M7 3v4M17 3v4M3 10h18"/></svg>' +
      '<span class="pd-date-text"></span>' +
      '<svg class="pd-chevron" width="16" height="16" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="m6 9 6 6 6-6"/></svg>';

    const panel = document.createElement("div");
    panel.id = "pd-calendar";
    panel.className = "pd-panel";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Choose a date in " + monthTitle);

    const field = input.closest(".field");
    if (!field) return;
    input.insertAdjacentElement("afterend", trigger);
    trigger.insertAdjacentElement("afterend", panel);

    function updateTrigger() {
      const text = trigger.querySelector(".pd-date-text");
      text.textContent = input.value ? displayDate(input.value) : "Choose a date";
      trigger.setAttribute("aria-label", "Date: " + text.textContent + ". Choose date");
    }

    function buildCalendar() {
      const firstWeekday = (new Date(year, monthNumber - 1, 1, 12).getDay() + 6) % 7;
      const selectedDay = dateInMonth(input.value, monthKey, lastDay)
        ? Number(input.value.slice(-2))
        : 0;
      const currentLocal = new Date();
      const isCurrentMonth =
        currentLocal.getFullYear() === year &&
        currentLocal.getMonth() + 1 === monthNumber;

      let dates = "";
      for (let i = 0; i < firstWeekday; i++) {
        dates += '<span class="pd-empty" aria-hidden="true"></span>';
      }

      for (let day = 1; day <= lastDay; day++) {
        const value = formatDay(monthKey, day);
        const isSelected = day === selectedDay;
        const isToday = isCurrentMonth && day === currentLocal.getDate();
        const fullDate = new Intl.DateTimeFormat("en-GB", {
          weekday: "long", day: "numeric", month: "long", year: "numeric"
        }).format(new Date(year, monthNumber - 1, day, 12));

        dates += '<button type="button" class="pd-day' +
          (isSelected ? " is-selected" : "") +
          (isToday ? " is-today" : "") +
          '" data-pd-day="' + day + '" data-pd-value="' + value + '"' +
          ' aria-label="Select ' + fullDate + '"' +
          ' aria-pressed="' + String(isSelected) + '"' +
          (isToday ? ' aria-current="date"' : "") +
          ' tabindex="' + (day === (selectedDay || 1) ? "0" : "-1") + '">' +
          day + "</button>";
      }

      panel.innerHTML =
        '<div class="pd-heading">' +
        '<span class="pd-heading-icon" aria-hidden="true">◈</span>' +
        '<span class="pd-month">' + monthTitle + '</span>' +
        '<span class="pd-month-label">Budget month</span></div>' +
        '<div class="pd-weekdays" aria-hidden="true">' +
        ["M", "T", "W", "T", "F", "S", "S"].map((day) => "<span>" + day + "</span>").join("") +
        '</div><div class="pd-days">' + dates + '</div>' +
        '<p class="pd-hint">To choose another month, change the month at the top of the page.</p>';
    }

    function closeCalendar(restoreFocus) {
      if (panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }

    function openCalendar() {
      buildCalendar();
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");

      // Scroll only inside the entry modal; do not move the iOS dashboard.
      requestAnimationFrame(() => {
        if (panel.hidden) return;
        const modal = panel.closest(".modal");
        if (modal) {
          const panelBottom = panel.getBoundingClientRect().bottom;
          const modalBottom = modal.getBoundingClientRect().bottom - 72;
          if (panelBottom > modalBottom) {
            modal.scrollTop += panelBottom - modalBottom + 12;
          }
        }
      });
    }

    trigger.addEventListener("click", () => {
      if (panel.hidden) openCalendar();
      else closeCalendar(false);
    });

    panel.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-pd-day]");
      if (!button || !panel.contains(button)) return;
      const value = button.dataset.pdValue;
      if (!dateInMonth(value, monthKey, lastDay)) return;

      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      updateTrigger();
      closeCalendar(true);
    });

    // Arrow keys navigate the grid without changing the actual date.
    panel.addEventListener("keydown", (event) => {
      const button = event.target.closest("button[data-pd-day]");
      if (!button) return;
      const current = Number(button.dataset.pdDay);
      const steps = {
        ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7
      };
      let next = current;
      if (Object.hasOwn(steps, event.key)) next += steps[event.key];
      else if (event.key === "Home") next -= (firstDayColumn(current));
      else if (event.key === "End") next += (6 - firstDayColumn(current));
      else return;
      event.preventDefault();

      next = Math.max(1, Math.min(lastDay, next));
      panel.querySelectorAll("button[data-pd-day]").forEach((dayButton) => {
        dayButton.tabIndex = Number(dayButton.dataset.pdDay) === next ? 0 : -1;
      });
      panel.querySelector('button[data-pd-day="' + next + '"]')?.focus();
    });

    function firstDayColumn(day) {
      return (new Date(year, monthNumber - 1, day, 12).getDay() + 6) % 7;
    }

    const outsideClick = (event) => {
      if (panel.hidden || !field.isConnected) return;
      if (!field.contains(event.target)) closeCalendar(false);
    };

    const escapeCalendar = (event) => {
      if (event.key !== "Escape" || panel.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeCalendar(true);
    };

    // Closing the parent entry modal or replacing its fields
    // disposes document listeners to avoid accumulating handlers.
    const observer = new MutationObserver(() => {
      if (!field.isConnected) {
        document.removeEventListener("pointerdown", outsideClick);
        document.removeEventListener("keydown", escapeCalendar, true);
        observer.disconnect();
      }
    });
    observer.observe(root, { childList: true });
    document.addEventListener("pointerdown", outsideClick);
    document.addEventListener("keydown", escapeCalendar, true);

    updateTrigger();
  }

  window.PenvoriaDatePicker = { mount };
})();
