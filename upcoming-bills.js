"use strict";
/* Explicit payments only: no automatic transactions or cloud writes. */
(() => {
  function validMonth(key) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(key));
  }
  function localToday() {
    const now = new Date();
    return String(now.getFullYear()).padStart(4, "0") + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
  }
  function dueDateFor(monthKey, day) {
    if (!validMonth(monthKey)) return null;
    const n = Number(day);
    if (!Number.isInteger(n) || n < 1 || n > 31) return null;
    const last = new Date(Number(monthKey.slice(0,4)), Number(monthKey.slice(5,7)), 0).getDate();
    return monthKey + "-" + String(Math.min(n,last)).padStart(2,"0");
  }
  function linkedPayments(expenses, id, month) {
    if (!id || !validMonth(month)) return [];
    return (Array.isArray(expenses) ? expenses : []).filter(x =>
      x && x.recurringTemplateId === id &&
      typeof x.date === "string" && x.date.startsWith(month + "-") &&
      Number.isFinite(Number(x.amount)) && Number(x.amount) > 0
    );
  }
  function getSchedule(templates, month, today = localToday(), expenses = []) {
    if (!validMonth(month)) return {bills:[],count:0,total:0,recorded:0,remaining:0};
    const bills = (Array.isArray(templates) ? templates : []).flatMap(t => {
      if (!t || t.entry_type !== "expenses" || t.active !== true || !t.id) return [];
      const start = String(t.start_month || "").slice(0,7);
      if (!validMonth(start) || start > month) return [];
      const dueDate = dueDateFor(month,t.day_of_month), amount = Number(t.amount);
      if (!dueDate || !Number.isFinite(amount) || amount <= 0) return [];
      const expectedCents = Math.round(amount*100);
      const payments = linkedPayments(expenses,String(t.id),month);
      const paidCents = payments.reduce((sum,x)=>sum+Math.round(Number(x.amount)*100),0);
      const leftCents = Math.max(0,expectedCents-paidCents);
      const timing = dueDate < today ? "date-passed" : dueDate === today ? "due-today" : "scheduled";
      const status = paidCents >= expectedCents ? "paid" : paidCents > 0 ? "partial" :
        dueDate < today ? "overdue" : dueDate === today ? "due-today" : "upcoming";
      return [{
        id:String(t.id),title:String(t.title||""),amount:expectedCents/100,
        dueDate,timing,status,recorded:paidCents/100,remaining:leftCents/100,paymentCount:payments.length
      }];
    }).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
    return {
      bills,count:bills.length,
      total:bills.reduce((n,b)=>n+Math.round(b.amount*100),0)/100,
      recorded:bills.reduce((n,b)=>n+Math.round(b.recorded*100),0)/100,
      remaining:bills.reduce((n,b)=>n+Math.round(b.remaining*100),0)/100,
    };
  }
  const api={dueDateFor,localToday,linkedPayments,getSchedule};
  if (typeof window !== "undefined") window.PenvoriaUpcomingBills=api;
  if (typeof module !== "undefined" && module.exports) module.exports=api;
})();