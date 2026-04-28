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

## Next worlds

This sessie pilots the pipeline on Grand Prix only. Manifests for other
worlds are stubbed (`{}`) so missing assets stay silent. Future sessies
will roll out matching slots for Neon City, Volcano, Arctic, Themepark,
Space, Deep Sea, and Candy.
