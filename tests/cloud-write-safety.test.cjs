"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../cloud.js"), "utf8");

function loadWriter(client) {
  const start = source.indexOf("async function writeMonth(");
  const end = source.indexOf("/* ==========================================\n   6. AUTOMATIC RETRY", start);
  assert.ok(start >= 0 && end > start, "Must locate actual cloud writer");
  const context = { __mockCloud: { client } };
  return vm.runInNewContext(
    "const cloud = __mockCloud;\n" + source.slice(start, end) + "\nwriteMonth;",
    context
  );
}

test("existing-month write must match user, month and base revision", async () => {
  const filters = [];
  const chain = {
    update: data => { filters.push(["update", data]); return chain; },
    eq: (k,v) => { filters.push([k,v]); return chain; },
    select: () => chain,
    maybeSingle: async () => ({data:{revision:"r2"},error:null})
  };
  const writer = loadWriter({from: table => {
    assert.equal(table,"monthly_budgets"); return chain;
  }});
  const result = await writer("2026-11",{data:{income:[]},baseRevision:"r1"},"owner-a");
  assert.equal(result.revision,"r2");
  assert.ok(filters.some(([k,v]) => k==="user_id" && v==="owner-a"));
  assert.ok(filters.some(([k,v]) => k==="month" && v==="2026-11-01"));
  assert.ok(filters.some(([k,v]) => k==="revision" && v==="r1"));
});

test("zero matching rows is a sync conflict, never a successful save", async () => {
  const chain={
    update:()=>chain,eq:()=>chain,select:()=>chain,
    maybeSingle:async()=>({data:null,error:null})
  };
  const result=await loadWriter({from:()=>chain})(
    "2026-11",{data:{expenses:[{amount:5}]},baseRevision:"old"},"owner-a");
  assert.equal(result.conflict,true);
});

test("duplicate insert from another device is handled as a conflict", async () => {
  const chain={
    insert:()=>chain,select:()=>chain,
    single:async()=>({data:null,error:{code:"23505"}})
  };
  const result=await loadWriter({from:()=>chain})(
    "2026-11",{data:{},baseRevision:null},"owner-a");
  assert.equal(result.conflict,true);
});

test("conflict recovery requires comparison of cloud revisions and preserves drafts", () => {
  const recovery=fs.readFileSync(path.join(__dirname,"../conflict-recovery.js"),"utf8");
  assert.match(recovery,/snapshot\.cloudRevision/);
  assert.match(recovery,/localToken/);
  assert.match(recovery,/writeMonth\(/);
  assert.match(recovery,/remainingDrafts/);
  assert.match(source,/cloud\.conflicts\.add\(key\)/);
  assert.match(source,/storeDrafts\(\)/);
});
