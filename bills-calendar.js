"use strict";
/*
  Penvoria v1.5 calendar/reminder calculations.
  This module is read-only. All paid/partial statuses come from the
  existing linked Spending expenses via PenvoriaUpcomingBills.getSchedule.
*/
(() => {
  const validMonth = key => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(key));
  const validDate = key => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(key));

  function shiftMonth(key, delta) {
    if (!validMonth(key) || !Number.isInteger(delta)) return null;
    const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1));
    return String(date.getUTCFullYear()).padStart(4, "0") + "-" +
      String(date.getUTCMonth() + 1).padStart(2, "0");
  }

  function daysBetween(date, today) {
    if (!validDate(date) || !validDate(today)) return null;
    const toUtc = value => Date.UTC(
      Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))
    );
    const ms = toUtc(date) - toUtc(today);
    const result = Math.round(ms / 86400000);
    if (new Date(toUtc(date)).toISOString().slice(0, 10) !== date ||
        new Date(toUtc(today)).toISOString().slice(0, 10) !== today) return null;
    return result;
  }

  function buildCalendar(monthKey, bills = []) {
    if (!validMonth(monthKey)) return { month: null, offset: 0, days: [] };
    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const schedule = Array.isArray(bills) ? bills : [];
    const days = Array.from({ length }, (_, index) => {
      const day = index + 1;
      const date = monthKey + "-" + String(day).padStart(2, "0");
      const dayBills = schedule.filter(bill => bill && bill.dueDate === date);
      const allPaid = dayBills.length > 0 && dayBills.every(bill => bill.status === "paid");
      const hasOverdue = dayBills.some(bill => bill.status === "overdue" ||
        (bill.status === "partial" && bill.timing === "date-passed"));
      const hasPartial = dayBills.some(bill => bill.status === "partial");
      const mark = allPaid ? "paid" : hasOverdue ? "overdue" :
        hasPartial ? "partial" : dayBills.length ? "scheduled" : "none";
      return { day, date, bills: dayBills, mark };
    });
    return { month: monthKey, offset, days };
  }

  function getReminders(bills, today, daysAhead = 7) {
    if (!validDate(today) || !Number.isInteger(daysAhead) ||
        daysAhead < 0 || daysAhead > 31) return [];
    return (Array.isArray(bills) ? bills : [])
      .flatMap(bill => {
        if (!bill || bill.status === "paid" ||
            !Number.isFinite(Number(bill.remaining)) || Number(bill.remaining) <= 0) return [];
        const diff = daysBetween(bill.dueDate, today);
        if (diff === null || diff > daysAhead) return [];
        return [{ ...bill, daysUntil: diff, reminder: diff < 0 ? "overdue" :
          diff === 0 ? "today" : "soon" }];
      })
      .sort((a, b) => a.daysUntil - b.daysUntil ||
        String(a.title || "").localeCompare(String(b.title || "")));
  }

  function overviewReminders(currentBills, nextMonthBills, today, limit = 3) {
  const current = Array.isArray(currentBills) ? currentBills : [];
  const next = Array.isArray(nextMonthBills) ? nextMonthBills : [];
  const alerts = getReminders([...current, ...next], today, 7);
  const alertKeys = new Set(alerts.map(x => x.id + "|" + x.dueDate));
  const priority = bill => {
    if (bill.status === "paid") return 4;
    if (!alertKeys.has(bill.id + "|" + bill.dueDate)) return 3;
    const days = daysBetween(bill.dueDate, today);
    return days < 0 ? 0 : days === 0 ? 1 : 2;
  };
  const ordered = [...current].sort((a,b) => {
    const level = priority(a) - priority(b);
    return level || String(a.dueDate).localeCompare(String(b.dueDate)) ||
      String(a.title || "").localeCompare(String(b.title || ""));
  });
  const dateMonth = today.slice(0,7);
  return {
    alerts,
    current: ordered.slice(0,limit),
    remainingCurrent: Math.max(0,current.length-limit),
    nextMonth: alerts.filter(x => x.dueDate.slice(0,7) !== dateMonth),
  };
}

  const api = { shiftMonth, daysBetween, buildCalendar, getReminders, overviewReminders };
  if (typeof window !== "undefined") window.PenvoriaBillsCalendar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();