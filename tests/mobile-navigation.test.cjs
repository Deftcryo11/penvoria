"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = name => fs.readFileSync(path.join(root,name),"utf8");

test("mobile bottom navigation keeps five primary tabs and provides all pages",()=>{
 const html=read("index.html");
 const views=[...html.matchAll(/data-mobile-view="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(views,["dashboard","planning","spending","goals","insights","history","recurring"]);
 assert.match(html,/id="mobileMoreButton"/);
 assert.match(html,/id="mobileMoreMenu"[^>]+hidden/);
 assert.match(html,/aria-expanded="false"/);
});

test("new navigation code is registered, cached, and keeps desktop sidebar intact",()=>{
 const html=read("index.html"),sw=read("sw.js"),app=read("app.js"),js=read("mobile-more-nav.js");
 assert.match(html,/src="mobile-more-nav\.js"/);
 assert.ok(html.indexOf('src="app.js"')<html.indexOf('src="mobile-more-nav.js"'));
 assert.ok(sw.includes('"mobile-more-nav.js"'));
 for(const view of ["goals","insights","history","recurring"]) assert.ok(html.includes('data-view="'+view+'"'));
 assert.match(app,/button\.dataset\.mobileView/);
 assert.match(js,/secondaryViews\.has\(view\)/);
 assert.match(js,/aria-current/);
 assert.match(js,/event\.key === "Escape"/);
});

test("standalone bar stays outside the scroll area and uses stable viewport height",()=>{
 const css=read("style.css");
 assert.match(css,/body\.authenticated\s*\{\s*height:\s*100svh;/);
 assert.match(css,/body\.authenticated \.mobile-bottom-nav\s*\{[\s\S]*?flex-shrink: 0;/);
 assert.match(css,/\.mobile-more-menu\[hidden\] \{ display: none !important; \}/);
 assert.match(css,/env\(safe-area-inset-bottom/);
});
