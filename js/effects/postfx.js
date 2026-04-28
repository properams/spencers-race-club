// js/effects/postfx.js — slim hand-rolled bloom post-processing.
// Non-module script, geladen tussen renderer.js en scene.js.
//
// Pipeline (4 passes per frame):
//   1. scene → rtScene  (regular render, tone-mapped + sRGB)
//   2. rtScene → rtBright  (luminance threshold extract, half-res)
//   3. rtBright → rtBlurH → rtBlurV  (separable 9-tap gaussian, half-res)
//   4. rtScene + rtBlurV → canvas  (additive composite)
//
// Auto-disabled on mobile and after _lowQuality kicks in. Mirror-pass and
// car-preview renders blijven directe renderer.render() calls (geen bloom).
//
// Dependencies (script-globals): renderer, THREE.

'use strict';

var _postfx = {
  enabled: false,
  ready: false,
  rtScene: null,
  rtBright: null,
  rtBlurH: null,
  rtBlurV: null,
  matExtract: null,
  matBlur: null,
  matComposite: null,
  quad: null,
  fsScene: null,
  fsCam: null,
  threshold: 0.72,
  strength: 0.78,
  // Cached size to detect resize without redundant setSize calls
  w: 0,
  h: 0
};

function initPostFX(){
  if(!renderer) return;
  // Skip on mobile — extra render passes hurt FPS too much
  if(window._isMobile){_postfx.enabled=false;return;}

  const w = innerWidth, h = innerHeight;
  const halfW = Math.max(2, Math.floor(w/2));
  const halfH = Math.max(2, Math.floor(h/2));

  // r134: encoding on RT controls how the renderer writes into it. We use
  // sRGBEncoding so the first pass output (after ACES tone mapping) lands in
  // the same color space the canvas would receive. Subsequent shaders sample
  // and write linearly — bloom is forgiving about this approximation.
  const rtParams = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    encoding: THREE.sRGBEncoding,
    depthBuffer: true,
    stencilBuffer: false
  };
  const rtParamsHalf = Object.assign({}, rtParams, {depthBuffer:false});

  _postfx.rtScene = new THREE.WebGLRenderTarget(w, h, rtParams);
  _postfx.rtBright = new THREE.WebGLRenderTarget(halfW, halfH, rtParamsHalf);
  _postfx.rtBlurH = new THREE.WebGLRenderTarget(halfW, halfH, rtParamsHalf);
  _postfx.rtBlurV = new THREE.WebGLRenderTarget(halfW, halfH, rtParamsHalf);

  // Bright-pass extraction: keep only pixels above luminance threshold
  _postfx.matExtract = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: {value: null},
      threshold: {value: _postfx.threshold}
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){vUv=uv;gl_Position=vec4(position,1.0);}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float threshold;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec4 c=texture2D(tDiffuse,vUv);',
      '  float lum=dot(c.rgb,vec3(0.299,0.587,0.114));',
      '  float keep=smoothstep(threshold,threshold+0.18,lum);',
      '  gl_FragColor=vec4(c.rgb*keep,1.0);',
      '}'
    ].join('\n'),
    depthWrite: false,
    depthTest: false
  });

  // Separable 9-tap gaussian (direction: (1,0) horizontal, (0,1) vertical)
  _postfx.matBlur = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: {value: null},
      texelSize: {value: new THREE.Vector2(1/halfW, 1/halfH)},
      direction: {value: new THREE.Vector2(1, 0)}
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){vUv=uv;gl_Position=vec4(position,1.0);}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec2 texelSize;',
      'uniform vec2 direction;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 d=texelSize*direction;',
      '  vec3 col=vec3(0.0);',
      '  col+=texture2D(tDiffuse,vUv-d*4.0).rgb*0.0540;',
      '  col+=texture2D(tDiffuse,vUv-d*3.0).rgb*0.0966;',
      '  col+=texture2D(tDiffuse,vUv-d*2.0).rgb*0.1502;',
      '  col+=texture2D(tDiffuse,vUv-d*1.0).rgb*0.1966;',
      '  col+=texture2D(tDiffuse,vUv         ).rgb*0.2057;',
      '  col+=texture2D(tDiffuse,vUv+d*1.0).rgb*0.1966;',
      '  col+=texture2D(tDiffuse,vUv+d*2.0).rgb*0.1502;',
      '  col+=texture2D(tDiffuse,vUv+d*3.0).rgb*0.0966;',
      '  col+=texture2D(tDiffuse,vUv+d*4.0).rgb*0.0540;',
      '  gl_FragColor=vec4(col,1.0);',
      '}'
    ].join('\n'),
    depthWrite: false,
    depthTest: false
  });

  // Composite: scene + bloom * strength + per-world color grading + vignette.
  // Color grading = subtle tint via mix(color, color*tint*1.2, gradeAmount).
  // Vignette = radial darkening op edges (centrum onaangetast, randen tot
  // -25% helderheid). Beide subtiel zodat de scene-look bewaard blijft.
  _postfx.matComposite = new THREE.ShaderMaterial({
    uniforms: {
      tScene: {value: null},
      tBloom: {value: null},
      strength: {value: _postfx.strength},
      tint: {value: new THREE.Vector3(1,1,1)},
      gradeAmount: {value: 0.0},
      vignette: {value: 0.55}
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){vUv=uv;gl_Position=vec4(position,1.0);}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tScene;',
      'uniform sampler2D tBloom;',
      'uniform float strength;',
      'uniform vec3 tint;',
      'uniform float gradeAmount;',
      'uniform float vignette;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec3 sc=texture2D(tScene,vUv).rgb;',
      '  vec3 bl=texture2D(tBloom,vUv).rgb;',
      '  vec3 col=sc+bl*strength;',
      '  // Color grade: subtle tint pull',
      '  vec3 graded=col*tint;',
      '  col=mix(col,graded,gradeAmount);',
      '  // Vignette: radial darkening',
      '  vec2 d=vUv-0.5;',
      '  float r=dot(d,d);', // squared radius (0..0.5)
      '  float vig=1.0-vignette*smoothstep(0.18,0.85,r*4.0);',
      '  col*=vig;',
      '  gl_FragColor=vec4(col,1.0);',
      '}'
    ].join('\n'),
    depthWrite: false,
    depthTest: false
  });

  // Fullscreen quad — clip-space triangles, no projection needed
  const geo = new THREE.PlaneGeometry(2, 2);
  _postfx.quad = new THREE.Mesh(geo, _postfx.matExtract);
  _postfx.fsScene = new THREE.Scene();
  _postfx.fsScene.add(_postfx.quad);
  _postfx.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  _postfx.w = w; _postfx.h = h;
  _postfx.enabled = true;
  _postfx.ready = true;
  _applyFxPreference();
}

// Day/night bloom tuning — at night we use a slightly lower threshold so
// neon/emissive props bloom more dramatically; by day we keep bloom subtle
// so highlights don't blow out the sky. Per-world multipliers below let
// pastel/dense-emissive worlds (Candy, Themepark) get less bleed without
// dimming Neon City's intentional neon aesthetic.
let _bloomWorldStrengthMul = 1.0;
const _BLOOM_WORLD_MUL = {
  candy:    0.55,   // 44 lollipops + 22 candles + 48 lampposts = bloom flood
  themepark:0.70,   // sunset + ride lights stack
  arctic:   0.75,   // bright snow ground reflects bloom
  grandprix:0.85,   // grass is fine; only curb lights bloom
  neoncity: 1.00,   // intentionally heavy bloom — neon look
  volcano:  1.00,   // lava emissives are the show
  space:    1.00,   // deliberate cosmic bloom
  deepsea:  0.85    // bioluminescence subtle
};
function setBloomDayNight(dark){
  if(!_postfx.ready) return;
  if(dark){
    _postfx.threshold = 0.74;
    _postfx.strength = 0.78 * _bloomWorldStrengthMul;
  } else {
    _postfx.threshold = 0.80;
    _postfx.strength = 0.66 * _bloomWorldStrengthMul;
  }
  _postfx.matExtract.uniforms.threshold.value = _postfx.threshold;
  _postfx.matComposite.uniforms.strength.value = _postfx.strength;
}
function setBloomWorld(world){
  _bloomWorldStrengthMul = _BLOOM_WORLD_MUL[world] || 1.0;
  // Re-apply current day/night to pick up the new multiplier.
  if(_postfx.ready) setBloomDayNight(typeof isDark!=='undefined' && isDark);
}

// User-toggleable quality: when localStorage('src_fx')==='0', skip alle
// postfx passes en val terug op directe renderer.render(). Persistent
// over reloads. Aangeroepen vanuit pauseOverlay button.
function toggleQuality(){
  if(!_postfx.ready){
    // Mobile heeft postfx nooit ge-init — toggle is dan no-op maar update label
    const b=document.getElementById('btnFxToggle');
    if(b)b.textContent='✨ FX N/A';
    return;
  }
  _postfx.enabled = !_postfx.enabled;
  try{localStorage.setItem('src_fx', _postfx.enabled?'1':'0');}catch(e){}
  const b=document.getElementById('btnFxToggle');
  if(b)b.textContent=_postfx.enabled?'✨ FX ON':'✨ FX OFF';
}
// Apply persisted preference at startup. Called vanuit initPostFX zodra
// _postfx.ready is.
function _applyFxPreference(){
  try{
    const v=localStorage.getItem('src_fx');
    if(v==='0')_postfx.enabled=false;
  }catch(e){}
  const b=document.getElementById('btnFxToggle');
  if(b)b.textContent=_postfx.enabled?'✨ FX ON':'✨ FX OFF';
}

// Per-world color grading + vignette. Tints zijn subtle (gradeAmount 0.10-
// 0.18) zodat de wereldkleuren blijven "kloppen" maar er een herkenbare
// cinematic-feel ontstaat. Vignette uniform tussen 0.45-0.65 per wereld.
function setWorldGrading(world){
  if(!_postfx.ready) return;
  // [tint_r, tint_g, tint_b, gradeAmount, vignette]
  const cfg = {
    space:     [0.85, 0.92, 1.15, 0.16, 0.55],
    deepsea:   [0.80, 1.05, 1.10, 0.18, 0.65],
    candy:     [1.15, 0.95, 1.05, 0.10, 0.45],
    neoncity:  [1.05, 0.85, 1.15, 0.18, 0.60],
    volcano:   [1.20, 0.92, 0.78, 0.16, 0.55],
    arctic:    [0.92, 1.00, 1.18, 0.14, 0.50],
    themepark: [1.18, 0.92, 1.05, 0.14, 0.55],
    grandprix: [1.05, 1.00, 0.95, 0.08, 0.45]
  }[world] || [1,1,1, 0.0, 0.45];
  _postfx.matComposite.uniforms.tint.value.set(cfg[0], cfg[1], cfg[2]);
  _postfx.matComposite.uniforms.gradeAmount.value = cfg[3];
  _postfx.matComposite.uniforms.vignette.value = cfg[4];
}

function resizePostFX(){
  if(!_postfx.ready) return;
  const w = innerWidth, h = innerHeight;
  if(w === _postfx.w && h === _postfx.h) return;
  const halfW = Math.max(2, Math.floor(w/2));
  const halfH = Math.max(2, Math.floor(h/2));
  _postfx.rtScene.setSize(w, h);
  _postfx.rtBright.setSize(halfW, halfH);
  _postfx.rtBlurH.setSize(halfW, halfH);
  _postfx.rtBlurV.setSize(halfW, halfH);
  _postfx.matBlur.uniforms.texelSize.value.set(1/halfW, 1/halfH);
  _postfx.w = w; _postfx.h = h;
}

// Render scene with bloom. Falls back to direct render when disabled,
// when low-quality auto-detect kicked in, or when post-fx isn't ready yet.
function renderWithPostFX(scn, cam){
  if(!_postfx.enabled || !_postfx.ready || window._lowQuality){
    renderer.render(scn, cam);
    return;
  }
  resizePostFX();

  // Pass 1: scene → rtScene
  renderer.setRenderTarget(_postfx.rtScene);
  renderer.render(scn, cam);

  // Pass 2: bright extract → rtBright
  _postfx.quad.material = _postfx.matExtract;
  _postfx.matExtract.uniforms.tDiffuse.value = _postfx.rtScene.texture;
  renderer.setRenderTarget(_postfx.rtBright);
  renderer.render(_postfx.fsScene, _postfx.fsCam);

  // Pass 3a: blur horizontal → rtBlurH
  _postfx.quad.material = _postfx.matBlur;
  _postfx.matBlur.uniforms.tDiffuse.value = _postfx.rtBright.texture;
  _postfx.matBlur.uniforms.direction.value.set(1, 0);
  renderer.setRenderTarget(_postfx.rtBlurH);
  renderer.render(_postfx.fsScene, _postfx.fsCam);

  // Pass 3b: blur vertical → rtBlurV
  _postfx.matBlur.uniforms.tDiffuse.value = _postfx.rtBlurH.texture;
  _postfx.matBlur.uniforms.direction.value.set(0, 1);
  renderer.setRenderTarget(_postfx.rtBlurV);
  renderer.render(_postfx.fsScene, _postfx.fsCam);

  // Pass 4: composite to canvas
  _postfx.quad.material = _postfx.matComposite;
  _postfx.matComposite.uniforms.tScene.value = _postfx.rtScene.texture;
  _postfx.matComposite.uniforms.tBloom.value = _postfx.rtBlurV.texture;
  renderer.setRenderTarget(null);
  renderer.render(_postfx.fsScene, _postfx.fsCam);
}
