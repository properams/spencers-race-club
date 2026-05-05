// js/effects/proc-textures.js — procedural canvas-texture generator library.
// Non-module script. Loaded between renderer.js and any world-builder so
// world-builders can call window.ProcTextures.* during buildScene().
//
// All generators:
//   - return a THREE.CanvasTexture with mipmap/anisotropy/colorSpace set
//     for PBR pipelines (sRGB, mipmap, anisotropy 4 desktop / 2 mobile)
//   - mobile auto-halves canvas resolution (window._isMobile)
//   - participate in a bounded LRU cache (60 entries / generator) keyed on
//     stringified opts + a small structured key-builder (NOT JSON.stringify
//     which is fragile against object-key-ordering)
//   - cache eviction calls .dispose() on the evicted texture
//   - disposeAll() empties every cache and disposes every cached texture —
//     wired from disposeScene('sandstorm') for clean world-switch
//
// Pilot consumer: js/worlds/sandstorm.js. Other worlds will adopt this in
// a future rollout phase; until then, leaving their inline canvas-funcs
// alone is intentional.

'use strict';

(function(){
  const _PROC_LRU_MAX = 60;
  const _MOBILE = () => !!window._isMobile;
  // Three.js compat: r160 SRGBColorSpace; older builds export differently.
  const _SRGB = (typeof THREE!=='undefined' && THREE.SRGBColorSpace) ? THREE.SRGBColorSpace : null;

  // ── LRU cache + key-builder ────────────────────────────────────────────

  // key-builder: deterministic serialization with sorted keys (recursive)
  // so the same opts in different shape produce the same cache hit.
  // Implementation: JSON.stringify with a replacer that returns nested
  // objects with sorted keys. This avoids the delimiter-collision class
  // that a custom string-concat builder is prone to (a value containing
  // `:` or `|` would have hashed identically to a different opts shape).
  function _keyOf(opts){
    if(opts==null) return '~null';
    if(typeof opts!=='object') return JSON.stringify(opts);
    return JSON.stringify(opts, function(key, value){
      if(value && typeof value==='object' && !Array.isArray(value)){
        const sorted={};
        Object.keys(value).sort().forEach(k=>{ sorted[k]=value[k]; });
        return sorted;
      }
      return value;
    });
  }

  // Per-generator LRU. Map preserves insertion order — re-set on hit to
  // bump-to-most-recent. Eviction: shift first key, dispose its texture.
  function _makeCache(){
    const m=new Map();
    return {
      get(k){
        if(!m.has(k))return null;
        const v=m.get(k);
        m.delete(k);m.set(k,v); // bump
        return v;
      },
      set(k,v){
        m.set(k,v);
        while(m.size>_PROC_LRU_MAX){
          const oldKey=m.keys().next().value;
          const oldTex=m.get(oldKey);
          m.delete(oldKey);
          if(oldTex&&typeof oldTex.dispose==='function')oldTex.dispose();
        }
      },
      size(){ return m.size; },
      disposeAll(){
        m.forEach(tex=>{ if(tex&&typeof tex.dispose==='function'){try{tex.dispose();}catch(_){}}});
        m.clear();
      }
    };
  }

  // Per-generator caches.
  const _caches = {
    weatheredStone: _makeCache(),
    rockStrata:     _makeCache(),
    sandSurface:    _makeCache(),
    palmLeaf:       _makeCache(),  // stores { texture, alphaMap } pair
    stripedFabric:  _makeCache(),
    pseudoGlyphs:   _makeCache(),
    bark:           _makeCache(),
    bakedAO:        _makeCache(),
  };

  // Texture finalisation — applied to every CanvasTexture before it leaves
  // the generator. PBR + ACES pipeline expects sRGB-tagged maps.
  function _finalize(tex){
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    if(_SRGB) tex.colorSpace = _SRGB;
    // Anisotropy: read from renderer if available (caller may not have
    // initRenderer'd yet during boot-time tests — use a sane fallback).
    const aniMax = (window.renderer && window.renderer.capabilities)
      ? window.renderer.capabilities.getMaxAnisotropy() : 4;
    tex.anisotropy = Math.min(aniMax, _MOBILE()?2:4);
    tex.needsUpdate = true;
    return tex;
  }

  // Canvas-pixel size: spec'd `size` is the desktop value; mobile halves it
  // (clamped to 64 minimum to keep mipmap chain valid).
  function _sizeFor(opts, dflt){
    const s = (opts&&opts.size)||dflt;
    return _MOBILE() ? Math.max(64, s>>1) : s;
  }

  // Canvas helper — common boilerplate.
  function _canvas(w,h){
    const c=document.createElement('canvas');
    c.width=w; c.height=h;
    return c;
  }

  // ── 1. weatheredStone — sphinx, pilaren, obelisken, generic stone ─────
  function weatheredStone(opts){
    opts=opts||{};
    const cached=_caches.weatheredStone.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,256);
    const baseColor=opts.baseColor||'#b89370';
    const crackColor=opts.crackColor||'#3a2418';
    const crackCount=opts.crackCount!=null?opts.crackCount:8;
    const ageWear=opts.ageWear!=null?opts.ageWear:0.5; // 0..1
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    // Base + grain noise
    g.fillStyle=baseColor; g.fillRect(0,0,S,S);
    const id=g.getImageData(0,0,S,S),d=id.data;
    for(let i=0;i<d.length;i+=4){
      const n=Math.random()*40-20|0;
      d[i]  =Math.max(0,Math.min(255,d[i]+n));
      d[i+1]=Math.max(0,Math.min(255,d[i+1]+(n*0.85|0)));
      d[i+2]=Math.max(0,Math.min(255,d[i+2]+(n*0.6|0)));
    }
    g.putImageData(id,0,0);
    // Crack lines — random walkers
    g.strokeStyle=crackColor;
    g.lineWidth=1+Math.random()*0.5;
    for(let i=0;i<crackCount;i++){
      g.beginPath();
      let x=Math.random()*S, y=Math.random()*S;
      g.moveTo(x,y);
      for(let j=0;j<5;j++){
        x+=(Math.random()-0.3)*30;
        y+=(Math.random()-0.5)*30;
        g.lineTo(x,y);
      }
      g.stroke();
    }
    // Subtle AO darkening on random spots — simulates baked occlusion
    // around weathered crevices. Strength gated by ageWear.
    const aoCount=(8+Math.random()*12)|0;
    for(let i=0;i<aoCount;i++){
      const x=Math.random()*S, y=Math.random()*S, r=10+Math.random()*30;
      const grd=g.createRadialGradient(x,y,0,x,y,r);
      grd.addColorStop(0, 'rgba(0,0,0,'+(0.18*ageWear).toFixed(3)+')');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle=grd; g.fillRect(x-r,y-r,r*2,r*2);
    }
    // Vertical fluting (subtle, every ~32px) — works for pilaar shafts
    if(opts.flutes){
      const step=Math.max(8, S>>3);
      for(let x=0;x<S;x+=step){
        g.fillStyle='rgba(40,25,15,0.20)';
        g.fillRect(x,0,1+(S>>7),S);
      }
    }
    const tex=new THREE.CanvasTexture(c);
    tex.repeat.set(opts.repeatX||1, opts.repeatY||1);
    _finalize(tex);
    _caches.weatheredStone.set(_keyOf(opts), tex);
    return tex;
  }

  // ── 2. rockStrata — cliff & mesa horizontal layers ────────────────────
  function rockStrata(opts){
    opts=opts||{};
    const cached=_caches.rockStrata.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,256);
    const bandCount=opts.bandCount||5;
    const baseColor=opts.baseColor||'#a86839';
    const stratColors=opts.stratColors||['#7a3a1d','#a8643a','#8b4a25','#b87850','#cf8e60'];
    const ageWear=opts.ageWear!=null?opts.ageWear:0.4;
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    g.fillStyle=baseColor; g.fillRect(0,0,S,S);
    // Horizontal bands, sub-pixel jitter on each band-line so strata
    // don't read as ruler-straight.
    const bandH=S/bandCount;
    for(let b=0;b<bandCount;b++){
      const col=stratColors[b%stratColors.length];
      const yTop=b*bandH;
      g.fillStyle=col;
      // Wavy top-edge for organic feel
      g.beginPath();
      g.moveTo(0,yTop);
      for(let x=0;x<=S;x+=4){
        g.lineTo(x, yTop+Math.sin(x*0.05+b*1.7)*1.5);
      }
      g.lineTo(S,yTop+bandH); g.lineTo(0,yTop+bandH);
      g.closePath(); g.fill();
    }
    // Pixel grain
    const id=g.getImageData(0,0,S,S),d=id.data;
    for(let i=0;i<d.length;i+=4){
      const n=Math.random()*30-15|0;
      d[i]  =Math.max(0,Math.min(255,d[i]+n));
      d[i+1]=Math.max(0,Math.min(255,d[i+1]+(n*0.9|0)));
      d[i+2]=Math.max(0,Math.min(255,d[i+2]+(n*0.7|0)));
    }
    g.putImageData(id,0,0);
    // Crack lines + age stains
    g.strokeStyle='rgba(30,15,8,0.55)';
    g.lineWidth=1;
    for(let i=0;i<6+ageWear*8;i++){
      g.beginPath();
      let x=Math.random()*S, y=Math.random()*S;
      g.moveTo(x,y);
      for(let j=0;j<4;j++){
        x+=(Math.random()-0.3)*25;
        y+=(Math.random()-0.5)*15;
        g.lineTo(x,y);
      }
      g.stroke();
    }
    const tex=new THREE.CanvasTexture(c);
    tex.repeat.set(opts.repeatX||1, opts.repeatY||1);
    _finalize(tex);
    _caches.rockStrata.set(_keyOf(opts), tex);
    return tex;
  }

  // ── 3. sandSurface — ground + dunes ───────────────────────────────────
  function sandSurface(opts){
    opts=opts||{};
    const cached=_caches.sandSurface.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,256);
    const baseColor=opts.baseColor||'#d4a55a';
    const rippleCount=opts.rippleCount!=null?opts.rippleCount:60;
    const rippleAngle=opts.rippleAngle!=null?opts.rippleAngle:0; // radians
    const pebbleCount=opts.pebbleCount!=null?opts.pebbleCount:18;
    const edgeWear=opts.edgeWear!=null?opts.edgeWear:0;
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    g.fillStyle=baseColor; g.fillRect(0,0,S,S);
    // Pixel noise (warm sand)
    const id=g.getImageData(0,0,S,S),d=id.data;
    for(let i=0;i<d.length;i+=4){
      const n=Math.random()*45-22|0;
      d[i]  =Math.max(0,Math.min(255,d[i]+n));
      d[i+1]=Math.max(0,Math.min(255,d[i+1]+(n*0.85|0)));
      d[i+2]=Math.max(0,Math.min(255,d[i+2]+(n*0.55|0)));
    }
    g.putImageData(id,0,0);
    // Wind-aligned ripples — rotate the canvas around center, draw
    // horizontal lines, restore. Avoids per-line trig.
    g.save();
    g.translate(S*0.5, S*0.5);
    g.rotate(rippleAngle);
    g.translate(-S*0.5, -S*0.5);
    for(let r=0;r<rippleCount;r++){
      const y=r*(S/rippleCount)+Math.sin(r*0.3)*1.5;
      const dark = r%3===0;
      g.fillStyle = dark ? 'rgba(135,98,55,0.30)' : 'rgba(210,170,120,0.20)';
      g.fillRect(-S, y, S*3, 1.4);
    }
    g.restore();
    // Pebbles (small darker dots scattered)
    for(let i=0;i<pebbleCount;i++){
      const x=Math.random()*S, y=Math.random()*S, r=0.8+Math.random()*1.6;
      g.fillStyle='rgba(70,50,30,0.55)';
      g.beginPath(); g.ellipse(x,y,r,r*(0.7+Math.random()*0.6),0,0,Math.PI*2); g.fill();
    }
    // Optional track-edge wear band: a darker strip along Y=center
    // (simulates car-side compaction). Used by ground-near-track variant.
    if(edgeWear>0.01){
      const grd=g.createLinearGradient(0,S*0.4,0,S*0.6);
      grd.addColorStop(0,'rgba(0,0,0,0)');
      grd.addColorStop(0.5,'rgba(0,0,0,'+(0.22*edgeWear)+')');
      grd.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=grd; g.fillRect(0,S*0.4,S,S*0.2);
    }
    const tex=new THREE.CanvasTexture(c);
    tex.repeat.set(opts.repeatX||4, opts.repeatY||4);
    _finalize(tex);
    _caches.sandSurface.set(_keyOf(opts), tex);
    return tex;
  }

  // ── 4. palmLeaf — alpha-shape texture + alpha-mask ────────────────────
  // Returns { texture, alphaMap } pair so caller can use Lambert + alphaTest
  // on the leaf material.
  //
  // NOTE: this generator does NOT call _finalize() on its outputs — anisotropy
  // is set explicitly to 4 (no mobile-halve) and wrapping is ClampToEdge (not
  // Repeat). Reason: a palm-leaf texture should never tile across an entire
  // mesh, and lower anisotropy on the alpha-mask hurts edge crispness. The
  // wrapper exposes a `dispose` method that disposes BOTH the texture and the
  // alphaMap so LRU eviction and `disposeAll()` both work via the standard
  // `tex.dispose()` path.
  function palmLeaf(opts){
    opts=opts||{};
    const cached=_caches.palmLeaf.get(_keyOf(opts));
    if(cached)return cached;
    const W=_MOBILE()?64:128, H=_MOBILE()?32:64;
    // 1) Color canvas — leaf with midrib + segments
    const cc=_canvas(W,H), cg=cc.getContext('2d');
    cg.clearRect(0,0,W,H);
    // Leaf-shape silhouette: smal aan basis, breed in midden, taps naar punt
    cg.fillStyle = opts.darkColor || '#2c4818';
    cg.beginPath();
    cg.moveTo(0,H*0.5);
    for(let i=1;i<=20;i++){
      const x=i*W/20;
      const taper=Math.sin((i/20)*Math.PI);
      const y=H*0.5 - taper*H*0.40;
      cg.lineTo(x,y);
    }
    for(let i=20;i>=0;i--){
      const x=i*W/20;
      const taper=Math.sin((i/20)*Math.PI);
      const y=H*0.5 + taper*H*0.40;
      cg.lineTo(x,y);
    }
    cg.closePath(); cg.fill();
    // Midrib (lighter green spine)
    cg.fillStyle = opts.midribColor || '#5a8a28';
    cg.fillRect(0, H*0.5-1, W, 2);
    // Leaflet ribs — alternating highlight/shadow tones
    cg.lineWidth = 1.5;
    const segCount = 14;
    for(let i=0;i<segCount;i++){
      const x = 4 + i*(W-8)/(segCount-1);
      const taper = Math.sin((i/(segCount-1))*Math.PI);
      const lf = (H*0.40)*taper;
      cg.strokeStyle = opts.lightColor || '#86b540';
      cg.beginPath(); cg.moveTo(x,H*0.5); cg.lineTo(x-2,H*0.5-lf); cg.stroke();
      cg.strokeStyle = opts.darkColor || '#3a5a18';
      cg.beginPath(); cg.moveTo(x,H*0.5); cg.lineTo(x-2,H*0.5+lf); cg.stroke();
    }
    // 2) Alpha mask — same silhouette in pure white on black
    const ac=_canvas(W,H), ag=ac.getContext('2d');
    ag.fillStyle='#000'; ag.fillRect(0,0,W,H);
    ag.fillStyle='#fff';
    ag.beginPath();
    ag.moveTo(0,H*0.5);
    for(let i=1;i<=20;i++){
      const x=i*W/20;
      const taper=Math.sin((i/20)*Math.PI);
      ag.lineTo(x, H*0.5 - taper*H*0.40);
    }
    for(let i=20;i>=0;i--){
      const x=i*W/20;
      const taper=Math.sin((i/20)*Math.PI);
      ag.lineTo(x, H*0.5 + taper*H*0.40);
    }
    ag.closePath(); ag.fill();
    const texture=new THREE.CanvasTexture(cc);
    const alphaMap=new THREE.CanvasTexture(ac);
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    alphaMap.wrapS=alphaMap.wrapT=THREE.ClampToEdgeWrapping;
    if(_SRGB) texture.colorSpace=_SRGB;
    // alphaMap stays linear (intensity-only); leave colorSpace default.
    texture.minFilter=alphaMap.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=alphaMap.magFilter=THREE.LinearFilter;
    texture.needsUpdate=alphaMap.needsUpdate=true;
    const result={ texture, alphaMap };
    // Cache stores the pair; disposeAll iterates and disposes each.
    // Override dispose on the wrapper so cache LRU eviction works:
    result.dispose=function(){ try{texture.dispose();}catch(_){} try{alphaMap.dispose();}catch(_){} };
    _caches.palmLeaf.set(_keyOf(opts), result);
    return result;
  }

  // ── 5. stripedFabric — Bedouin tent canvas, rust/cream/sand stripes ──
  function stripedFabric(opts){
    opts=opts||{};
    const cached=_caches.stripedFabric.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,128);
    const stripeCount=opts.stripeCount||8;
    const colors=opts.colors||['#a83a25','#d4b890','#7a4a25'];
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    const stripeH=S/stripeCount;
    for(let i=0;i<stripeCount;i++){
      g.fillStyle=colors[i%colors.length];
      g.fillRect(0,i*stripeH,S,Math.ceil(stripeH));
    }
    // Subtle weave-noise overlay
    const id=g.getImageData(0,0,S,S),d=id.data;
    for(let i=0;i<d.length;i+=4){
      const n=(Math.random()-0.5)*30|0;
      d[i]=Math.max(0,Math.min(255,d[i]+n));
      d[i+1]=Math.max(0,Math.min(255,d[i+1]+n));
      d[i+2]=Math.max(0,Math.min(255,d[i+2]+n));
    }
    g.putImageData(id,0,0);
    const tex=new THREE.CanvasTexture(c);
    tex.repeat.set(opts.repeatX||1, opts.repeatY||1);
    _finalize(tex);
    _caches.stripedFabric.set(_keyOf(opts), tex);
    return tex;
  }

  // ── 6. pseudoGlyphs — non-readable hieroglyph-like markings ──────────
  function pseudoGlyphs(opts){
    opts=opts||{};
    const cached=_caches.pseudoGlyphs.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,256);
    const rowCount=opts.rowCount||5;
    const glyphsPerRow=opts.glyphsPerRow||4;
    const baseColor=opts.baseColor||'#b89370';
    const glyphColor=opts.glyphColor||'#3a2418';
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    g.fillStyle=baseColor; g.fillRect(0,0,S,S);
    // Grain underlay so glyphs don't sit on a flat base
    const id=g.getImageData(0,0,S,S),d=id.data;
    for(let i=0;i<d.length;i+=4){
      const n=Math.random()*22-11|0;
      d[i]=Math.max(0,Math.min(255,d[i]+n));
      d[i+1]=Math.max(0,Math.min(255,d[i+1]+(n*0.8|0)));
      d[i+2]=Math.max(0,Math.min(255,d[i+2]+(n*0.6|0)));
    }
    g.putImageData(id,0,0);
    g.fillStyle=glyphColor;
    g.strokeStyle=glyphColor;
    const rowH=S/rowCount;
    const colW=S/glyphsPerRow;
    for(let r=0;r<rowCount;r++){
      for(let c2=0;c2<glyphsPerRow;c2++){
        const cx=c2*colW+colW*0.5;
        const cy=r*rowH+rowH*0.5;
        // Each "glyph" is a small composition of 2-3 primitives
        const variant=(r*7+c2*3)%5;
        g.lineWidth=1.5;
        switch(variant){
          case 0: // ankh-like cross
            g.fillRect(cx-1, cy-rowH*0.25, 2, rowH*0.5);
            g.fillRect(cx-rowH*0.18, cy-1, rowH*0.36, 2);
            g.beginPath(); g.arc(cx, cy-rowH*0.30, rowH*0.10, 0, Math.PI*2); g.stroke();
            break;
          case 1: // bird-silhouette suggestion
            g.fillRect(cx-rowH*0.20, cy, rowH*0.40, 2);
            g.fillRect(cx-2, cy-rowH*0.10, 4, rowH*0.20);
            break;
          case 2: // sun-disc
            g.beginPath(); g.arc(cx,cy,rowH*0.18,0,Math.PI*2); g.fill();
            g.fillStyle=baseColor;
            g.beginPath(); g.arc(cx,cy,rowH*0.10,0,Math.PI*2); g.fill();
            g.fillStyle=glyphColor;
            break;
          case 3: // staff-with-curve
            g.fillRect(cx-1, cy-rowH*0.30, 2, rowH*0.60);
            g.beginPath(); g.arc(cx+rowH*0.10, cy-rowH*0.25, rowH*0.10, 0, Math.PI); g.stroke();
            break;
          default: // 4: zigzag (water/ribbon)
            g.beginPath();
            g.moveTo(cx-rowH*0.20, cy-rowH*0.10);
            g.lineTo(cx-rowH*0.05, cy+rowH*0.10);
            g.lineTo(cx+rowH*0.10, cy-rowH*0.10);
            g.lineTo(cx+rowH*0.20, cy+rowH*0.10);
            g.stroke();
        }
      }
    }
    const tex=new THREE.CanvasTexture(c);
    tex.repeat.set(opts.repeatX||1, opts.repeatY||1);
    _finalize(tex);
    _caches.pseudoGlyphs.set(_keyOf(opts), tex);
    return tex;
  }

  // ── 7. bark — palm-trunk horizontal rings + grain ────────────────────
  function bark(opts){
    opts=opts||{};
    const cached=_caches.bark.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,128);
    const baseColor=opts.baseColor||'#6e4520';
    const ringColor=opts.ringColor||'#8b5a2b';
    const ringCount=opts.ringCount||14;
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    g.fillStyle=baseColor; g.fillRect(0,0,S,S);
    // Horizontal rings — palm-trunk segments
    const ringStep=S/ringCount;
    for(let i=0;i<ringCount;i++){
      const y=i*ringStep + Math.sin(i*1.3)*1.5;
      // Darker shadow under the lip of each ring
      g.fillStyle='rgba(40,22,8,0.45)';
      g.fillRect(0, y, S, 1);
      g.fillStyle=ringColor;
      g.fillRect(0, y+1.5, S, 1);
    }
    // Vertical grain (darker streaks)
    g.strokeStyle='rgba(40,22,8,0.22)';
    g.lineWidth=1;
    for(let i=0;i<8;i++){
      const x=Math.random()*S;
      g.beginPath(); g.moveTo(x,0); g.lineTo(x+(Math.random()-0.5)*4, S); g.stroke();
    }
    const tex=new THREE.CanvasTexture(c);
    tex.repeat.set(opts.repeatX||1, opts.repeatY||1);
    _finalize(tex);
    _caches.bark.set(_keyOf(opts), tex);
    return tex;
  }

  // ── 8. bakedAO — gradient overlay (transparent top → dark bottom) ────
  // Used as second map on materials that need fake AO under the prop
  // (sphinx-poten waar lichaam aansluit, pilaar-base, dune-onderkant).
  // The texture goes into material.aoMap; UV2 must equal UV1 on the mesh.
  function bakedAO(opts){
    opts=opts||{};
    const cached=_caches.bakedAO.get(_keyOf(opts));
    if(cached)return cached;
    const S=_sizeFor(opts,128);
    const strength=opts.strength!=null?opts.strength:0.6;
    const direction=opts.direction||'bottom'; // 'bottom' | 'top' | 'corners'
    const c=_canvas(S,S);
    const g=c.getContext('2d');
    g.fillStyle='#ffffff'; g.fillRect(0,0,S,S);
    if(direction==='bottom'){
      const v=Math.round((1-strength)*255);
      const grd=g.createLinearGradient(0,0,0,S);
      grd.addColorStop(0,'rgba(255,255,255,1)');
      grd.addColorStop(1,'rgba('+v+','+v+','+v+',1)');
      g.fillStyle=grd; g.fillRect(0,0,S,S);
    }else if(direction==='top'){
      const v=Math.round((1-strength)*255);
      const grd=g.createLinearGradient(0,0,0,S);
      grd.addColorStop(0,'rgba('+v+','+v+','+v+',1)');
      grd.addColorStop(1,'rgba(255,255,255,1)');
      g.fillStyle=grd; g.fillRect(0,0,S,S);
    }else{ // corners — radial darkening at all 4 corners
      const v=Math.round((1-strength)*255);
      g.fillStyle='#ffffff'; g.fillRect(0,0,S,S);
      [[0,0],[S,0],[0,S],[S,S]].forEach(([cx,cy])=>{
        const rg=g.createRadialGradient(cx,cy,0,cx,cy,S*0.5);
        rg.addColorStop(0,'rgba('+v+','+v+','+v+',1)');
        rg.addColorStop(1,'rgba(255,255,255,0)');
        g.fillStyle=rg; g.fillRect(0,0,S,S);
      });
    }
    const tex=new THREE.CanvasTexture(c);
    tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    // aoMap is intensity-only; do NOT tag colorSpace so it's read linearly.
    tex.minFilter=THREE.LinearMipmapLinearFilter;
    tex.magFilter=THREE.LinearFilter;
    tex.needsUpdate=true;
    _caches.bakedAO.set(_keyOf(opts), tex);
    return tex;
  }

  // ── disposeAll — wired from disposeScene('sandstorm') ────────────────
  function disposeAll(){
    Object.keys(_caches).forEach(k=>_caches[k].disposeAll());
    if(window.dbg) dbg.log('proc-textures', 'disposeAll — all generator caches cleared');
  }

  // ── Debug snapshot ───────────────────────────────────────────────────
  // Returns a per-generator count of currently-cached textures. Useful in
  // browser console (`ProcTextures._debug()`) to confirm cache eviction
  // working under load.
  function _debug(){
    const out={};
    Object.keys(_caches).forEach(k=>{
      out[k]=_caches[k].size();
    });
    return out;
  }

  window.ProcTextures = {
    weatheredStone, rockStrata, sandSurface, palmLeaf,
    stripedFabric, pseudoGlyphs, bark, bakedAO,
    disposeAll, _debug
  };
})();
