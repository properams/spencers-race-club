# Spencer's Race Club — Visual Asset Pipeline

This folder holds **optional** upgrade assets. The game is fully playable
without any of them — every slot has a procedural fallback baked into the
code. Drop a file at the path listed in `manifest.json` and refresh the
page (Ctrl+Shift+R) to activate the upgrade.

The pipeline mirrors the audio overhaul:

1. `assets/manifest.json` lists every asset slot per world.
2. `js/assets/loader.js` (`window.Assets`) reads the manifest, lazy-loads
   `RGBELoader` / `GLTFLoader` from CDN only when needed, and caches results.
3. World code asks `Assets.getHDRI('grandprix')` etc. synchronously at
   build time. Cache miss → fallback to the procedural canvas / cone /
   `MeshLambertMaterial` path.

## Folder layout

```
assets/
├── audio/         (already in use — see audio/README.md)
├── hdri/          .hdr equirectangular files (Radiance HDR / RGBE)
├── textures/
│   └── grandprix/ ground_color.jpg, ground_normal.jpg, ground_rough.jpg,
│                  mountains_far.png, mountains_near.png
└── models/
    ├── vegetation/ pine_low.glb, birch_low.glb
    └── props/      rock_small.glb, rock_medium.glb, haybale.glb
```

## Spencer Grand Prix slots (pilot world)

| Slot                  | Manifest path                               | Suggested CC0 source |
|-----------------------|---------------------------------------------|----------------------|
| HDRI sky              | `hdri/grandprix_dusk_2k.hdr`                | Poly Haven `kloofendal_48d_partly_cloudy_puresky` 2K, or `meadow_2` 2K |
| Ground color/normal/rough | `textures/grandprix/ground_*.jpg`       | Poly Haven `aerial_grass_rock` or `forest_ground_04` 2K |
| Pine tree             | `models/vegetation/pine_low.glb`            | Quaternius "Stylized Nature" pack — `Pine_Tree_Low.glb` |
| Birch tree            | `models/vegetation/birch_low.glb`           | Quaternius "Stylized Nature" pack — `Tree_Birch.glb` |
| Small / medium rocks  | `models/props/rock_*.glb`                   | Quaternius "Rocks" pack |
| Haybale               | `models/props/haybale.glb`                  | KayKit "Farmer Pack" or any CC0 model |
| Mountain layers (far/near) | `textures/grandprix/mountains_*.png`   | Skybox AI export, or hand-painted PNG with alpha |

### Recommended sources (all permissive licences)

- **HDRI:** <https://polyhaven.com/hdris> — CC0. Pick a 2K outdoor variant.
- **PBR ground textures:** <https://polyhaven.com/textures>,
  <https://ambientcg.com> — CC0. Use the *_diff_2k.jpg + _nor_gl_2k.jpg +
  _rough_2k.jpg trio.
- **Vegetation / props GLTF:** <https://quaternius.com>,
  <https://kaylousberg.itch.io> — both CC0. Pick the lowest-poly variant
  (≤ 1500 tris per tree).

> **Licensing rule:** only CC0, CC-BY (with attribution in
> `assets/CREDITS.md`), or other permissive licences are allowed.
> Anything ambiguous → don't use.

## Activation

1. Place the file at the path listed in `manifest.json`.
2. Hard refresh the browser (Ctrl+Shift+R / Cmd+Shift+R).
3. Open pause overlay during a race. The line below "FX ON" should read:
   `ASSETS [GRANDPRIX]   HDRI ✓   GROUND 3/3   PROPS 5/5   LAYERS 2/2`
4. If a slot stays `✗`, open the error viewer (Ctrl+Shift+E) — the asset
   loader logs the failed path under channel `assets`.

## All-worlds rollout (sessie 5)

The pipeline is now active on every world that benefits from realism
upgrades. Drop matching files in the paths listed in `manifest.json`:

| World      | HDRI | Ground PBR | Procedural silhouettes | Textured silhouettes | GLTF props |
|------------|:---:|:---:|:---:|:---:|---|
| grandprix  | ✓ | ✓ | ✓ | ✓ | trees + haybales + rocks |
| neoncity   | ✓ | ✓ (wet asphalt) | ✓ (deep blue-purple) | ✓ (skyline) | trash bin / bollard / roadblock |
| volcano    | ✓ | ✓ (lava rock) | ✓ (rust-red) | ✓ | basalt rocks / lava chunk |
| arctic     | ✓ | ✓ (snow/ice) | ✓ (cold blue) | ✓ (ice peaks) | iceberg s/m / snow rock |
| themepark  | ✓ | ✓ (pavement) | ✓ (dusk purple) | ✓ | traffic cone / bollard / barrel |
| deepsea    | — | ✓ (sand floor) | — | — | coral s/m / wreck box |
| space      | — | — | — | — | n/a — cosmic skybox + abyss procedural by design |
| candy      | — | — | — | — | n/a — thematic visuals would clash with PBR realism |

### Recommended HDRI variants per world

- **grandprix**: Poly Haven `kloofendal_48d_partly_cloudy_puresky` 2K, or `meadow_2`
- **neoncity**: Poly Haven `urban_alley_01` 2K (night-tinted), or `dikhololo_night`
- **volcano**: Poly Haven `lonely_road_afternoon_puresky` (warm), or any dusk HDRI
- **arctic**: Poly Haven `snowy_park_01` 2K
- **themepark**: Poly Haven `evening_road_01_puresky` 2K

### Mobile HDRI variants (optional but recommended)

The manifest has an `hdri_mobile` slot per world. Drop a 1K-resolution
HDRI alongside the 2K version — name it `*_1k.hdr` instead of `*_2k.hdr`
in the `assets/hdri/` folder. On mobile devices the loader automatically
prefers the 1K variant; if absent it falls back to the 2K file. 2K is
~6MB on disk; 1K is ~1.5MB — significantly faster download + decode on
slower mobile networks. Final envMap output is identical after PMREM
prefiltering, so visual quality on mobile is barely affected.

### Notes on world-specific behaviour

- HDRI fog-color sampling overrides the world's procedural fog tint. For
  thematic worlds (volcano red, neon purple) this is the user's opt-in
  trade — drop a matching HDRI or stick to procedural.
- Procedural background silhouettes are tuned per world to sit *behind*
  the existing rich horizons (volcano embers, neon skyscrapers, arctic
  auroras, themepark fireworks). They render automatically on grandprix /
  neoncity / volcano / arctic / themepark; deepsea / space / candy stay
  pure procedural.
- GLTF roadside prop dispatchers run on all worlds with prop slots.
  Without files dropped in, every spawn loop is a no-op — the existing
  procedural environment is unchanged.
