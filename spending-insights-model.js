"use strict";
(function spendingModel(){
 const validMonth=k=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(k));
 const cents=n=>Math.round(Number(n)*100);
 function shiftMonth(key,delta){
  if(!validMonth(key)||!Number.isInteger(delta))return null;
  const d=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5))-1+delta,1));
  return String(d.getUTCFullYear()).padStart(4,"0")+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
 }
 function categoryName(item,type="expenses"){
  if(!item||typeof item!=="object")return "Uncategorized";
  if(item.category==="Other / Custom"){
    return String(item.customCategory||item.title||"Other / Custom").trim()||"Other / Custom";
  }
  return String(item.category||(type==="needs"?item.title:"")||"Uncategorized").trim()||"Uncategorized";
 }
 function monthSpending(record={},key=""){
  const byCategory=new Map(),byDay=new Map(),allocations=new Map();
  let totalCents=0,count=0;
  for(const item of Array.isArray(record?.expenses)?record.expenses:[]){
   const v=Number(item?.amount);
   if(!Number.isFinite(v)||v<=0)continue;
   const amt=cents(v);
   totalCents+=amt;count++;
   const cat=categoryName(item);
   byCategory.set(cat,(byCategory.get(cat)||0)+amt);
   const date=String(item?.date||"");
   if(key&&date.startsWith(key+"-")&&/^\d{4}-\d{2}-\d{2}$/.test(date)){
    const day=Number(date.slice(8,10));
    const last=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5)),0)).getUTCDate();
    if(day>=1&&day<=last)byDay.set(date,(byDay.get(date)||0)+amt);
   }
  }
  for(const item of Array.isArray(record?.needs)?record.needs:[]){
   const amount=Number(item?.amount);
   if(!Number.isFinite(amount)||amount<=0)continue;
   const cat=categoryName(item,"needs");
   allocations.set(cat,(allocations.get(cat)||0)+cents(amount));
  }
  const categories=[...byCategory].map(([name,amountCents])=>{
   const budgetCents=allocations.get(name)||0;
   return{name,amount:amountCents/100,share:totalCents?Math.round(amountCents/totalCents*10000)/100:0,
    planned:budgetCents/100,overBudget:budgetCents>0&&amountCents>budgetCents};
  }).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name));
  const days=[...byDay].map(([date,amt])=>({date,amount:amt/100}))
   .sort((a,b)=>b.amount-a.amount||a.date.localeCompare(b.date));
  return{total:totalCents/100,count,average:count?Math.round(totalCents/count)/100:0,
    categories,days,allocations:[...allocations].map(([name,amount])=>({name,amount:amount/100}))};
 }
 function comparison(months,month){
  if(!validMonth(month))return null;
  const entries=months&&typeof months==="object"?months:{};
  const prevMonth=shiftMonth(month,-1);
  const current=monthSpending(entries[month]||{},month);
  const previous=monthSpending(entries[prevMonth]||{},prevMonth);
  const hasPrevious=Object.hasOwn(entries,prevMonth);
  const prevMap=new Map(previous.categories.map(c=>[c.name,c.amount]));
  const categories=current.categories.map(c=>({...c,
    previous:prevMap.get(c.name)||0,delta:Math.round((c.amount-(prevMap.get(c.name)||0))*100)/100}));
  return{month,previousMonth:prevMonth,current,previous,hasPrevious,
    difference:Math.round((current.total-previous.total)*100)/100,
    percentChange:previous.total>0?
      Math.round((current.total-previous.total)/previous.total*10000)/100:null,
    categories};
 }
 function trend(months,month,count=6){
  if(!validMonth(month)||!Number.isInteger(count)||count<1||count>24)return[];
  const entries=months&&typeof months==="object"?months:{};
  return Array.from({length:count},(_,i)=>{
    const key=shiftMonth(month,i-count+1);
    return{month:key,...monthSpending(entries[key]||{},key),hasData:Object.hasOwn(entries,key)};
  });
 }
 const api={shiftMonth,categoryName,monthSpending,comparison,trend};
 if(typeof window!=="undefined")window.PenvoriaSpendingInsights=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
