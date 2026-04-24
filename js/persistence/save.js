// js/persistence/save.js — localStorage save/load
// ES module. State leeft in window.* (main.js declares de let _coins etc.);
// deze module muteert window.xxx. Exporteert via window.{loadPersistent,savePersistent}.

function loadPersistent(){
  try{const d=JSON.parse(localStorage.getItem('spencerRC')||'{}');
    window._savedHS=d.hs||0;window._savedBL=d.bl||Infinity;
    window._raceCount=d.rc||0;window._podiumCount=d.pc||0;window._speedTrapAllTime=d.st||0;
    if(d.unlocked)d.unlocked.forEach(id=>window._unlockedCars.add(id));
    [0,1,2,3].forEach(id=>window._unlockedCars.add(id));
    window._coins=d.coins||0;window._totalCoinsEarned=d.totalCoins||0;
    if(d.worlds)d.worlds.forEach(w=>window._worldsUnlocked.add(w));
    if(d.records)window._trackRecords=d.records;
    // Progressive unlock
    if(window._raceCount>=2)window._worldsUnlocked.add('space');
    if(window._raceCount>=4)window._worldsUnlocked.add('deepsea');
    if(window._raceCount>=7)window._worldsUnlocked.add('candy');
    if(window._raceCount>=10)window._worldsUnlocked.add('neoncity');
    if(window._podiumCount>=3)window._worldsUnlocked.add('volcano');
    if(window._podiumCount>=6)window._worldsUnlocked.add('arctic');
  }catch(e){window._savedHS=0;window._savedBL=Infinity;}
}

function savePersistent(){
  try{
    const d={};
    if(window.totalScore>(window._savedHS||0)){d.hs=window.totalScore;window._savedHS=window.totalScore;}else{d.hs=window._savedHS;}
    if(window.bestLapTime<(window._savedBL||Infinity)&&window.bestLapTime!==Infinity){d.bl=window.bestLapTime;window._savedBL=window.bestLapTime;}else{d.bl=window._savedBL===Infinity?undefined:window._savedBL;}
    d.rc=window._raceCount;d.pc=window._podiumCount;d.st=window._speedTrapAllTime;
    d.unlocked=[...window._unlockedCars];
    d.coins=window._coins;d.totalCoins=window._totalCoinsEarned;d.worlds=[...window._worldsUnlocked];d.records=window._trackRecords;
    localStorage.setItem('spencerRC',JSON.stringify(d));
  }catch(e){}
}

window.loadPersistent=loadPersistent;
window.savePersistent=savePersistent;

export {loadPersistent,savePersistent};
