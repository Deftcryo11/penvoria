"use strict";
(function goalsModel(){
 const validMonth = key=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(key));
 function validDate(key) {
  if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(key)))return false;
  const date=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7))-1,Number(key.slice(8))));
  return date.toISOString().slice(0,10)===key;
 }
 function collectGoals(months,selectedMonth=null,includeDeleted=false) {
  const records=months&&typeof months==="object"?months:{};
  const result=[],seen=new Set();
  for(const key of Object.keys(records).sort()){
   if(!validMonth(key)||(selectedMonth&&key>selectedMonth))continue;
   for(const goal of Array.isArray(records[key]?.goals)?records[key].goals:[]){
    if(!goal||typeof goal.id!=="string"||!goal.id||seen.has(goal.id)||(!includeDeleted&&goal.deleted))continue;
    const amount=Number(goal.target);
    if(!Number.isFinite(amount)||amount<=0)continue;
    seen.add(goal.id);
    result.push({...goal,ownerMonth:key,target:Math.round(amount*100)/100});
   }
  }
  return result;
 }
 function goalProgress(goal,months) {
  if(!goal?.id)return{transferred:0,remaining:0,percent:0,count:0};
  let cents=0,count=0;
  for(const [key,record] of Object.entries(months||{})){
   if(!validMonth(key)||key<goal.ownerMonth)continue;
   for(const saving of Array.isArray(record?.savings)?record.savings:[]){
    if(!saving||saving.goalId!==goal.id)continue;
    const n=Number(saving.transferred);
    if(Number.isFinite(n)&&n>0){cents+=Math.round(n*100);count++;}
   }
  }
  const target=Math.max(1,Math.round(Number(goal.target)*100));
  return{
   transferred:cents/100,remaining:Math.max(0,target-cents)/100,
   percent:Math.min(100,Math.round(cents/target*10000)/100),count
  };
 }

 // Display all saved entries linked to a goal, including zero-transfer plans.
 // This is read-only and does not change existing financial records.
 function linkedTransactions(goal,months) {
  if(!goal?.id)return[];
  const result=[];
  for(const key of Object.keys(months||{}).sort()){
   if(!validMonth(key)||key<goal.ownerMonth)continue;
   const entries=Array.isArray(months[key]?.savings)?months[key].savings:[];
   for(const item of entries){
    if(!item||item.goalId!==goal.id)continue;
    const planned=Number(item.amount),transferred=Number(item.transferred);
    result.push({
     month:key,id:typeof item.id==="string"?item.id:"",
     title:String(item.title||"Savings entry"),
     date:validDate(item.date)&&item.date.startsWith(key+"-")?item.date:null,
     planned:Number.isFinite(planned)&&planned>=0?Math.round(planned*100)/100:0,
     transferred:Number.isFinite(transferred)&&transferred>=0?Math.round(transferred*100)/100:0
    });
   }
  }
  return result.sort((a,b)=>(b.date||b.month).localeCompare(a.date||a.month)||a.title.localeCompare(b.title));
 }
 const api={validMonth,validDate,collectGoals,goalProgress,linkedTransactions};
 if(typeof window!=="undefined")window.PenvoriaGoalsModel=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
