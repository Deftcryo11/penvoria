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

  function calendarHTML(){
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
  const paid = current.bills.filter(b => b.status === "paid").length;
  const pending = current.bills.length - paid;
  const blank = Array.from({length: model.offset},() =>
    '<span class="bc-blank" aria-hidden="true"></span>').join("");
  const legend = [
    ["scheduled", "Scheduled"], ["paid", "Paid"],
    ["partial", "Partially paid"], ["overdue", "Overdue"],
  ].map(([state, label]) => `
    <span class="bc-legend-item"><i class="bc-legend-dot bc-legend-${state}" aria-hidden="true"></i>${label}</span>
  `).join("");
  return `
    <section class="bc-panel" id="billsCalendar" aria-label="Bills calendar">
      <div class="bc-heading">
        <div class="bc-title-area">
          <span class="bc-eyebrow">MONTHLY SCHEDULE</span>
          <h2>Bills calendar</h2>
          <p class="panel-sub">Choose a date to see its bills and payments.</p>
        </div>
        <div class="bc-summary">
          <span><strong>${current.count}</strong> bills</span>
          <span><strong>${pending}</strong> remaining</span>
          <span><strong>${paid}</strong> paid</span>
        </div>
      </div>
      <div class="bc-calendar-header">
        <h3>${safe(monthLabel(month))}</h3>
        <small>Change months using the selector above</small>
      </div>
      <div class="bc-weekdays" aria-hidden="true">
        ${DAYS.map(day => `<span>${day}</span>`).join("")}
      </div>
      <div class="bc-grid" role="group" aria-label="${safe(monthLabel(month))} due dates">
        ${blank}
        ${model.days.map(day => {
          const isToday = day.date === today, selected = day.date === selectedDate;
          const label = day.mark === "paid" ? "paid" :
            day.mark === "overdue" ? "overdue" :
            day.mark === "partial" ? "partially paid" : "scheduled";
          const summary = day.bills.length ?
            `${day.bills.length} bill${day.bills.length===1?"":"s"}, ${label}` : "no bills";
          return `
            <button type="button"
              class="bc-day ${isToday?"bc-today":""} ${selected?"bc-selected-day":""}"
              data-bc-date="${safe(day.date)}"
              data-bc-mark="${safe(day.mark)}"
              aria-pressed="${selected?"true":"false"}"
              aria-label="${safe(day.date)}: ${safe(summary)}">
              <span class="bc-number">${day.day}</span>
              ${day.bills.length ? `
                <span class="bc-day-detail">
                  <i class="bc-marker" aria-hidden="true"></i>
                  <span class="bc-day-count">${day.bills.length}</span>
                </span>
              ` : ""}
            </button>`;
        }).join("")}
      </div>
      <div class="bc-legend" aria-label="Calendar status legend">${legend}</div>
      <div class="bc-selected" id="bc-selected" aria-live="polite">
        ${selectedDayHTML(selectedDate,model)}
      </div>
      <p class="pr-note bc-footnote">
        The calendar doesn't record payments. Paid and partial statuses reflect
        actual linked Spending expenses.
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
      if (calendar) {
        root.querySelector(".pr-panel > .panel-head")?.insertAdjacentHTML("afterend", calendar);
      }
    } else if (view === "dashboard") {
      // Defensive cleanup if old and new PWA assets were temporarily mixed.
      root.querySelector(".bc-reminders")?.remove();
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
