"use strict";
(function insightTests(){
 const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
 const {monthSpending,comparison,trend,shiftMonth}=require("../spending-insights-model.js");
 const months={
  "2026-10":{expenses:[{category:"Groceries",amount:100,date:"2026-10-05"}]},
  "2026-11":{needs:[{category:"Groceries",amount:120}],
   expenses:[
    {category:"Groceries",amount:90.11,date:"2026-11-10"},
    {category:"Groceries",amount:70.22,date:"2026-11-10"},
    {category:"Other / Custom",customCategory:"Books",amount:20,date:"2026-11-11"}
   ]}
 };
 test("month calculations sum currency accurately and group categories",()=>{
  const r=monthSpending(months["2026-11"],"2026-11");
  assert.equal(r.total,180.33);
  assert.equal(r.count,3);
  assert.equal(r.categories[0].name,"Groceries");
  assert.equal(r.categories[0].overBudget,true);
  assert.equal(r.days[0].amount,160.33);
 });
 test("comparison uses previous month and calculates month-on-month delta",()=>{
  const r=comparison(months,"2026-11");
  assert.equal(r.hasPrevious,true);
  assert.equal(r.previous.total,100);
  assert.equal(r.difference,80.33);
  assert.equal(r.percentChange,80.33);
 });
 test("zero previous spending does not claim an infinite percentage",()=>{
  const r=comparison({"2026-10":{expenses:[]},"2026-11":months["2026-11"]},"2026-11");
  assert.equal(r.percentChange,null);
 });
 test("last six months span year boundaries",()=>{
  assert.equal(shiftMonth("2027-01",-1),"2026-12");
  const series=trend(months,"2027-01",6);
  assert.equal(series.length,6);
  assert.equal(series.at(-1).month,"2027-01");
  assert.equal(series[3].month,"2026-11");
 });
 test("no mutation or automatic spending records",()=>{
  const before=JSON.stringify(months);
  monthSpending(months["2026-11"],"2026-11");
  comparison(months,"2026-11");trend(months,"2026-11");
  assert.equal(JSON.stringify(months),before);
 });
 test("invalid amounts and dates are safely ignored or excluded from daily totals",()=>{
  const r=monthSpending({expenses:[
    {category:"Other",amount:-1,date:"2026-11-02"},
    {category:"Other",amount:"oops",date:"2026-11-03"},
    {category:"Other",amount:20,date:"2026-10-10"}]},"2026-11");
  assert.equal(r.total,20);assert.equal(r.days.length,0);
 });
 test("Spending insights hooks into the existing rendering system with no cloud writes",()=>{
  const root=path.join(__dirname,"..");
  const ui=fs.readFileSync(path.join(root,"spending-insights-ui.js"),"utf8");
  const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert.match(ui,/oldRender|const old=render/);
  assert.match(ui,/data-si-open/);
  assert.doesNotMatch(ui,/queueSave\(|\.insert\(|\.update\(/);
  for(const file of ["spending-insights-ui.js","spending-insights-model.js","spending-insights.css"]){
   assert.ok(index.includes(file));assert.ok(sw.includes(file));
  }
 });
})();
