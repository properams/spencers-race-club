// js/gameplay/propcollisions.js — non-module script.
//
// Minimal cylinder-vs-circle collision tussen player car en static
// world props (op dit moment alleen trees). Andere props (lichtmasten,
// banners, signs) kunnen later worden geregistreerd via dezelfde
// _propColliders array — geen extra systeem nodig.
//
// Performance: lineaire scan over O(visible) props. Cull op view-radius
// (50m default) voor de squared-distance check. Met ~270 trees en de
// view-cull is dit ~270 ops/frame in worst case — verwaarloosbaar
// vergeleken bij existing per-frame work.

'use strict';

// Globale registry — gevuld door track/environment.js bij world-build,
// gereset bij world-switch via core/scene.js disposeScene-pad
// (verwijderen via length=0 om de Array-referentie te behouden).
const _propColliders=[];
window._propColliders=_propColliders;

const _PC_VIEW_R=50;          // skip props > 50m van speler (cull)
const _PC_VIEW_R_SQ=_PC_VIEW_R*_PC_VIEW_R;
const _PC_COOLDOWN=0.4;       // seconde tussen consecutive hits per prop
let _pcContactPopupCD=0;

function checkPropCollisions(dt){
  if(_pcContactPopupCD>0)_pcContactPopupCD-=dt;
  if(!_propColliders.length)return;
  if(typeof recoverActive!=='undefined'&&recoverActive)return;
  const player=carObjs[playerIdx];if(!player||player.finished)return;
  if(player.inAir)return; // overspringen vermijdt onverwachte boom-bumps in de lucht
  const px=player.mesh.position.x, pz=player.mesh.position.z;
  for(let i=0;i<_propColliders.length;i++){
    const c=_propColliders[i];
    if(c.cooldown>0){c.cooldown-=dt;continue;}
    const dx=px-c.x, dz=pz-c.z;
    const d2=dx*dx+dz*dz;
    if(d2>_PC_VIEW_R_SQ)continue;
    const reach=c.r+1.0; // 1m car-radius approx
    const reach2=reach*reach;
    if(d2<reach2&&d2>.0001){
      const dist=Math.sqrt(d2);
      const nx=dx/dist, nz=dz/dist;
      // Push speler weg van prop tot buiten reach + speed-loss + shake
      player.mesh.position.x=c.x+nx*reach;
      player.mesh.position.z=c.z+nz*reach;
      player.speed*=.55;
      camShake=Math.max(camShake||0,0.55);
      Audio.playCollision&&Audio.playCollision();
      sparkSystem.emit(c.x,.6,c.z,nx*.05,.06,nz*.05,16,1,.55,.2,.5);
      c.cooldown=_PC_COOLDOWN;
      player.hitCount=(player.hitCount||0)+1;
      if(_pcContactPopupCD<=0){
        showPopup&&showPopup('🌲 BUMP!','#ff8844',600);
        _pcContactPopupCD=1.2;
      }
    }
  }
}

window.checkPropCollisions=checkPropCollisions;
