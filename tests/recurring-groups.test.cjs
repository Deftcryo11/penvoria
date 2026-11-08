"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { groupKey, groupRecurringTemplates } = require("../recurring-groups.js");
const templates = () => [
  { id: "utility", title: "Utility Bills", entry_type: "expenses", active: true },
  { id: "phone", title: "Phone Bill", entry_type: "needs", active: true },
  { id: "salary", title: "Salary", entry_type: "income", active: true },
  { id: "travel", title: "Travel", entry_type: "savings", active: true },
];
test("all four recurring types remain visible in distinct groups", () => {
  const result = groupRecurringTemplates(templates());
  assert.deepEqual(result.map(g => g.title), [
    "Bills & Payments", "Expected Income", "Planned Savings", "Other Allocations"
  ]);
  assert.deepEqual(result.map(g => g.items.map(t => t.title)), [
    ["Utility Bills"], ["Salary"], ["Travel"], ["Phone Bill"]
  ]);
});
test("Needs allocation does not silently become a payable bill", () => {
  assert.equal(groupKey("needs"), "allocations");
  assert.equal(groupKey("expenses"), "bills");
  assert.equal(groupKey("income"), "income");
  assert.equal(groupKey("savings"), "savings");
});
test("paused and not-yet-started templates stay in their group", () => {
  const result = groupRecurringTemplates([
    { id: "paused", entry_type: "needs", active: false },
    { id: "future", entry_type: "income", start_month: "2027-05-01", active: true }
  ]);
  assert.equal(result.reduce((n,g) => n+g.items.length,0),2);
  assert.equal(result[3].items[0].id,"paused");
  assert.equal(result[1].items[0].id,"future");
});
test("grouping preserves every template and its original data", () => {
  const input = templates(), before = JSON.stringify(input);
  const result = groupRecurringTemplates(input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(result[3].items[0],input[1]);
});
test("legacy types remain accessible rather than vanishing", () => {
  const result = groupRecurringTemplates([{ id:"legacy", entry_type:"unknown" }]);
  assert.equal(result[3].items[0].id,"legacy");
});
test("empty and malformed collections remain safe", () => {
  assert.deepEqual(groupRecurringTemplates(null).map(g=>g.items.length),[0,0,0,0]);
  assert.deepEqual(groupRecurringTemplates([null,false]).map(g=>g.items.length),[0,0,0,0]);
});
test("grouped page preserves template management and bill payment controls", () => {
  const root=path.join(__dirname,"..");
  const recurring=fs.readFileSync(path.join(root,"recurring.js"),"utf8");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const worker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert.match(recurring,/group\.items\.map\(rowHTML\)/);
  assert.match(recurring,/upcomingBillsHTML\(false\)/);
  for (const action of ["edit","post","toggle","delete"]) assert.ok(recurring.includes("data-pr-"+action));
  assert.match(html,/recurring-groups\.js/);
  assert.match(worker,/recurring-groups\.js/);
});
