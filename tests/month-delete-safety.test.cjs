"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {inspect, requireSafe} = require("../month-delete-safety.js");

test("month without goals remains eligible for existing deletion checks", () => {
  const months = {"2026-10": {savings:[{amount:10}]}};
  assert.deepEqual(inspect(months,"2026-10"), {
    allowed:true,goalCount:0,linkedTransfers:0,linkedMonths:[]
  });
  assert.doesNotThrow(() => requireSafe(months,"2026-10"));
});
test("a goal created in the month blocks deletion even with no transfers", () => {
  const months = {"2026-10": {goals:[{id:"g1",title:"Trip",target:1000}]}};
  assert.equal(inspect(months,"2026-10").allowed,false);
  assert.throws(() => requireSafe(months,"2026-10"),/Deletion blocked/);
});
test("archived goal still blocks deletion", () => {
  const months = {"2026-10": {goals:[{id:"g1",archived:true}]}};
  assert.equal(inspect(months,"2026-10").goalCount,1);
  assert.throws(() => requireSafe(months,"2026-10"),/Archiving/);
});
test("later linked transfers are counted without mutation", () => {
  const months = {
    "2026-10":{goals:[{id:"g1"}], savings:[{goalId:"g1",transferred:5}]},
    "2026-11":{savings:[{goalId:"g1",transferred:10},{goalId:"other",transferred:20}]},
    "2026-12":{savings:[{goalId:"g1",transferred:3}]}
  };
  const before = JSON.stringify(months);
  assert.deepEqual(inspect(months,"2026-10"), {
    allowed:false,goalCount:1,linkedTransfers:3,linkedMonths:["2026-10","2026-11","2026-12"]
  });
  assert.equal(JSON.stringify(months),before);
});
test("goal definitions lacking IDs still prevent accidental deletion", () => {
  const months={"2026-10":{goals:[{title:"Legacy goal"}]}};
  assert.throws(() => requireSafe(months,"2026-10"),/1 savings goal/);
});
test("delete workflow guards both local and freshly fetched cloud record", () => {
  const base=path.join(__dirname,"..");
  const deletion=fs.readFileSync(path.join(base,"history-month-delete.js"),"utf8");
  const index=fs.readFileSync(path.join(base,"index.html"),"utf8");
  const worker=fs.readFileSync(path.join(base,"sw.js"),"utf8");
  assert.match(deletion,/PenvoriaMonthDeleteSafety\.requireSafe\(state\.months, key\)/);
  assert.match(deletion,/PenvoriaMonthDeleteSafety\.requireSafe\(\s*\{ \[key\]: remote\.data \}, key/);
  assert.match(deletion,/\.select\("revision,data"\)/);
  assert.ok(index.indexOf('src="month-delete-safety.js"') < index.indexOf('src="history-month-delete.js"'));
  assert.match(worker,/"month-delete-safety\.js"/);
});
