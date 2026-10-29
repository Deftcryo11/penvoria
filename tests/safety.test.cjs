"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const get=p=>fs.readFileSync(path.join(root,p),"utf8");
test("private backup no longer tracked in current tree",()=>{assert.match(get(".gitignore"),/penvoria-backup-\*\.json/);assert.equal(fs.existsSync(path.join(root,"penvoria-backup-2026-10-26.json")),false);});
test("monthly writes and deletes check revisions",()=>{assert.match(get("cloud.js"),/\.eq\("revision", draft\.baseRevision\)/);assert.match(get("history-month-delete.js"),/\.eq\("revision", expectedRevision\)/);});
test("monthly sync protects unsaved drafts",()=>{const s=get("cloud-refresh.js");assert.match(s,/cloud\.syncing/);assert.match(s,/cloud\.conflicts\.size/);assert.match(s,/Object\.keys\(cloud\.drafts\)\.length/);});
test("recurring synchronization protects forms",()=>{const s=get("recurring.js");assert.match(s,/syncRecurringTemplates/);assert.match(s,/selectedId !== "closed"/);});
