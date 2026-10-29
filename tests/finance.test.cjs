"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const s = fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const extract = (start,end) => {
  const a=s.indexOf(start), b=s.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a,"Production section missing: "+start);
  return s.slice(a,b);
};
const code=[extract("const CATEGORIES =","function load()"),extract("function categoryOf(","// DISPLAY HELPERS"),extract("function previousMonthKey(","function copyPreviousMonthPlanning()"),"globalThis.finance={totals,previousMonthKey,moveEntryDateToMonth};"].join("\n");
const {finance}=vm.runInNewContext(code,{});
const blank=()=>({income:[],needs:[],expenses:[],savings:[]});
test("empty month is zero",()=>{const v=finance.totals(blank());assert.equal(v.cashRemainder,0);assert.equal(v.spendingBudget,0);});
test("plans, actual cash and overspending are distinct",()=>{
const r={income:[{amount:5000,received:4000}],needs:[{category:"Rent / Housing",amount:2000},{category:"Groceries",amount:700}],expenses:[{category:"Rent / Housing",amount:1500},{category:"Groceries",amount:900},{category:"Transport / Fuel",amount:300}],savings:[{amount:1000,transferred:600}]};
const v=finance.totals(r);
assert.equal(v.cashRemainder,700);assert.equal(v.spendingBudget,1300);assert.equal(v.overBudget,200);assert.equal(v.otherActual,500);assert.equal(v.remaining,800);
});
test("same category allocations combine",()=>{const r=blank();r.income.push({amount:2000});r.needs.push({category:"Groceries",amount:400},{category:"Groceries",amount:600});r.expenses.push({category:"Groceries",amount:1250});const v=finance.totals(r);assert.equal(v.categoryBudgets.length,1);assert.equal(v.overBudget,250);});
test("year rollover and leap month date clamping",()=>{assert.equal(finance.previousMonthKey("2026-01"),"2025-12");assert.equal(finance.moveEntryDateToMonth("2026-01-31","2024-02"),"2024-02-29");});
