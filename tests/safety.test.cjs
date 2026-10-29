"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const get=p=>fs.readFileSync(path.join(root,p),"utf8");
test("private backup no longer tracked in current tree",()=>{assert.match(get(".gitignore"),/penvoria-backup-\*\.json/);assert.equal(fs.existsSync(path.join(root,"penvoria-backup-2026-10-26.json")),false);});
test("monthly writes and deletes check revisions",()=>{assert.match(get("cloud.js"),/\.eq\("revision", draft\.baseRevision\)/);assert.match(get("history-month-delete.js"),/\.eq\("revision", expectedRevision\)/);});
test("monthly sync protects unsaved drafts",()=>{const s=get("cloud-refresh.js");assert.match(s,/cloud\.syncing/);assert.match(s,/cloud\.conflicts\.size/);assert.match(s,/Object\.keys\(cloud\.drafts\)\.length/);});
test("recurring synchronization protects forms",()=>{const s=get("recurring.js");assert.match(s,/syncRecurringTemplates/);assert.match(s,/selectedId !== "closed"/);});

test("entry calendar preserves form date and month constraints",()=>{const js=get("entry-date-picker.js");assert.match(js,/name="date"/);assert.match(js,/input\.type = "hidden"/);assert.match(js,/input\.value = value/);assert.match(js,/dispatchEvent\(new Event\("change"/);assert.match(js,/dateInMonth\(value, monthKey, lastDay\)/);const page=get("index.html");assert.match(page,/entry-date-picker\.js/);assert.match(page,/entry-date-picker\.css/);});

test("themed budget month selector retains the existing app month-change handler",()=>{
  const js=get("budget-month-picker.js");
  const app=get("app.js");
  const page=get("index.html");
  const worker=get("sw.js");
  assert.match(js,/input\.dispatchEvent\(new Event\("change"/);
  assert.match(js,/isValidMonth\(key\)/);
  assert.match(js,/input\.type = "hidden"/);
  assert.match(js,/displayedYear \+ Number\(yearNav\.dataset\.bmNav\)/);
  assert.match(app,/window\.PenvoriaBudgetMonthPicker\?\.sync\(month\)/);
  assert.match(app,/#monthPicker"\)\.onchange/);
  assert.match(page,/budget-month-picker\.js/);
  assert.match(page,/budget-month-picker\.css/);
  assert.match(worker,/"budget-month-picker\.js"/);
});
