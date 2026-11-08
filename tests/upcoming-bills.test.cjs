"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { dueDateFor, getSchedule, linkedPayments } = require("../upcoming-bills.js");

const bill = (changes = {}) => ({
  id: "bill-one", entry_type: "expenses", active: true,
  title: "Internet", amount: 250, day_of_month: 31,
  start_month: "2026-01-01", ...changes,
});

test("due dates clamp to month end including leap years", () => {
  assert.equal(dueDateFor("2026-02", 31), "2026-02-28");
  assert.equal(dueDateFor("2028-02", 31), "2028-02-29");
  assert.equal(dueDateFor("2026-04", 31), "2026-04-30");
  assert.equal(dueDateFor("2026-11", 0), null);
  assert.equal(dueDateFor("2026-13", 1), null);
});

test("only active, started bill templates appear", () => {
  const result = getSchedule([
    bill(), bill({ id: "paused", active: false }),
    bill({ id: "future", start_month: "2026-12-01" }),
    bill({ id: "income", entry_type: "income" }),
    bill({ id: "needs", entry_type: "needs" }),
  ], "2026-11", "2026-11-08");
  assert.equal(result.count, 1);
  assert.equal(result.bills[0].id, "bill-one");
  assert.equal(result.total, 250);
});

test("bills sort by date and sum amounts in cents", () => {
  const result = getSchedule([
    bill({ id: "late", day_of_month: 30, amount: 1.1 }),
    bill({ id: "early", day_of_month: 2, amount: 2.2 }),
    bill({ id: "middle", day_of_month: 12, amount: 3.3 }),
  ], "2026-11", "2026-11-08");
  assert.deepEqual(result.bills.map(b => b.id), ["early", "middle", "late"]);
  assert.equal(result.total, 6.6);
});

test("timing labels never claim actual payment status", () => {
  const result = getSchedule([
    bill({ id: "past", day_of_month: 2 }),
    bill({ id: "today", day_of_month: 8 }),
    bill({ id: "later", day_of_month: 15 }),
  ], "2026-11", "2026-11-08");
  assert.deepEqual(result.bills.map(b => b.timing),
    ["date-passed", "due-today", "scheduled"]);
  assert.equal(result.bills.some(b => "paid" in b || "unpaid" in b), false);
});

test("changing months does not mutate recurring templates", () => {
  const input = [bill()];
  const saved = JSON.stringify(input);
  assert.equal(getSchedule(input, "2026-02", "2026-02-10").bills[0].dueDate, "2026-02-28");
  assert.equal(getSchedule(input, "2026-03", "2026-02-10").bills[0].dueDate, "2026-03-31");
  assert.equal(JSON.stringify(input), saved);
});

test("bad rows are ignored safely", () => {
  const result = getSchedule([
    bill({ amount: "oops" }), bill({ amount: -5 }),
    bill({ day_of_month: 40 }), null,
  ], "2026-11", "2026-11-08");
  assert.equal(result.count, 0);
  assert.equal(result.total, 0);
});

test("unlinked matching expense is not treated as a payment", () => {
  const r=getSchedule([bill()],"2026-11","2026-11-08",[
    {id:"e1",title:"Internet",amount:250,date:"2026-11-05"}
  ]);
  assert.equal(r.bills[0].status,"upcoming");
  assert.equal(r.bills[0].recorded,0);
});
test("linked spending marks only that bill paid", () => {
  const r=getSchedule([bill(),bill({id:"rent",title:"Rent",amount:800,day_of_month:5})],
    "2026-11","2026-11-08",[
      {id:"e1",recurringTemplateId:"bill-one",amount:250,date:"2026-11-06"}
    ]);
  assert.equal(r.bills.find(b=>b.id==="bill-one").status,"paid");
  assert.equal(r.bills.find(b=>b.id==="rent").status,"overdue");
});
test("partial payments accumulate without double counting another month", () => {
  const payments=[
    {id:"e1",recurringTemplateId:"bill-one",amount:100,date:"2026-11-05"},
    {id:"e2",recurringTemplateId:"bill-one",amount:150,date:"2026-11-06"},
    {id:"e3",recurringTemplateId:"bill-one",amount:200,date:"2026-10-06"},
  ];
  let r=getSchedule([bill()],"2026-11","2026-11-08",payments.slice(0,1));
  assert.equal(r.bills[0].status,"partial");
  assert.equal(r.bills[0].remaining,150);
  r=getSchedule([bill()],"2026-11","2026-11-08",payments);
  assert.equal(r.bills[0].status,"paid");
  assert.equal(r.bills[0].recorded,250);
  assert.equal(linkedPayments(payments,"bill-one","2026-11").length,2);
});
test("unlinked payment keeps expense and restores remaining balance", () => {
  const e={id:"e1",amount:250,date:"2026-11-06",recurringTemplateId:"bill-one"};
  assert.equal(getSchedule([bill()],"2026-11","2026-11-08",[e]).bills[0].status,"paid");
  delete e.recurringTemplateId;
  const r=getSchedule([bill()],"2026-11","2026-11-08",[e]);
  assert.equal(r.bills[0].status,"upcoming");
  assert.equal(e.amount,250);
});
test("overpayment is paid, with no negative remaining amount", () => {
  const r=getSchedule([bill()],"2026-11","2026-11-08",[
    {id:"e1",amount:300,date:"2026-11-07",recurringTemplateId:"bill-one"}]);
  assert.equal(r.bills[0].status,"paid");
  assert.equal(r.bills[0].remaining,0);
  assert.equal(r.bills[0].recorded,300);
});
test("expense form integration retains links when editing and does not auto-post", () => {
  const fs=require("node:fs"),path=require("node:path");
  const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
  const rec=fs.readFileSync(path.join(__dirname,"..","recurring.js"),"utf8");
  assert.match(rec,/openModal\("expenses",null,\{bill:/);
  assert.match(rec,/expense\.recurringTemplateId=id/);
  assert.match(rec,/delete expense\.recurringTemplateId/);
  assert.match(app,/record\.recurringTemplateId = editing\.paymentBillId/);
  assert.match(app,/record\.recurringTemplateId = list\[index\]\.recurringTemplateId/);
});
