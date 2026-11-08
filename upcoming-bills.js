"use strict";

/*
  Penvoria v1.4 — read-only upcoming bills schedule.
  A scheduled bill does not prove that a payment is unpaid.
  No expenses or cloud records are created here.
*/
(() => {
  function validMonth(key) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(key));
  }

  function localToday() {
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function dueDateFor(monthKey, day) {
    if (!validMonth(monthKey)) return null;
    const scheduled = Number(day);
    if (!Number.isInteger(scheduled) || scheduled < 1 || scheduled > 31) return null;

    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    const lastDay = new Date(year, month, 0).getDate();
    return monthKey + "-" + String(Math.min(scheduled, lastDay)).padStart(2, "0");
  }

  function getSchedule(templates, selectedMonth, today = localToday()) {
    if (!validMonth(selectedMonth)) return { bills: [], count: 0, total: 0 };

    const bills = (Array.isArray(templates) ? templates : [])
      .flatMap((template) => {
        if (!template || template.entry_type !== "expenses" || template.active !== true) {
          return [];
        }
        const startMonth = String(template.start_month || "").slice(0, 7);
        if (!validMonth(startMonth) || startMonth > selectedMonth) return [];

        const dueDate = dueDateFor(selectedMonth, template.day_of_month);
        const amount = Number(template.amount);
        if (!dueDate || !Number.isFinite(amount) || amount <= 0) return [];

        return [{
          id: String(template.id || ""),
          title: String(template.title || ""),
          amount: Math.round(amount * 100) / 100,
          dueDate,
          timing: dueDate < today ? "date-passed" :
            dueDate === today ? "due-today" : "scheduled",
        }];
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) ||
        a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

    const cents = bills.reduce((sum, bill) => sum + Math.round(bill.amount * 100), 0);
    return { bills, count: bills.length, total: cents / 100 };
  }

  const api = { dueDateFor, getSchedule, localToday };
  if (typeof window !== "undefined") window.PenvoriaUpcomingBills = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();