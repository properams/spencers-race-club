// js/persistence/progression.js — coins, unlocks, stats, records
// ES module. State leeft in window.* (main.js declares de globals); deze
// module muteert window.xxx en zet zichzelf via window.{awardCoins, buyCar, ...}.

import {savePersistent,loadPersistent} from './save.js';

// Per-car unlock-regels. Elke regel returnt true als de speler de car net verdiend heeft.
// `state` is { finishPos, bestLapTime, overallFastestLap, raceCount, podiumCount, alreadyUnlocked(id) }.
// Aanpassen voor balancing: regel toevoegen/wijzigen — checkUnlocks() consumeert de tabel.
const CAR_UNLOCK_RULES = [
  { id: 4, label: 'Red Bull F1 — finish P1',
    test: s => s.finishPos === 1 },
  { id: 5, label: 'Mustang — overall fastest lap',
    test: s => s.overallFastestLap < Infinity && s.bestLapTime <= s.overallFastestLap + 0.01 },
  { id: 6, label: 'Tesla — complete 5 races',
    test: s => s.raceCount >= 5 },
  { id: 7, label: 'Audi — 3 podium finishes',
    test: s => s.podiumCount >= 3 },
];

function awardCoins(pos){
  const base=[200,140,100,70,50,35,20,10];
  let earned=base[pos-1]||10;
  const pCar=window.carObjs[window.playerIdx];
  if(pCar&&window.bestLapTime!==Infinity&&window.bestLapTime<=window._overallFastestLap+0.001)earned+=80;
  if(pCar&&pCar.hitCount===0)earned+=50;
  else if(pCar&&pCar.hitCount<=2)earned+=20;
  earned+=window.TOTAL_LAPS*15;
  const diffMult=window.difficulty===2?1.8:window.difficulty===0?0.8:1.0;
  earned=Math.round(earned*diffMult);
  if(typeof window._comboMult!=='undefined'&&window._comboMult>1)earned=Math.round(earned*window._comboMult);
  window._coins+=earned;window._totalCoinsEarned+=earned;
  window._lastRaceCoins=earned;
  return earned;
}

function buyCar(id){
  const p=(window.CAR_PRICES&&window.CAR_PRICES[id])||0;
  if(p<=0||window._unlockedCars.has(id)||window._coins<p)return false;
  window._coins-=p;window._unlockedCars.add(id);savePersistent();return true;
}

function buyWorld(w){
  const p=(window.WORLD_PRICES&&window.WORLD_PRICES[w])||0;
  if(window._worldsUnlocked.has(w))return false;
  if(p>0&&window._coins<p)return false;
  if(p>0)window._coins-=p;window._worldsUnlocked.add(w);savePersistent();return true;
}

function checkUnlocks(finishPos){
  const state={
    finishPos,
    bestLapTime: window.bestLapTime,
    overallFastestLap: window._overallFastestLap,
    raceCount: window._raceCount,
    podiumCount: window._podiumCount
  };
  const newOnes=[];
  for(const rule of CAR_UNLOCK_RULES){
    if(window._unlockedCars.has(rule.id))continue;
    if(rule.test(state)){window._unlockedCars.add(rule.id);newOnes.push(rule.id);}
  }
  return newOnes;
}

// showUnlockToast: thin wrapper rond Notify.unlock. De oude #unlockToast DOM
// staat nog in index.html maar wordt niet meer geschreven (DEPRECATED — FASE 4).
function showUnlockToast(carDef){
  if(!carDef) return;
  if(!window.Notify){
    if(window.dbg)window.dbg.warn('notify','Notify niet ready, drop unlock',carDef&&carDef.name);
    else console.warn('Notify not ready for showUnlockToast');
    return;
  }
  window.Notify.unlock(carDef);
}

function showUnlocks(ids,idx=0){
  if(idx>=ids.length)return;
  const def=window.CAR_DEFS[ids[idx]];
  if(def)showUnlockToast(def);
  setTimeout(()=>showUnlocks(ids,idx+1),3800);
}

function updateTitleHighScore(){
  loadPersistent();
  // Title screen kept clean — best-lap / speed-trap / races / podiums all
  // surface elsewhere (selection screen rival display, finish screen, HUD).
  // We still load persistent state here for daily-challenge unlock checks.
  const el=document.getElementById('titleHighScore');if(el)el.innerHTML='';
  const coinEl=document.getElementById('titleCoins');
  if(coinEl&&window._coins>0)coinEl.textContent='💰 '+window._coins.toLocaleString()+' COINS';
}

window.awardCoins=awardCoins;
window.buyCar=buyCar;
window.buyWorld=buyWorld;
window.checkUnlocks=checkUnlocks;
window.showUnlockToast=showUnlockToast;
window.showUnlocks=showUnlocks;
window.updateTitleHighScore=updateTitleHighScore;
window.CAR_UNLOCK_RULES=CAR_UNLOCK_RULES;

export {awardCoins,buyCar,buyWorld,checkUnlocks,showUnlockToast,showUnlocks,updateTitleHighScore,CAR_UNLOCK_RULES};
