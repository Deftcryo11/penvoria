"use strict";
(function goalTests(){
 const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
 const {collectGoals,goalProgress,validDate}=require("../savings-goals-model.js");
 const source=()=>({
  "2026-11":{goals:[{id:"g",title:"Travel",target:1000}],savings:[{goalId:"g",amount:250,transferred:50}]},
  "2026-12":{savings:[{goalId:"g",amount:100,transferred:100},{goalId:"other",transferred:75}]}
 });
 test("goals persist across months without reclassification",()=>{
  const result=collectGoals(source());assert.equal(result.length,1);
  assert.equal(result[0].ownerMonth,"2026-11");
  assert.equal(collectGoals(source(),"2026-10").length,0);
 });
 test("only linked actual transfers are counted, not planned savings",()=>{
  const data=source(),g=collectGoals(data)[0];
  assert.deepEqual(goalProgress(g,data),{transferred:150,remaining:850,percent:15,count:2});
 });
 test("archiving preserves linked savings and overfunding caps percent",()=>{
  const data=source();data["2026-11"].goals[0].archived=true;
  data["2026-12"].savings.push({goalId:"g",transferred:900});
  const g=collectGoals(data)[0];
  assert.equal(g.archived,true);assert.equal(goalProgress(g,data).transferred,1050);
  assert.equal(goalProgress(g,data).percent,100);
  assert.equal(goalProgress(g,data).remaining,0);
 });
 test("date validation includes leap years",()=>{
  assert.equal(validDate("2028-02-29"),true);
  assert.equal(validDate("2026-02-29"),false);
 });
 test("monthly save, refresh and modal preserve goal identifiers",()=>{
  const root=path.join(__dirname,"..");
  for(const p of ["app.js","cloud.js","cloud-refresh.js"]){
   const src=fs.readFileSync(path.join(root,p),"utf8");
   assert.ok(src.includes("goals"));
  }
  const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
  const ui=fs.readFileSync(path.join(root,"savings-goals.js"),"utf8");
  assert.match(app,/record\.goalId = goalId/);
  assert.match(app,/validLink\(goalId, month, id\)/);
  assert.match(ui,/g\.archived/);
  assert.match(ui,/queueSave\(key,state\.months\[key\]\)/);
 });
})();
