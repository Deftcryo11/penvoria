"use strict";
(function goalsModel(){
 const validMonth = key=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(key));
 function validDate(key) {
  if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(key)))return false;
  const date=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7))-1,Number(key.slice(8))));
  return date.toISOString().slice(0,10)===key;
 }
 function collectGoals(months,selectedMonth=null) {
  const records=months&&typeof months==="object"?months:{};
  const result=[],seen=new Set();
  for(const key of Object.keys(records).sort()){
   if(!validMonth(key)||(selectedMonth&&key>selectedMonth))continue;
   for(const goal of Array.isArray(records[key]?.goals)?records[key].goals:[]){
    if(!goal||typeof goal.id!=="string"||!goal.id||seen.has(goal.id))continue;
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
 const api={validMonth,validDate,collectGoals,goalProgress};
 if(typeof window!=="undefined")window.PenvoriaGoalsModel=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
