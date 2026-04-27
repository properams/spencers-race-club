// js/gameplay/achievements.js — non-module script.

// Runtime achievement-state (uit main.js verhuisd).
// _achieveUnlocked: ids die deze sessie zijn vrijgespeeld (Set, geen rebind).
// _achieveQueue:    queue van te tonen toasts (FIFO; gameloop draint hem).
// _achieveTimer:    delay-counter voor toast-zichtbaarheid.
// _achieveToastEl:  DOM-ref naar de toast-popup (gevuld door cacheHUDRefs).
const _achieveUnlocked=new Set();
const _achieveQueue=[];
let _achieveTimer=0;
let _achieveToastEl=null;

// In-race achievement lookup table (uit main.js verhuisd).
// Gebruikt door unlockAchievement() hieronder.
const _RACE_ACHIEVEMENTS={
  SPEED_DEMON: {label:'SPEED DEMON',desc:'Exceed 95% top speed',icon:'⚡'},
  DRIFT_KING:  {label:'DRIFT KING', desc:'Drift 3+ seconds',icon:'🔥'},
  CLEAN_LAP:   {label:'CLEAN LAP',  desc:'Lap without recovery',icon:'✨'},
  OVERTAKER:   {label:'OVERTAKER',  desc:'Pass 5 cars',icon:'🚀'},
  NITRO_JUNKIE:{label:'NITRO JUNKIE',desc:'Use nitro 10x',icon:'💜'},
  FLYING:      {label:'AIRBORNE',   desc:'Airborne 2+ seconds',icon:'🛸'},
  FIRST_BLOOD: {label:'FIRST BLOOD',desc:'Reach P1',icon:'🏅'},
  CHAMPION:    {label:'CHAMPION',   desc:'Finish in 1st place',icon:'🏆'},
};

// Persistent achievement-definities + dagelijkse challenges (uit main.js verhuisd).
// `check` callbacks lezen runtime-state (_raceCount, _unlockedCars,
// _totalCoinsEarned, _podiumCount, _comboCount, isDark, difficulty)
// via cross-script scope — geëvalueerd ná de race door finish.js.
const ACHIEVEMENTS=[
  {id:'first_win',icon:'🏆',title:'FIRST WIN',desc:'Win your first race',check:function(p){return p===1&&_raceCount<=1;}},
  {id:'clean',icon:'✨',title:'CLEAN RACER',desc:'Zero damage finish',check:function(p,s){return s.hits===0;}},
  {id:'speed300',icon:'⚡',title:'SPEED DEMON',desc:'Hit 300+ km/h',check:function(p,s){return s.maxSpd>=300;}},
  {id:'collector',icon:'🚗',title:'COLLECTOR',desc:'Own 6+ cars',check:function(){return _unlockedCars.size>=6;}},
  {id:'rich',icon:'💰',title:'COIN MASTER',desc:'Earn 1000+ total coins',check:function(){return _totalCoinsEarned>=1000;}},
  {id:'fl',icon:'💜',title:'PURPLE RIBBON',desc:'Set fastest lap',check:function(p,s){return s.fl;}},
  {id:'podium5',icon:'🥇',title:'VETERAN',desc:'5 podium finishes',check:function(){return _podiumCount>=5;}},
  {id:'combo4',icon:'🔥',title:'ON FIRE',desc:'4x combo in a race',check:function(){return _comboCount>=4;}},
];
var DAILY_CHALLENGES=[
  {id:'win',text:'Win een race',reward:150,check:function(p){return p===1;}},
  {id:'clean',text:'Finish zonder schade',reward:200,check:function(p,s){return s.hits===0;}},
  {id:'fl',text:'Zet de snelste ronde',reward:120,check:function(p,s){return s.fl;}},
  {id:'night',text:'Win een nachtrace',reward:160,check:function(p){return p===1&&isDark;}},
  {id:'hard',text:'Top 3 op Hard',reward:250,check:function(p){return p<=3&&difficulty===2;}},
  {id:'p3',text:'Podium finish',reward:100,check:function(p){return p<=3;}},
  {id:'combo3',text:'Haal een 3x combo',reward:180,check:function(){return _comboCount>=3;}},
];

function unlockAchievement(id){
  if(_achieveUnlocked.has(id))return;
  _achieveUnlocked.add(id);
  var a=_RACE_ACHIEVEMENTS[id];
  if(!a)return;
  showAchievementToast({icon:a.icon||'🏆',title:a.label,desc:a.desc||''});
  if(typeof playCrowdCheer==='function')Audio.playCrowdCheer();
}


function updateAchievements(dt){
  const car=carObjs[playerIdx];if(!car)return;
  // Track max speed
  if(car.speed>_raceMaxSpeed)_raceMaxSpeed=car.speed;
  // Speed demon
  if(car.speed>=car.def.topSpd*.95)unlockAchievement('SPEED_DEMON');
  // Drift king
  if(driftTimer>0)_driftAccum+=dt;else _driftAccum=0;
  if(_driftAccum>=3.0)unlockAchievement('DRIFT_KING');
  // Airborne
  if(car.inAir)_airborneAccum+=dt;else _airborneAccum=0;
  if(_airborneAccum>=2.0)unlockAchievement('FLYING');
  // Overtakes: detect when player position improves
  const curPos=getPositions().findIndex(c=>c.isPlayer)+1;
  if(curPos<_lastPlayerPos){
    _raceOvertakes+=(_lastPlayerPos-curPos);
    if(curPos===1)unlockAchievement('FIRST_BLOOD');
  }
  _lastPlayerPos=curPos;
  if(_raceOvertakes>=5)unlockAchievement('OVERTAKER');
  // Clean lap — reset on recovery
  if(recoverActive)_cleanLapFlag=false;
  // Nitro junkie tracked via activations in updatePlayer
}


function updateAchievementToast(dt){
  if(!_achieveToastEl){_achieveToastEl=document.getElementById('achieveToast');}
  if(_achieveTimer>0){
    _achieveTimer-=dt;
    if(_achieveTimer<=0&&_achieveToastEl){
      _achieveToastEl.style.opacity='0';
      _achieveTimer=0;
      // Show next queued achievement after short gap
      if(_achieveQueue.length>0)setTimeout(()=>{showNextAchievement();},500);
    }
    return;
  }
  if(_achieveQueue.length>0&&_achieveTimer<=0)showNextAchievement();
}

function showNextAchievement(){
  if(_achieveQueue.length===0)return;
  const txt=_achieveQueue.shift();
  if(!_achieveToastEl){_achieveToastEl=document.getElementById('achieveToast');}
  if(!_achieveToastEl)return;
  _achieveToastEl.textContent='🏅 '+txt;
  _achieveToastEl.style.opacity='1';
  _achieveTimer=3.0;
}


function onNitroActivate(){
  _nitroUseCount++;
  if(_nitroUseCount>=10)unlockAchievement('NITRO_JUNKIE');
}

function onLapComplete(){
  if(_cleanLapFlag)unlockAchievement('CLEAN_LAP');
  _cleanLapFlag=true; // reset for next lap
}


function showAchievementToast(ach){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:linear-gradient(135deg,#1a0035,#2d0050);border:1px solid rgba(180,80,255,.5);border-radius:14px;padding:14px 24px;display:flex;align-items:center;gap:14px;font-family:Orbitron,sans-serif;z-index:var(--z-toast);box-shadow:0 0 30px rgba(180,80,255,.4);opacity:0;transition:all .4s cubic-bezier(.34,1.3,.64,1)';
  t.innerHTML='<span style="font-size:28px">'+ach.icon+'</span><div><div style="font-size:8px;color:#cc88ff;letter-spacing:3px">ACHIEVEMENT</div><div style="font-size:13px;color:#fff;letter-spacing:2px">'+ach.title+'</div><div style="font-size:9px;color:#886699;margin-top:2px">'+ach.desc+'</div></div>';
  document.body.appendChild(t);
  requestAnimationFrame(()=>{t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';});
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},3500);
}

function initDailyChallenge(){
  var di=new Date().getDate()%DAILY_CHALLENGES.length;
  _todayChallenge=DAILY_CHALLENGES[di];
  var ce=document.getElementById('dailyChallengeEl');
  if(ce&&_todayChallenge){
    ce.innerHTML='<div style="font-size:9px;color:#884499;letter-spacing:2px">DAGELIJKSE UITDAGING</div><div style="font-size:11px;color:#cc88ff;margin-top:3px">'+_todayChallenge.text+'</div><div style="font-size:10px;color:#ffd700;margin-top:2px">+'+_todayChallenge.reward+' \u{1F4B0}</div>';
  }
}
