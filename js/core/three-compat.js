// js/core/three-compat.js — Three.js cross-revision compat-laag.
// Non-module script. Geladen vóór alle andere subsystemen die THREE gebruiken
// (na core/debug.js, vóór core/renderer.js).
//
// PROBLEEMSTELLING (van fase 5 rollback in commit 2989b1f):
//   Upgrade r134 → r160 maakte de scene donker / camera uit-gezoomd / pause
//   overlay brak. Geen gestructureerde logging beschikbaar → root cause niet
//   te isoleren. Rollback was de enige optie.
//
// AANPAK:
//   Deze module bevat helpers die op zowel r134 als r150+ correct werken.
//   Op r134 is alle gedrag IDENTIEK (no-ops behalve outputEncoding-binding).
//   Op r150+ activeren de shims:
//     - outputColorSpace ipv deprecated/removed outputEncoding
//     - useLegacyLights=true (r155 maakte fysiek-correcte verlichting default
//       zonder unit-conversie → bestaande intensity-waarden zijn factor 4-10
//       te donker met physicallyCorrectLights)
//     - ColorManagement.enabled=false (r152 default true → texture-kleuren
//       schuiven; uit zetten geeft pixel-exact output zoals r134)
//
// USAGE:
//   In core/renderer.js, vervang:
//     renderer.outputEncoding=THREE.sRGBEncoding;
//   door:
//     ThreeCompat.applyRendererColorSpace(renderer);
//
// MIGRATION-CHECKLIST bij echte r160-upgrade (niet in deze commit):
//   1. Vervang inline three.js minified-blok in index.html (regels 325-…)
//      met r160-build. Update ook line range comment in deze file.
//   2. Test op http(s):// (niet file://) — sommige r150+ features eisen CORS.
//   3. Activeer dbg-harness (localStorage src_debug='1') vóór herlaad.
//   4. Verifieer in console: "[boot] start", "[renderer] init done — THREE 160".
//   5. Verifieer: "[scene] buildScene done — world=grandprix objects=N".
//   6. Visueel: lighting-intensiteit identiek aan r134 baseline (vergelijk
//      screenshot van titel-scene). Als donkerder → useLegacyLights wordt
//      niet toegepast; check ThreeCompat.appliedFlags.
//   7. Test pause-overlay (Space/P/Esc tijdens race) — fase 5 brak hier.
//   8. Test camera-zoom op title screen — fase 5 brak hier.
//   9. InstancedMesh-paths in worlds/{arctic,themepark,volcano}.js gebruiken
//      .setMatrixAt() + instanceMatrix.needsUpdate — API ongewijzigd in r160.
//      InstancedMesh-conversie van environment trees (commit f77546c, ge-
//      reverted) kan apart heroverwogen worden zodra base-upgrade stabiel is.

'use strict';

(function(){
  // ── Versie-detectie ──────────────────────────────────────────────────
  // Drie pittfalls afgedekt:
  //   - REVISION ontbreekt (zou nooit moeten, maar we crashen niet).
  //   - REVISION als string ('134', '160').
  //   - REVISION met suffix ('159dev').
  let revNum = 0;
  try {
    const r = (typeof THREE !== 'undefined') ? THREE.REVISION : null;
    revNum = parseInt(String(r||'').match(/\d+/)?.[0] || '0', 10);
  } catch (_) { /* noop */ }

  const isR150Plus = revNum >= 150;  // outputColorSpace / ColorManagement default-on
  const isR155Plus = revNum >= 155;  // useLegacyLights default flip

  const appliedFlags = {
    revision: revNum || '(unknown)',
    colorSpaceApi: isR150Plus ? 'outputColorSpace' : 'outputEncoding',
    colorManagementForced: false,
    legacyLightsForced: false,
  };

  // ── Globale color-management shim ────────────────────────────────────
  // r152+ zet THREE.ColorManagement.enabled=true als default. Dat verandert
  // hoe textures gesampled worden en hoe materials kleuren mengen. Voor
  // pixel-exacte output zoals r134 zetten we 'm uit. Bij echte
  // visuele asset-redesign (en bewuste keuze voor color-managed pipeline)
  // kun je deze regel weghalen.
  if (isR150Plus && typeof THREE !== 'undefined' && THREE.ColorManagement) {
    try {
      THREE.ColorManagement.enabled = false;
      appliedFlags.colorManagementForced = true;
    } catch (_) { /* noop */ }
  }

  // ── Renderer color-space helper (vervangt outputEncoding in 3 sites) ─
  // Op r134:    renderer.outputEncoding = sRGBEncoding (oud gedrag).
  // Op r150+:   renderer.outputColorSpace = SRGBColorSpace.
  function applyRendererColorSpace(renderer) {
    if (!renderer || typeof THREE === 'undefined') return;
    if (isR150Plus && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    // useLegacyLights: r155+ default-flip. Lighting in deze codebase is
    // afgesteld op pre-r155 unit-loze formules. Forceren naar legacy zodat
    // sunLight.intensity=1.65 etc. dezelfde helderheid blijft geven.
    if (isR155Plus && 'useLegacyLights' in renderer) {
      try {
        renderer.useLegacyLights = true;
        appliedFlags.legacyLightsForced = true;
      } catch (_) { /* property kan in r158+ removed zijn */ }
    }
  }

  // ── Texture color-space helper (voor toekomstig texture-loading) ─────
  // Op r134:  texture.encoding = sRGBEncoding.
  // Op r150+: texture.colorSpace = SRGBColorSpace.
  // Niet (nog) gebruikt — geen texture.encoding calls in huidige code —
  // maar staat klaar voor wanneer assets met diffuse-maps worden ingeladen.
  function applyTextureColorSpace(texture) {
    if (!texture || typeof THREE === 'undefined') return;
    if (isR150Plus && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding !== undefined) {
      texture.encoding = THREE.sRGBEncoding;
    }
  }

  window.ThreeCompat = {
    revision: revNum,
    isR150Plus,
    isR155Plus,
    appliedFlags,
    applyRendererColorSpace,
    applyTextureColorSpace,
  };

  if (window.dbg && dbg.enabled) {
    dbg.snapshot('three-compat', 'init', appliedFlags);
  }
})();
