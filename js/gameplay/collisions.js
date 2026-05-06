// js/gameplay/collisions.js — non-module script.

'use strict';

function checkCollisions(dt){
  const player=carObjs[playerIdx];if(!player)return;
  if(_raceStartGrace>0){_raceStartGrace-=dt;return;} // Grace period at race start
  carObjs.forEach((other,i)=>{
    if(i===playerIdx)return;
    const dx=player.mesh.position.x-other.mesh.position.x,dz=player.mesh.position.z-other.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<2.4&&dist>.01){
      const nx=dx/dist,nz=dz/dist;
      const relSpd=Math.abs(player.speed-other.speed);
      player.mesh.position.x+=nx*.6;player.mesh.position.z+=nz*.6;
      other.mesh.position.x-=nx*.6;other.mesh.position.z-=nz*.6;
      player.speed*=.70;other.speed*=.70;
      const heavy=relSpd>.18;
      camShake=heavy?.88:.42;
      Audio.playCollision();
      const eX=player.mesh.position.x,eZ=player.mesh.position.z;
      sparkSystem.emit(eX,.5,eZ,nx*.05,.06,nz*.05,heavy?36:16,1,.65,.1,.45);
      // Float-text + popup are de-bounced via the global _contactPopupCD —
      // previously the heavy-contact branch fired floatText('💥 CONTACT!')
      // unconditionally every frame. Cars in close formation could bounce
      // 8-10 times during a single overtake → flickering popup spam (v3
      // issue 9). All visible feedback now shares the same cooldown gate.
      if(heavy){
        _colFlashT=0.42;
        if(_contactPopupCD<=0){
          // hitCount increment is gated by the cooldown so each burst of
          // contact-frames (cars locked side-by-side at >0.18 relSpd can
          // overlap 60×/s) registers as ONE hit. Without this gate the
          // ===3 / ===6 thresholds got jumped over silently AND _dmgMult
          // saturated within the first second of contact (physics.js:64).
          player.hitCount=(player.hitCount||0)+1;
          // Additional white impact sparks + float text on first heavy
          // contact within the cooldown window only.
          sparkSystem.emit(eX,.6,eZ,(Math.random()-.5)*.1,.1+Math.random()*.06,(Math.random()-.5)*.1,18,1,1,1,.7);
          floatText('💥 CONTACT!','#ff4400',innerWidth*.5,innerHeight*.45);
          if(player.hitCount===3)showPopup('⚠ DAMAGE!','#ff4400',1000);
          else if(player.hitCount===6)showPopup('🔥 CRITICAL DAMAGE!','#ff2200',1200);
          else showPopup('CONTACT! 💥','#ff4400',500);
          _contactPopupCD=3;
        }
      }else{
        if(_contactPopupCD<=0){showPopup('CONTACT! 💥','#ffcc00',400);_contactPopupCD=3;}
      }
    }
  });
}
