"use strict";
(function billsCalendarUiInit() {
  const root = document.getElementById("app");
  if (!root) return;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let selectedDate = null;
  const safe = value => escapeHtml(value == null ? "" : String(value));
  const helpers = () => window.PenvoriaBillsCalendar;
  const recurring = () => window.PenvoriaRecurring;
  const scheduleFor = key => recurring()?.getMonthBillSchedule(key) || null;
  const todayKey = () => window.PenvoriaUpcomingBills?.localToday();

  function billStatus(bill) {
    if (bill.status === "paid") return "Paid";
    if (bill.status === "partial") {
      return bill.timing === "date-passed" ? "Partially paid · past due" : "Partially paid";
    }
    if (bill.status === "overdue") return "Overdue";
    if (bill.status === "due-today") return "Due today";
    return "Upcoming";
  }

  function selectedDayHTML(date, model) {
    const info = model.days.find(day => day.date === date);
    if (!info) return "";
    return `
      <h3>${safe(date)} · ${info.bills.length} bill(s)</h3>
      ${info.bills.length ? `
        <ul class="bc-detail-list">
          ${info.bills.map(bill => `
            <li>
              <div>
                <strong>${safe(bill.title)}</strong>
                <small>${safe(billStatus(bill))}</small>
              </div>
              <div class="bc-detail-values">
                <strong>${money(bill.amount)}</strong>
                <small>${money(bill.remaining)} remaining</small>
              </div>
            </li>`).join("")}
        </ul>
      ` : '<p class="bc-empty">No bills scheduled for this day.</p>'}
    `;
  }

  function calendarHTML() {
    const current = scheduleFor(month);
    const logic = helpers();
    if (!current || !logic) return "";
    const model = logic.buildCalendar(month, current.bills);
    if (!model.month) return "";

    const today = todayKey();
    if (!selectedDate?.startsWith(month + "-") ||
        !model.days.some(day => day.date === selectedDate)) {
      selectedDate = today?.startsWith(month + "-") ? today :
        model.days.find(day => day.bills.length)?.date || month + "-01";
    }

    const emptyCells = Array.from({ length: model.offset }, () =>
      '<span class="bc-blank" aria-hidden="true"></span>').join("");
    return `
      <section class="panel bc-panel" aria-label="Bills calendar">
        <div class="bc-heading">
          <div>
            <h2>Bills calendar</h2>
            <p class="panel-sub">${safe(monthLabel(month))} · tap a date to view its bills</p>
          </div>
          <span class="bc-month-count">${current.count} bill(s)</span>
        </div>
        <div class="bc-weekdays" aria-hidden="true">
          ${DAYS.map(day => `<span>${day}</span>`).join("")}
        </div>
        <div class="bc-grid" role="group" aria-label="${safe(monthLabel(month))} due dates">
          ${emptyCells}
          ${model.days.map(day => {
            const isToday = day.date === today;
            const isSelected = day.date === selectedDate;
            return `
              <button type="button"
                class="bc-day ${isToday ? "bc-today" : ""} ${isSelected ? "bc-selected-day" : ""}"
                data-bc-date="${safe(day.date)}"
                data-bc-mark="${safe(day.mark)}"
                aria-pressed="${isSelected ? "true" : "false"}"
                aria-label="${safe(day.date)}: ${day.bills.length} bill(s)">
                <span class="bc-number">${day.day}</span>
                ${day.bills.length ? `<span class="bc-marker" aria-hidden="true"></span>` : ""}
              </button>`;
          }).join("")}
        </div>
        <div class="bc-selected" id="bc-selected" aria-live="polite">
          ${selectedDayHTML(selectedDate, model)}
        </div>
        <p class="pr-note">
          Calendar dates are reminders only. Paid and partial statuses use linked Spending
          expenses. Change the month using Penvoria's month selector above.
        </p>
      </section>
    `;
  }

  // Preserve all earlier rendering wrappers and recurring-editor behavior.
  const previousRender = render;
  render = function (...args) {
    const result = previousRender(...args);
    if (view === "recurring") {
      const calendar = calendarHTML();
      if (calendar) root.querySelector(".pr-panel")?.insertAdjacentHTML("afterend", calendar);
    }
    return result;
  };

  // Selecting a day changes only the calendar details—not an open template editor.
  root.addEventListener("click", event => {
    const button = event.target.closest("button[data-bc-date]");
    if (!button || view !== "recurring") return;
    const date = button.dataset.bcDate;
    if (!date?.startsWith(month + "-")) return;
    const schedule = scheduleFor(month);
    const model = schedule && helpers()?.buildCalendar(month, schedule.bills);
    if (!model?.days.some(day => day.date === date)) return;
    selectedDate = date;
    root.querySelectorAll("button[data-bc-date]").forEach(item => {
      const current = item.dataset.bcDate === selectedDate;
      item.classList.toggle("bc-selected-day", current);
      item.setAttribute("aria-pressed", current ? "true" : "false");
    });
    const details = root.querySelector("#bc-selected");
    if (details) details.innerHTML = selectedDayHTML(date, model);
  });
})();
