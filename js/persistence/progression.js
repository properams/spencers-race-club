// js/persistence/progression.js — coins, unlocks, stats, records
// ES module. State leeft in window.* (main.js declares de globals); deze
// module muteert window.xxx en zet zichzelf via window.{awardCoins, buyCar, ...}.

import {savePersistent,loadPersistent} from './save.js';

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
  const newOnes=[];
  // Red Bull F1 (4): Finish P1
  if(finishPos===1&&!window._unlockedCars.has(4)){window._unlockedCars.add(4);newOnes.push(4);}
  // Mustang (5): Set overall fastest lap
  if(window._overallFastestLap<Infinity&&window.bestLapTime<=window._overallFastestLap+.01&&!window._unlockedCars.has(5)){window._unlockedCars.add(5);newOnes.push(5);}
  // Tesla (6): Complete 5 races
  if(window._raceCount>=5&&!window._unlockedCars.has(6)){window._unlockedCars.add(6);newOnes.push(6);}
  // Audi (7): 3 podium finishes
  if(window._podiumCount>=3&&!window._unlockedCars.has(7)){window._unlockedCars.add(7);newOnes.push(7);}
  return newOnes;
}

function showUnlockToast(carDef){
  const el=document.getElementById('unlockToast');if(!el)return;
  el.textContent='🔓 UNLOCKED: '+carDef.brand+' '+carDef.name;
  el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0',3200);
}

function showUnlocks(ids,idx=0){
  if(idx>=ids.length)return;
  const def=window.CAR_DEFS[ids[idx]];
  if(def)showUnlockToast(def);
  setTimeout(()=>showUnlocks(ids,idx+1),3800);
}

function updateTitleHighScore(){
  loadPersistent();
  const el=document.getElementById('titleHighScore');if(!el)return;
  const lines=[];
  if(window._savedHS>0)lines.push('HIGH SCORE: '+window._savedHS.toLocaleString());
  if(window._savedBL<Infinity)lines.push('BEST LAP: '+window.fmtTime(window._savedBL));
  if(window._speedTrapAllTime>0)lines.push('⚡ SPEED TRAP: '+window._speedTrapAllTime+' km/h');
  if(window._raceCount>0)lines.push('RACES: '+window._raceCount+' · PODIUMS: '+window._podiumCount);
  el.innerHTML=lines.join('<br>');
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

export {awardCoins,buyCar,buyWorld,checkUnlocks,showUnlockToast,showUnlocks,updateTitleHighScore};
