"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { shiftMonth, daysBetween, buildCalendar, getReminders, overviewReminders } = require("../bills-calendar.js");

const bill = (overrides = {}) => ({
  id:"rent", title:"Rent", dueDate:"2026-11-10",
  amount:1000, remaining:1000, status:"upcoming", timing:"scheduled", ...overrides,
});

test("calendar uses Monday-first weekday positions", () => {
  const november=buildCalendar("2026-11", []);
  assert.equal(november.offset, 6);
  assert.equal(november.days.length,30);
  assert.equal(november.days[0].date,"2026-11-01");
  assert.equal(november.days[29].date,"2026-11-30");
});
test("leap February and December-to-January rollover", () => {
  assert.equal(buildCalendar("2028-02", []).days.length,29);
  assert.equal(buildCalendar("2026-02", []).days.length,28);
  assert.equal(shiftMonth("2026-12",1),"2027-01");
  assert.equal(shiftMonth("2027-01",-1),"2026-12");
});
test("multiple bills on same day are grouped without changing them", () => {
  const source=[bill(),bill({id:"phone",title:"Phone",amount:100})];
  const original=JSON.stringify(source);
  const model=buildCalendar("2026-11",source);
  assert.equal(model.days[9].bills.length,2);
  assert.equal(model.days[8].bills.length,0);
  assert.equal(model.days[9].mark,"scheduled");
  assert.equal(JSON.stringify(source),original);
});
test("paid and partly paid markers derive from expense-linked status", () => {
  const full=buildCalendar("2026-11",[bill({status:"paid",remaining:0})]);
  const partial=buildCalendar("2026-11",[bill({status:"partial",remaining:400})]);
  const late=buildCalendar("2026-11",[bill({status:"partial",timing:"date-passed"})]);
  assert.equal(full.days[9].mark,"paid");
  assert.equal(partial.days[9].mark,"partial");
  assert.equal(late.days[9].mark,"overdue");
});
test("reminders omit paid and items more than seven days away", () => {
  const result=getReminders([
    bill({status:"paid",remaining:0}),
    bill({id:"soon",dueDate:"2026-11-16"}),
    bill({id:"later",dueDate:"2026-11-17"})
  ],"2026-11-09");
  assert.deepEqual(result.map(x=>x.id),["soon"]);
  assert.equal(result[0].daysUntil,7);
});
test("late and partially paid bills are eligible reminders", () => {
  const result=getReminders([
    bill({id:"late",dueDate:"2026-11-04",status:"overdue"}),
    bill({id:"partial",dueDate:"2026-11-09",status:"partial",remaining:120}),
    bill({id:"tomorrow",dueDate:"2026-11-10"})
  ],"2026-11-09");
  assert.deepEqual(result.map(x=>x.id),["late","partial","tomorrow"]);
  assert.deepEqual(result.map(x=>x.reminder),["overdue","today","soon"]);
});
test("seven-day reminders include next-month dates", () => {
  assert.equal(daysBetween("2026-12-03","2026-11-29"),4);
  assert.equal(getReminders([bill({dueDate:"2026-12-03"})],"2026-11-29").length,1);
});
test("invalid calendar and reminder inputs are safe", () => {
  assert.equal(buildCalendar("2026-13",[]).days.length,0);
  assert.deepEqual(getReminders(null,"2026-11-09"),[]);
  assert.deepEqual(getReminders([bill({dueDate:"2026-02-31"})],"2026-11-09"),[]);
  assert.equal(daysBetween("2026-02-31","2026-11-09"),null);
});
test("v1.5 calendar is read-only and loaded with existing recurring integration", () => {
  const root=path.join(__dirname,"..");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const worker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  const recurring=fs.readFileSync(path.join(root,"recurring.js"),"utf8");
  const ui=fs.readFileSync(path.join(root,"bills-calendar-ui.js"),"utf8");
  assert.match(recurring,/getMonthBillSchedule\(monthKey\)/);
  assert.match(ui,/previousRender/);
  assert.match(ui,/data-bc-date/);
  assert.match(ui,/root\.querySelector\("#bc-selected"\)/);
  assert.match(recurring,/data-pr-open/);
  assert.doesNotMatch(ui,/function remindersHTML\(/);
  assert.doesNotMatch(ui,/class="panel bc-reminders"/);
  assert.match(recurring,/overviewReminders\(/);
  assert.match(recurring,/Due soon next month/);
  assert.doesNotMatch(ui,/queueSave\(|\.insert\(|\.update\(/);
  for(const asset of ["bills-calendar.js","bills-calendar-ui.js","bills-calendar.css"]) {
    assert.ok(html.includes(asset));
    assert.ok(worker.includes(asset));
  }
});


test("the Overview prioritizes overdue and due-soon bills without duplication", () => {
  const bills = [
    bill({id:"paid",status:"paid",remaining:0,dueDate:"2026-11-01"}),
    bill({id:"far",dueDate:"2026-11-28"}),
    bill({id:"soon",dueDate:"2026-11-11"}),
    bill({id:"late",dueDate:"2026-11-02",status:"overdue",timing:"date-passed"}),
  ];
  const result=overviewReminders(bills,[],"2026-11-09",3);
  assert.deepEqual(result.current.map(x=>x.id),["late","soon","far"]);
  assert.equal(result.remainingCurrent,1);
  assert.equal(result.alerts.length,2);
  assert.deepEqual(result.nextMonth,[]);
});

test("the merged Overview keeps next-month reminders inside its single section", () => {
  const current=[bill({id:"nov",dueDate:"2026-11-30"})];
  const next=[bill({id:"dec",dueDate:"2026-12-03"})];
  const r=overviewReminders(current,next,"2026-11-29",3);
  assert.deepEqual(r.current.map(x=>x.id),["nov"]);
  assert.deepEqual(r.nextMonth.map(x=>x.id),["dec"]);
  assert.equal(r.alerts.length,2);
});

test("paid bills do not trigger attention reminders", () => {
  const r=overviewReminders([bill({status:"paid",remaining:0})],[],"2026-11-09",3);
  assert.equal(r.alerts.length,0);
  assert.equal(r.current.length,1);
});

test("Overview grouping never mutates original payment records or bill order", () => {
  const source=[bill({id:"later",dueDate:"2026-11-30"}),bill({id:"urgent",dueDate:"2026-11-10"})];
  const before=JSON.stringify(source);
  overviewReminders(source,[],"2026-11-09",3);
  assert.equal(JSON.stringify(source),before);
});
