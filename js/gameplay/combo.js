// js/gameplay/combo.js — Fase 2.3/2.4 extraction. Non-module script.


function getSector(progress){if(progress<0.33)return 0;if(progress<0.67)return 1;return 2;}

function triggerCombo(reason){
  _comboCount++;_comboTimer=8.0;
  if(_comboCount>=6)_comboMult=2.5;
  else if(_comboCount>=4)_comboMult=2.0;
  else if(_comboCount>=2)_comboMult=1.5;
  else _comboMult=1.2;
  showPopup('🔥 '+reason+' · '+_comboMult.toFixed(1)+'x','#ff8800',900);
  const ce=document.getElementById('comboEl');
  if(ce){ce.textContent=_comboCount+'x COMBO';ce.style.opacity='1';}
}

function resetCombo(){
  _comboCount=0;_comboMult=1.0;
  const ce=document.getElementById('comboEl');if(ce)ce.style.opacity='0';
}
