# Asset Usage Audit

*Gegenereerd op 2026-04-29 — branch `claude/audit-unused-assets-ZoNfT`*

Statische analyse van `assets/models/` en `assets/manifest.json` tegen alle
spawn-call-sites in `js/`. Geen runtime-tests, geen code-wijzigingen — puur
cross-reference.

## Summary

- **Totaal model-assets op disk:** 108 (`*.glb` / `*.gltf` onder `assets/models/`)
- **Used:** 86 (80%) — manifest verwijst ernaar én een spawn-call bereikt het
- **Orphan:** 22 (20%) — bestand op disk, geen enkele referentie
- **Manifested but unspawned:** 0 — elke gevulde manifest-slot heeft een spawn-pad
- **Spawned but ungated:** 0 — alle spawn-calls gaan via `Assets.getGLTF` (manifest)
- **Manifest verwijzingen zonder bestand op disk:** 44
  (12 HDRI + 18 ground textures + 14 skybox layer textures)

Empty-string slots (intentioneel inactief, procedural fallback): 6
(`grandprix.haybale`, `arctic.iceberg_medium`, `themepark.traffic_cone`,
`candy.candy_lollipop`, `candy.candy_cane`, `candy.gumdrop`,
`deepsea.hdri`). Deze zijn geen bugs — manifest-comment documenteert
ze als bewust leeg.

---

## Cross-reference methode

Voor elk fysiek bestand:

1. Gegrep'd in `assets/manifest.json` voor exacte path-string.
2. Voor elke manifest-slot die hem bevat: gecheckt welk(e) `propKeys`-array
   in `js/worlds/*.js`, `js/core/scene.js` of `js/track/environment.js`
   die slot-key noemt.
3. Slot-key gevonden in een spawn-call → asset is **Used**.
4. Slot-key niet gevonden → **Manifested but unspawned** (kwam in praktijk
   niet voor — de uitzonderingen waren empty-string slots, niet path-slots).

Voor elke manifest-entry: bestand op disk gecheckt met `find assets/`.

Spawn entrypoints in scope:

- `spawnRoadsideProps(worldId, {propKeys})` — `effects/asset-bridge.js`
- `spawnGroundClutter(worldId, {propKeys})` — idem
- `spawnGLTFProp(proto, ...)` direct met `Assets.getGLTF()` lookup —
  alleen `worlds/grandprix.js:137`
- `Assets.listProps(worldId)` + `Assets.getGLTFVariants(worldId, k)` —
  alleen `track/environment.js:596` (`buildEnvironmentTrees` voor GP)

---

## Per directory

### assets/models/arctic/ (1 bestand)

| Bestand | Status | Gebruikt in | Notitie |
|---------|--------|-------------|---------|
| iceberg_small.glb | Used | arctic | manifest `arctic.iceberg_small` → `worlds/arctic.js:137` |

### assets/models/city/ (22 bestanden)

| Bestand | Status | Gebruikt in | Notitie |
|---------|--------|-------------|---------|
| base.gltf | **Orphan** | — | nooit in manifest, nooit gerefereerd |
| bench.gltf | Used | themepark | `themepark.bench` |
| box_A.gltf | Used | neoncity, deepsea | `neoncity.roadblock`, `deepsea.wreck_box` |
| box_B.gltf | Used | neoncity, deepsea | idem |
| building_A.gltf | Used | neoncity, themepark | `building_bg` (desktop only in beide werelden) |
| building_B.gltf | Used | neoncity, themepark | idem |
| building_C.gltf | Used | neoncity, themepark | idem |
| building_D.gltf | Used | neoncity, themepark | idem |
| building_E.gltf | Used | neoncity, themepark | idem |
| building_F.gltf | Used | neoncity, themepark | idem |
| building_G.gltf | Used | neoncity, themepark | idem |
| building_H.gltf | Used | neoncity, themepark | idem |
| bush.gltf | **Orphan** | — | manifest's `grandprix.bush` slot map naar `nature/Bush_Common*`, niet hierheen |
| dumpster.gltf | Used | neoncity | `neoncity.trashbin` |
| firehydrant.gltf | Used | neoncity, themepark | `neoncity.bollard_neon`, `themepark.bollard` |
| streetlight.gltf | Used | neoncity, themepark | `streetlight` slot in beide |
| trafficlight_A.gltf | Used | neoncity | `neoncity.traffic_light` |
| trafficlight_B.gltf | Used | neoncity | idem |
| trafficlight_C.gltf | Used | neoncity | idem |
| trash_A.gltf | Used | neoncity, themepark | `neoncity.trashbin`, `themepark.barrel` |
| trash_B.gltf | Used | neoncity, themepark | idem |
| watertower.gltf | Used | neoncity | `neoncity.watertower` (desktop only) |

**Totaal city: 20 used / 2 orphan**

### assets/models/landmarks/ (1 bestand)

| Bestand | Status | Gebruikt in | Notitie |
|---------|--------|-------------|---------|
| mountain_cabin.glb | **Orphan** | — | nergens in manifest of code |

### assets/models/nature/ (68 bestanden)

| Bestand | Status | Gebruikt in | Notitie |
|---------|--------|-------------|---------|
| Bush_Common.gltf | Used | grandprix | `grandprix.bush` → `core/scene.js:479` |
| Bush_Common_Flowers.gltf | Used | grandprix | idem |
| Clover_1.gltf | Used | grandprix | `grandprix.ground_fern` (groundClutter) |
| Clover_2.gltf | Used | grandprix | idem |
| CommonTree_1.gltf | Used | grandprix | `grandprix.tree_birch` → `environment.js:596` |
| CommonTree_2.gltf | Used | grandprix | idem |
| CommonTree_3.gltf | Used | grandprix | idem |
| CommonTree_4.gltf | Used | grandprix | idem |
| CommonTree_5.gltf | Used | grandprix | idem |
| DeadTree_1.gltf | Used | grandprix, volcano, arctic | `tree_dead` / `tree_burnt` / `tree_frosted` |
| DeadTree_2.gltf | Used | grandprix, volcano, arctic | idem |
| DeadTree_3.gltf | Used | grandprix, volcano, arctic | idem |
| DeadTree_4.gltf | Used | grandprix, volcano, arctic | idem |
| DeadTree_5.gltf | Used | grandprix, volcano, arctic | idem |
| Fern_1.gltf | Used | grandprix | `grandprix.ground_fern` |
| Flower_3_Group.gltf | Used | grandprix | `grandprix.ground_flower` |
| Flower_3_Single.gltf | Used | grandprix | idem |
| Flower_4_Group.gltf | Used | grandprix | idem |
| Flower_4_Single.gltf | Used | grandprix | idem |
| Grass_Common_Short.gltf | **Orphan** | — | geen manifest-slot, geen spawn |
| Grass_Common_Tall.gltf | **Orphan** | — | idem |
| Grass_Wispy_Short.gltf | **Orphan** | — | idem |
| Grass_Wispy_Tall.gltf | **Orphan** | — | idem |
| Mushroom_Common.gltf | Used | grandprix | `grandprix.ground_mushroom` |
| Mushroom_Laetiporus.gltf | Used | grandprix | idem |
| Pebble_Round_1.gltf | Used | grandprix, arctic | `rock_small` / `snow_rock` |
| Pebble_Round_2.gltf | Used | grandprix, arctic | idem |
| Pebble_Round_3.gltf | Used | grandprix, arctic | idem |
| Pebble_Round_4.gltf | Used | grandprix, arctic | idem |
| Pebble_Round_5.gltf | Used | grandprix, arctic | idem |
| Pebble_Square_1.gltf | Used | volcano | `volcano.rock_basalt_small` |
| Pebble_Square_2.gltf | Used | volcano | idem |
| Pebble_Square_3.gltf | Used | volcano | idem |
| Pebble_Square_4.gltf | Used | volcano | idem |
| Pebble_Square_5.gltf | Used | volcano | idem |
| Pebble_Square_6.gltf | Used | volcano | idem |
| Petal_1.gltf | **Orphan** | — | geen manifest-slot, geen spawn |
| Petal_2.gltf | **Orphan** | — | idem |
| Petal_3.gltf | **Orphan** | — | idem |
| Petal_4.gltf | **Orphan** | — | idem |
| Petal_5.gltf | **Orphan** | — | idem |
| Pine_1.gltf | Used | grandprix | `grandprix.tree_pine` |
| Pine_2.gltf | Used | grandprix | idem |
| Pine_3.gltf | Used | grandprix | idem |
| Pine_4.gltf | Used | grandprix | idem |
| Pine_5.gltf | Used | grandprix | idem |
| Plant_1.gltf | Used | deepsea | `deepsea.coral_small` |
| Plant_1_Big.gltf | Used | deepsea | `deepsea.coral_medium` |
| Plant_7.gltf | Used | deepsea | `deepsea.coral_small` |
| Plant_7_Big.gltf | Used | deepsea | `deepsea.coral_medium` |
| RockPath_Round_Small_1.gltf | **Orphan** | — | geen manifest-slot, geen spawn |
| RockPath_Round_Small_2.gltf | **Orphan** | — | idem |
| RockPath_Round_Small_3.gltf | **Orphan** | — | idem |
| RockPath_Round_Thin.gltf | **Orphan** | — | idem |
| RockPath_Round_Wide.gltf | **Orphan** | — | idem |
| RockPath_Square_Small_1.gltf | **Orphan** | — | idem |
| RockPath_Square_Small_2.gltf | **Orphan** | — | idem |
| RockPath_Square_Small_3.gltf | **Orphan** | — | idem |
| RockPath_Square_Thin.gltf | **Orphan** | — | idem |
| RockPath_Square_Wide.gltf | **Orphan** | — | idem |
| Rock_Medium_1.gltf | Used | grandprix, volcano | `rock_medium` / `rock_basalt_medium` |
| Rock_Medium_2.gltf | Used | grandprix, volcano | idem |
| Rock_Medium_3.gltf | Used | grandprix, volcano | idem |
| TwistedTree_1.gltf | Used | volcano | `volcano.tree_burnt` |
| TwistedTree_2.gltf | Used | volcano | idem |
| TwistedTree_3.gltf | Used | volcano | idem |
| TwistedTree_4.gltf | Used | volcano | idem |
| TwistedTree_5.gltf | Used | volcano | idem |

**Totaal nature: 49 used / 19 orphan**

### assets/models/space/ (16 bestanden)

| Bestand | Status | Gebruikt in | Notitie |
|---------|--------|-------------|---------|
| crater.glb | Used | space | `space.crater` (desktop only) |
| craterLarge.glb | Used | space | idem |
| meteor.glb | Used | space | `space.asteroid_small` |
| meteor_detailed.glb | Used | space | `space.asteroid_large` |
| meteor_half.glb | Used | space | `space.asteroid_small` |
| rock.glb | Used | space | `space.asteroid_small` |
| rock_crystals.glb | Used | volcano | `volcano.lava_chunk` |
| rock_crystalsLargeA.glb | Used | volcano, space | `volcano.lava_chunk`, `space.asteroid_large` |
| rock_crystalsLargeB.glb | Used | volcano, space | idem |
| rock_largeA.glb | Used | space | `space.asteroid_large` |
| rock_largeB.glb | Used | space | idem |
| rocks_smallA.glb | Used | space | `space.asteroid_small` |
| rocks_smallB.glb | Used | space | idem |
| satelliteDish.glb | Used | space | `space.satellite` (desktop only) |
| satelliteDish_detailed.glb | Used | space | idem |
| satelliteDish_large.glb | Used | space | idem |

**Totaal space: 16 used / 0 orphan**

---

## Manifest issues (paden zonder bestand op disk)

`assets/loader.js` faalt graceful op missing files (slot blijft `null`,
de scene valt terug op procedural). Dat verklaart waarom alles speelbaar
is ondanks dat HDRI/ground/skybox-textures volledig leeg zijn.

### HDRI (12 entries — `assets/hdri/` bevat alleen `.gitkeep`)

| Manifest entry | Wereld |
|----------------|--------|
| assets/hdri/grandprix_dusk_2k.hdr | grandprix (desktop) |
| assets/hdri/grandprix_dusk_1k.hdr | grandprix (mobile) |
| assets/hdri/neoncity_night_2k.hdr | neoncity (desktop) |
| assets/hdri/neoncity_night_1k.hdr | neoncity (mobile) |
| assets/hdri/volcano_dusk_2k.hdr | volcano (desktop) |
| assets/hdri/volcano_dusk_1k.hdr | volcano (mobile) |
| assets/hdri/arctic_overcast_2k.hdr | arctic (desktop) |
| assets/hdri/arctic_overcast_1k.hdr | arctic (mobile) |
| assets/hdri/themepark_evening_2k.hdr | themepark (desktop) |
| assets/hdri/themepark_evening_1k.hdr | themepark (mobile) |

`deepsea.hdri` is leeg (`""`). `space` en `candy` hebben geen `hdri` key —
geen entry, geen probleem.

### Ground textures (18 entries — `assets/textures/` bevat alleen `.gitkeep`)

| Manifest entry | Wereld |
|----------------|--------|
| assets/textures/grandprix/ground_color.jpg | grandprix |
| assets/textures/grandprix/ground_normal.jpg | grandprix |
| assets/textures/grandprix/ground_rough.jpg | grandprix |
| assets/textures/neoncity/asphalt_wet_color.jpg | neoncity |
| assets/textures/neoncity/asphalt_wet_normal.jpg | neoncity |
| assets/textures/neoncity/asphalt_wet_rough.jpg | neoncity |
| assets/textures/volcano/lavarock_color.jpg | volcano |
| assets/textures/volcano/lavarock_normal.jpg | volcano |
| assets/textures/volcano/lavarock_rough.jpg | volcano |
| assets/textures/arctic/snowice_color.jpg | arctic |
| assets/textures/arctic/snowice_normal.jpg | arctic |
| assets/textures/arctic/snowice_rough.jpg | arctic |
| assets/textures/themepark/pavement_color.jpg | themepark |
| assets/textures/themepark/pavement_normal.jpg | themepark |
| assets/textures/themepark/pavement_rough.jpg | themepark |
| assets/textures/deepsea/sand_color.jpg | deepsea |
| assets/textures/deepsea/sand_normal.jpg | deepsea |
| assets/textures/deepsea/sand_rough.jpg | deepsea |

### Skybox layer textures (14 entries — zelfde lege `assets/textures/`)

| Manifest entry | Wereld |
|----------------|--------|
| assets/textures/grandprix/mountains_far.png | grandprix |
| assets/textures/grandprix/mountains_near.png | grandprix |
| assets/textures/neoncity/skyline_far.png | neoncity |
| assets/textures/neoncity/skyline_near.png | neoncity |
| assets/textures/volcano/silhouette_far.png | volcano |
| assets/textures/volcano/silhouette_near.png | volcano |
| assets/textures/arctic/icepeaks_far.png | arctic |
| assets/textures/arctic/icepeaks_near.png | arctic |
| assets/textures/themepark/silhouette_far.png | themepark |
| assets/textures/themepark/silhouette_near.png | themepark |
| assets/textures/deepsea/rockwall_far.png | deepsea |
| assets/textures/deepsea/rockwall_near.png | deepsea |
| assets/textures/candy/sweethills_far.png | candy |
| assets/textures/candy/sweethills_near.png | candy |

---

## Empty-string slots (intentioneel inactief)

Niet bugs — manifest-comment documenteert dat een lege string of lege array
een procedural fallback signaleert. Genoteerd voor volledigheid:

| Slot | Wereld | Procedural fallback in |
|------|--------|------------------------|
| `haybale` | grandprix | `worlds/grandprix.js:137` (tireStack hak terug) |
| `iceberg_medium` | arctic | `worlds/arctic.js` (alleen `iceberg_small` spawnt) |
| `traffic_cone` | themepark | `worlds/themepark.js` |
| `candy_lollipop` | candy | `worlds/candy.js` |
| `candy_cane` | candy | idem |
| `gumdrop` | candy | idem |
| `hdri` | deepsea | (geen HDRI gepland voor underwater) |

---

## Aanbevelingen

Feitelijk, geen architectuur-discussie. Beslissingen voor een aparte sessie.

1. **22 orphan model-bestanden kunnen weggehaald worden** als ze geen
   geplande rol hebben in komende werelden:
   - `models/city/base.gltf`, `models/city/bush.gltf`
   - `models/landmarks/mountain_cabin.glb`
   - 4× `models/nature/Grass_*` (Common Short/Tall, Wispy Short/Tall)
   - 5× `models/nature/Petal_1..5`
   - 5× `models/nature/RockPath_Round_*` (3× Small + Thin + Wide)
   - 5× `models/nature/RockPath_Square_*` (3× Small + Thin + Wide)

2. **44 manifest-entries verwijzen naar lege `hdri/` en `textures/` mappen.**
   Twee opties — keuze nodig:
   - (a) **Vullen** — HDRI's en PBR-grond/skybox-textures daadwerkelijk
     downloaden en in de mappen zetten (loader is al klaar, `_assetBridge`
     past ze automatisch toe).
   - (b) **Verwijderen** uit `manifest.json` — wat er nu staat is louter
     intent-as-comment. Loader doet `null`-fallback dus er zijn geen
     warnings, maar de manifest geeft een misleidend beeld van wat de
     game daadwerkelijk laadt.

3. **`bush.gltf` in `models/city/` is verwarrend** — de manifest-key
   `grandprix.bush` mapt naar `nature/Bush_Common*`, niet hierheen. Als
   `city/bush.gltf` blijft (bijv. voor toekomstige neoncity foliage),
   overweeg een nieuwe slot zoals `neoncity.bush_urban`.

4. **`landmarks/` is een dode directory** — 1 bestand,
   nergens gerefereerd. Of de subdirectory schrappen, of bewust gaan
   benutten (manifest-slot `*.landmark` per wereld bv).

5. **Externe Asset Integratie project** — het 3D-model kanaal
   functioneert end-to-end (manifest → loader → cache → spawn dispatcher),
   maar het HDRI- en texture-kanaal wordt nul keer met echte data gevoed.
   Of dat een gemiste kans is of een bewust geschrapt traject is een
   product-beslissing buiten scope van deze audit.
