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
  threshold: 0.62,
  strength: 0.95,
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

  // Composite: scene + bloom * strength
  _postfx.matComposite = new THREE.ShaderMaterial({
    uniforms: {
      tScene: {value: null},
      tBloom: {value: null},
      strength: {value: _postfx.strength}
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){vUv=uv;gl_Position=vec4(position,1.0);}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tScene;',
      'uniform sampler2D tBloom;',
      'uniform float strength;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec3 sc=texture2D(tScene,vUv).rgb;',
      '  vec3 bl=texture2D(tBloom,vUv).rgb;',
      '  gl_FragColor=vec4(sc+bl*strength,1.0);',
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
