"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {collectGoals,linkedTransactions,goalProgress}=require("../savings-goals-model.js");

const sample=()=>({
 "2026-10":{goals:[{id:"trip",title:"Sri Lanka Trip",target:18000,archived:true}],savings:[{id:"a",goalId:"trip",title:"Bank transfer",amount:5000,transferred:4000,date:"2026-10-09"}]},
 "2026-11":{savings:[{id:"b",goalId:"trip",title:"November plan",amount:3000,transferred:0,date:"2026-11-10"},{id:"c",goalId:"other",transferred:100}]},
 "2026-12":{savings:[{id:"d",goalId:"trip",title:"Final",amount:2500,transferred:2200,date:"2026-12-01"}]}
});

test("linked entries display all saved records including planned-only entries",()=>{
 const data=sample(),goal=collectGoals(data)[0],before=JSON.stringify(data);
 const rows=linkedTransactions(goal,data);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(x=>x.id),["d","b","a"]);
 assert.equal(rows.find(x=>x.id==="b").transferred,0);
 assert.equal(rows.find(x=>x.id==="a").planned,5000);
 assert.equal(goalProgress(goal,data).transferred,6200);
 assert.equal(JSON.stringify(data),before);
});
test("unrelated transactions and invalid entries are ignored",()=>{
 const data=sample();
 data["2026-11"].savings.push(null,{goalId:"trip",title:"Bad date",transferred:"bad",date:"2026-11-31"});
 const rows=linkedTransactions(collectGoals(data)[0],data);
 assert.equal(rows.length,4);
 assert.equal(rows.find(x=>x.title==="Bad date").date,null);
 assert.equal(rows.find(x=>x.title==="Bad date").transferred,0);
 assert.equal(rows.some(x=>x.id==="c"),false);
});
test("deleted goal is hidden normally but retained for restoration and history",()=>{
 const data=sample();
 data["2026-10"].goals[0].deleted=true;
 assert.equal(collectGoals(data).length,0);
 const restored=collectGoals(data,null,true);
 assert.equal(restored.length,1);
 assert.equal(restored[0].archived,true);
 assert.equal(linkedTransactions(restored[0],data).length,3);
 assert.equal(data["2026-12"].savings[0].goalId,"trip");
 data["2026-10"].goals[0].deleted=false;
 assert.equal(collectGoals(data).length,1);
});
test("UI provides recoverable deletion and keeps existing savings goal links editable",()=>{
 const source=fs.readFileSync(path.join(__dirname,"../savings-goals.js"),"utf8");
 assert.match(source,/data-pg-delete/);
 assert.match(source,/data-pg-undelete/);
 assert.match(source,/linkedTransactions\(g,state\.months/);
 assert.match(source,/item\.deleted=deleting/);
 assert.match(source,/list\(true\)\.find\(x=>x\.id===id\)/);
 assert.match(source,/entryId&&state\.months/);
});
