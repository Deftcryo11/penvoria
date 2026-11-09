"use strict";
(function spendingUI(){
 const root=document.getElementById("app"),logic=window.PenvoriaSpendingInsights;
 if(!root||!logic)return;
 const safe=x=>escapeHtml(x==null?"":String(x));
 const compactMonth=key=>{
  if(!key)return"";
  return new Date(key+"-01T12:00:00").toLocaleDateString("en-US",{month:"short",year:"2-digit"});
 };
 function html(){
  if(!window.penvoriaCloud?.ready)return'<section class="panel"><h2>Spending insights</h2><p>Sign in to explore your spending.</p></section>';
  const report=logic.comparison(state.months||{},month);
  if(!report)return'<section class="panel">Select a valid month.</section>';
  const cur=report.current;
  const trends=logic.trend(state.months,month,6);
  const highest=Math.max(1,...trends.map(x=>x.total));
  const biggest=cur.categories[0];
  const change=report.percentChange===null?"Not comparable":
    (report.percentChange>0?"+":"")+report.percentChange.toFixed(1)+"%";
  const diff=report.difference>0?"increase":report.difference<0?"decrease":"no change";
  const allocWarnings=cur.categories.filter(x=>x.overBudget);
  return `<section class="panel si-intro">
      <div class="panel-head"><div><h2>Spending insights</h2>
        <p class="panel-sub">Analyze actual expenses for ${safe(monthLabel(month))}.</p></div>
        <button class="secondary" type="button" data-si-spending>Back to Spending</button></div>
      <div class="si-kpis">
        <div><span>Spent this month</span><strong>${money(cur.total)}</strong></div>
        <div><span>Transactions</span><strong>${cur.count}</strong></div>
        <div><span>Average transaction</span><strong>${money(cur.average)}</strong></div>
        <div><span>Largest category</span><strong>${biggest?safe(biggest.name):"No expenses"}</strong></div>
      </div>
    </section>
    <section class="panel">
      <h2>Month-over-month comparison</h2>
      <p class="panel-sub">${safe(monthLabel(report.previousMonth))} vs ${safe(monthLabel(month))}</p>
      ${report.hasPrevious?`
        <div class="si-compare">
          <div><small>Previous month</small><strong>${money(report.previous.total)}</strong></div>
          <div><small>Current month</small><strong>${money(cur.total)}</strong></div>
          <div><small>Change</small><strong>${safe(change)}</strong></div>
        </div>
        <p class="pr-note">Expenses ${diff} by ${money(Math.abs(report.difference))} from the previous month.
          Percentage is unavailable when the previous month had no recorded spending.</p>
      `:'<p class="pg-muted">No previous-month budget record yet; a comparison will appear once it exists.</p>'}
    </section>
    <section class="panel">
      <h2>Six-month spending trend</h2>
      <p class="panel-sub">Monthly total expenses, including months with no recorded spending.</p>
      <div class="si-trend" role="group" aria-label="Last six months spending trend">
        ${trends.map(t=>`
          <div class="si-month">
            <strong>${money(t.total)}</strong>
            <div class="si-bar-area" role="img" aria-label="${safe(compactMonth(t.month))}: ${money(t.total)}">
              <div class="si-bar" style="height:${Math.round(t.total/highest*100)}%"></div>
            </div>
            <small>${safe(compactMonth(t.month))}</small>
          </div>`).join("")}
      </div>
    </section>
    <section class="panel">
      <h2>Category spending</h2>
      <p class="panel-sub">Actual transactions by category, their share, and monthly allocation usage.</p>
      ${cur.categories.length?`<div class="si-category-list">${report.categories.map(c=>`
        <div class="si-category">
          <div class="si-category-top"><strong>${safe(c.name)}</strong>
            <span>${money(c.amount)} · ${c.share.toFixed(1)}%</span></div>
          <div class="si-category-track"><span style="width:${Math.min(100,c.share)}%"></span></div>
          <small>${c.planned>0?`${money(c.planned)} planned · ${c.overBudget?"Over budget":"Within plan"}`:
            "No matching Needs allocation"}
            ${report.hasPrevious?` · ${c.delta>0?"+":""}${money(c.delta)} vs previous month`:""}</small>
        </div>`).join("")}</div>`:'<p class="pg-muted">No recorded expenses for this month.</p>'}
      ${allocWarnings.length?`<p class="si-warning">${allocWarnings.length} categor${allocWarnings.length===1?"y is":"ies are"} over its monthly allocation.</p>`:""}
    </section>
    <section class="panel">
      <h2>Highest spending days</h2>
      <p class="panel-sub">The five dates with the most recorded expenses in ${safe(monthLabel(month))}.</p>
      ${cur.days.length?`<div class="si-days">${cur.days.slice(0,5).map(day=>`
        <div><span>${safe(day.date)}</span><strong>${money(day.amount)}</strong></div>
      `).join("")}</div>`:'<p class="pg-muted">No dated transactions in this month.</p>'}
    </section>
  `;
 }
 const old=render;
 render=function(...args){
  const result=old(...args);
  if(view==="insights")root.innerHTML=html();
  else if(view==="spending"||view==="history"){
   root.insertAdjacentHTML("afterbegin",`<section class="panel si-shortcut">
    <div><h2>Spending insights</h2><p class="panel-sub">
      Monthly comparisons, categories, and expensive days.</p></div>
    <button type="button" class="secondary" data-si-open>View spending insights</button>
    </section>`);
  }
  return result;
 };
 root.addEventListener("click",event=>{
  const button=event.target.closest("button");
  if(!button)return;
  if(button.hasAttribute("data-si-open")){
   view="insights";render();return;
  }
  if(button.hasAttribute("data-si-spending")){
   view="spending";render();
  }
 });
})();
