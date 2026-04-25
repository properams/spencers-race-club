// js/effects/particles.js — generieke point-cloud particle system.
// Non-module script. Class is global voor consumers (track/environment.js
// en de loop in core/loop.js die sparkSystem/exhaustSystem update).

'use strict';

class SimpleParticles{
  constructor(maxP,scene){
    this.max=maxP;this.alive=[];
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(maxP*3);
    const col=new Float32Array(maxP*3);
    const sz=new Float32Array(maxP);
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    geo.setAttribute('size',new THREE.BufferAttribute(sz,1));
    this.mat=new THREE.PointsMaterial({size:.6,vertexColors:true,transparent:true,opacity:.85,sizeAttenuation:true});
    this.pts=new THREE.Points(geo,this.mat);
    scene.add(this.pts);this.geo=geo;
  }
  emit(x,y,z,vx,vy,vz,n,r,g,b,life=.6){
    for(let i=0;i<n&&this.alive.length<this.max;i++){
      this.alive.push({x,y,z,vx:vx+(Math.random()-.5)*.15,vy:vy+Math.random()*.1,vz:vz+(Math.random()-.5)*.15,r,g,b,life,maxL:life});
    }
  }
  update(dt){
    const pos=this.geo.attributes.position.array;
    const col=this.geo.attributes.color.array;
    const sz=this.geo.attributes.size.array;
    // In-place removal: swap dead particles to end, no new array allocation
    let n=this.alive.length;
    for(let i=n-1;i>=0;i--){
      const p=this.alive[i];
      p.life-=dt/p.maxL;
      if(p.life<=0){
        // Swap with last alive entry (O(1) removal, no array allocation)
        const swapIdx=--n;
        this.alive[i]=this.alive[swapIdx];this.alive.length=n;
        // Zero GPU slot i (dead) and slot swapIdx (now orphaned)
        pos[i*3]=pos[i*3+1]=pos[i*3+2]=0;sz[i]=0;col[i*3]=col[i*3+1]=col[i*3+2]=0;
        pos[swapIdx*3]=pos[swapIdx*3+1]=pos[swapIdx*3+2]=0;sz[swapIdx]=0;col[swapIdx*3]=col[swapIdx*3+1]=col[swapIdx*3+2]=0;
      }else{
        p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;p.vy-=.008;
        pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;
        sz[i]=p.life*.7;
        col[i*3]=p.r;col[i*3+1]=p.g;col[i*3+2]=p.b;
      }
    }
    if(n===0&&this.alive.length===0)return; // nothing to upload
    this.geo.attributes.position.needsUpdate=true;
    this.geo.attributes.color.needsUpdate=true;
    this.geo.attributes.size.needsUpdate=true;
  }
}
