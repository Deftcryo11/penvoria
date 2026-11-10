"use strict";
(function installGoals(){
 const root=document.getElementById("app");
 const model=window.PenvoriaGoalsModel;
 if(!root||!model)return;
 const safe=value=>escapeHtml(value==null?"":String(value));
 let editingId=null,showArchived=false,showDeleted=false;
 const isReady=()=>!!window.penvoriaCloud?.ready&&!!window.penvoriaCloud?.user;
 const list=(includeDeleted=false)=>model.collectGoals(state.months||{},null,includeDeleted);
 const find=id=>list().find(x=>x.id===id);
 function validLink(id,key,entryId=null){
  const g=list(true).find(x=>x.id===id);
  if(!g||g.ownerMonth>key)return false;
  if(!g.archived&&!g.deleted)return true;
  // Existing Savings entries remain editable after their goal is archived.
  // Archived goals cannot be newly attached to a different transfer.
  return!!(entryId&&state.months?.[key]?.savings?.some(
    x=>x.id===entryId&&x.goalId===id
  ));
 }
 function optionsHTML(selected="",key=month){
  if(!isReady())return"";
  const options=list(true).filter(g=>g.ownerMonth<=key&&(!g.archived&&!g.deleted||g.id===selected));
  return `<div class="field">
    <label for="f_goalId">Savings goal (optional)</label>
    <select id="f_goalId" name="goalId"><option value="">No linked goal</option>
    ${options.map(g=>`<option value="${safe(g.id)}" ${selected===g.id?"selected":""}>
      ${safe(g.title)}${g.deleted?" (deleted)":g.archived?" (archived)":""}</option>`).join("")}
    </select><small>Only the amount actually transferred counts as progress.</small></div>`;
 }
 function canEdit(key){
  const c=window.penvoriaCloud;
  return!!(isReady()&&navigator.onLine&&!c.recoveryError&&!c.syncing&&!c.conflicts?.size&&!c.drafts?.[key]);
 }
 function persist(key){window.penvoriaCloud.queueSave(key,state.months[key]);}
 function editorHTML(){
  const g=editingId==="new"?null:find(editingId);
  return `<section class="panel pg-editor"><h2>${g?"Edit":"New"} savings goal</h2>
   <form id="pg-form"><div class="pg-fields">
    <label>Goal name<input name="title" type="text" required maxlength="80" value="${safe(g?.title||"")}" placeholder="Emergency fund"></label>
    <label>Target amount (MVR)<input name="target" type="number" min="0.01" step="0.01" required value="${safe(g?.target||"")}"></label>
    <label>Deadline (optional)<input name="deadline" type="date" value="${safe(g?.deadline||"")}"></label>
   </div><p class="pr-note">A goal is stored in its creation month. Only linked actual savings transfers add progress.</p>
   <div class="pg-actions"><button class="primary" type="submit">Save goal</button>
    <button class="secondary" type="button" data-pg-cancel>Cancel</button></div></form></section>`;
 }
 function transactionsHTML(g){
  const entries=model.linkedTransactions(g,state.months||{});
  return `<details class="pg-transactions">
    <summary>Linked savings entries (${entries.length})</summary>
    ${entries.length?`<ul class="pg-transaction-list">
      ${entries.map(item=>`<li>
        <div><strong>${safe(item.title)}</strong>
          <small>${safe(item.date||item.month)}</small></div>
        <div class="pg-transaction-values">
          <strong>${money(item.transferred)} transferred</strong>
          <small>${money(item.planned)} planned</small>
        </div>
      </li>`).join("")}
    </ul>`:'<p class="pg-muted">No linked savings entries.</p>'}
    <p class="pg-muted">These are saved Savings entries. Edit their details in Planning for the corresponding month.</p>
  </details>`;
 }
 function card(g){
  const p=model.goalProgress(g,state.months);
  return `<article class="pg-card">
    <div class="pg-card-top"><div><h3>${safe(g.title)}</h3>
      <small>${g.archived?"Archived":p.remaining===0?"Goal reached":"In progress"}${g.deadline?" · Target "+safe(g.deadline):""}</small>
    </div><strong>${money(p.transferred)} / ${money(g.target)}</strong></div>
    <div class="pg-progress" role="progressbar" aria-label="${safe(g.title)} progress"
      aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100">
      <span style="width:${p.percent}%"></span></div>
    <p class="pg-meta">${p.percent.toFixed(1)}% funded · ${money(p.remaining)} remaining · ${p.count} transfer(s)</p>
    ${transactionsHTML(g)}
    <div class="pg-actions">
      ${g.deleted?`<button type="button" class="secondary" data-pg-undelete="${safe(g.id)}">Restore deleted goal</button>`:
      `${g.archived?"":`<button type="button" class="primary" data-pg-contribute="${safe(g.id)}">Record transfer</button>`}
      <button type="button" class="secondary" data-pg-edit="${safe(g.id)}">Edit</button>
      <button type="button" class="secondary" data-pg-archive="${safe(g.id)}">${g.archived?"Restore":"Archive"}</button>
      ${g.archived?`<button type="button" class="secondary pg-delete" data-pg-delete="${safe(g.id)}">Delete goal</button>`:""}`}
    </div></article>`;
 }
 function goalsHTML(){
  if(!isReady())return'<section class="panel"><h2>Savings goals</h2><p>Sign in to view your goals.</p></section>';
  const all=list(true),records=all.filter(x=>!x.deleted),deleted=all.filter(x=>x.deleted),active=records.filter(x=>!x.archived),archived=records.filter(x=>x.archived);
  const cents=arr=>arr.reduce((n,g)=>n+Math.round(g.target*100),0)/100;
  const amounts=active.reduce((n,g)=>n+Math.round(model.goalProgress(g,state.months).transferred*100),0)/100;
  return `<section class="panel">
    <div class="panel-head"><div><h2>Savings goals</h2>
      <p class="panel-sub">Track real transfers against your targets.</p></div>
      <button type="button" class="primary" data-pg-new>+ New goal</button></div>
    <p>${active.length} active goal(s) · ${money(amounts)} transferred · ${money(cents(active))} targeted</p>
    <p class="pr-note">Planned savings alone do not count. Use Record transfer or link an existing Savings entry in Planning.</p>
   </section>
   ${editingId!==null?editorHTML():""}
   <section class="panel"><h2>Active goals</h2>
    <div class="pg-list">${active.length?active.map(card).join(""):'<p class="pg-muted">Create your first savings goal.</p>'}</div>
   </section>
   ${archived.length?`<section class="panel"><div class="panel-head"><h2>Archived (${archived.length})</h2>
    <button type="button" class="secondary" data-pg-toggle>${showArchived?"Hide":"Show"} archived</button></div>
    ${showArchived?`<div class="pg-list">${archived.map(card).join("")}</div>`:""}
   </section>`:""}
   ${deleted.length?`<section class="panel"><div class="panel-head"><h2>Deleted goals (${deleted.length})</h2>
    <button type="button" class="secondary" data-pg-toggle-deleted>${showDeleted?"Hide":"Show"} deleted</button></div>
    <p class="pg-muted">Deleted goals are hidden from active and archived lists. Their saved transactions are preserved. You can restore them here.</p>
    ${showDeleted?`<div class="pg-list">${deleted.map(card).join("")}</div>`:""}
   </section>`:""}`;
 }
 const oldRender=render;
 render=function(...args){
  const result=oldRender(...args);
  if(view==="goals")root.innerHTML=goalsHTML();
  else if(view==="planning")root.insertAdjacentHTML("afterbegin",
   `<section class="panel pg-shortcut"><div><h2>Savings goals</h2>
    <p class="panel-sub">Track progress towards targets using actual transfers.</p></div>
    <button type="button" class="secondary" data-pg-open>View savings goals</button></section>`);
  return result;
 };
 root.addEventListener("click",event=>{
  const btn=event.target.closest("button");if(!btn)return;
  if(btn.hasAttribute("data-pg-open")){view="goals";editingId=null;render();return;}
  if(view!=="goals")return;
  if(btn.hasAttribute("data-pg-new")){editingId="new";render();return;}
  if(btn.hasAttribute("data-pg-cancel")){editingId=null;render();return;}
  if(btn.hasAttribute("data-pg-toggle")){showArchived=!showArchived;render();return;}
  if(btn.hasAttribute("data-pg-toggle-deleted")){showDeleted=!showDeleted;render();return;}
  if(btn.dataset.pgDelete||btn.dataset.pgUndelete){
   const deleting=!!btn.dataset.pgDelete;
   const g=list(true).find(x=>x.id===(btn.dataset.pgDelete||btn.dataset.pgUndelete));
   if(!g||(deleting?(!g.archived||g.deleted):!g.deleted))return;
   if(!canEdit(g.ownerMonth)){alert("Wait for All changes saved and resolve cloud conflicts before modifying this goal.");return;}
   const entries=model.linkedTransactions(g,state.months||{});
   if(!confirm(deleting?
     `Delete archived goal "${g.title}"?\n\nIt will disappear from the goal lists. ${entries.length} linked savings entries will remain unchanged. You can restore this goal under Deleted goals.`:
     `Restore deleted goal "${g.title}" to Archived goals?`))return;
   if(!canEdit(g.ownerMonth))return;
   const item=state.months[g.ownerMonth]?.goals?.find(x=>x.id===g.id);
   if(!item||Boolean(item.deleted)===deleting)return;
   item.deleted=deleting;
   // An undeleted goal stays archived until explicitly restored.
   item.archived=true;
   persist(g.ownerMonth);
   editingId=null;
   render();
   return;
  }
  if(btn.dataset.pgEdit){editingId=btn.dataset.pgEdit;render();return;}
  if(btn.dataset.pgContribute){
   const g=find(btn.dataset.pgContribute);
   if(!g||g.archived||month<g.ownerMonth){alert("Select the goal's creation month or later.");return;}
   openModal("savings",null,{goalId:g.id});
   return;
  }
  if(btn.dataset.pgArchive){
   const g=find(btn.dataset.pgArchive);
   if(!g||!canEdit(g.ownerMonth)){alert("Wait for cloud sync before editing this goal.");return;}
   const yes=confirm(`${g.archived?"Restore":"Archive"} goal "${g.title}"? Existing transfers stay in Spending history.`);
   if(!yes||!canEdit(g.ownerMonth))return;
   const existing=state.months[g.ownerMonth]?.goals?.find(x=>x.id===g.id);
   if(!existing)return;
   existing.archived=!g.archived;
   persist(g.ownerMonth);render();
  }
 });
 root.addEventListener("submit",event=>{
  if(event.target.id!=="pg-form"||view!=="goals")return;
  event.preventDefault();
  const g=editingId==="new"?null:find(editingId);
  if(editingId!=="new"&&!g)return;
  const key=g?.ownerMonth||month;
  if(!canEdit(key)){alert("Wait for All changes saved and resolve conflicts before changing goals.");return;}
  const form=new FormData(event.target);
  const title=String(form.get("title")||"").trim(),target=Number(form.get("target"));
  const deadline=String(form.get("deadline")||"");
  if(!title||title.length>80||!Number.isFinite(target)||target<0.01||
     (deadline&&!model.validDate(deadline))){alert("Enter a name, positive target and valid date.");return;}
  const item=g?state.months[key]?.goals?.find(x=>x.id===g.id):null;
  if(g&&!item)return;
  const next={id:g?.id||makeId(),title,target:Math.round(target*100)/100,
    deadline,archived:g?.archived||false};
  if(item)Object.assign(item,next);
  else data(key).goals.push(next);
  persist(key);editingId=null;render();
 });
 window.PenvoriaGoals={validLink,optionsHTML};
})();
