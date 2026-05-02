# Asset Usage Audit

*Gegenereerd op 2026-04-29*

Static analyse van `assets/models/`, gekruist met `assets/manifest.json` en alle
spawn-callsites in `js/`. Geen runtime-tests, geen wijzigingen aan code of
assets — dit is een spike, output is dit document.

## Methode

1. Disk inventory: `find assets/models -name "*.glb" -o -name "*.gltf"` — 108
   model-bestanden gevonden (18 .glb + 90 .gltf).
2. Manifest parse (`assets/manifest.json`) — slot-paden per wereld geëxtraheerd.
3. Spawn-callsites verzameld via grep op `spawnRoadsideProps`,
   `spawnGroundClutter`, `spawnGLTFProp`, `getGLTF`, `getGLTFVariants`,
   `listProps` over `js/`.
4. Per file: gecheckt of pad voorkomt in manifest **én** of de bijbehorende
   propKey in een spawn-call zit.
5. Manifest-entries waarvan het bestand niet op disk staat (HDRI/textures)
   apart gerapporteerd.

## Summary

| Metric | Aantal |
|---|---|
| Totaal model-bestanden op disk | 108 |
| Used (manifest + spawn-call) | 86 (79.6%) |
| Orphan (op disk, geen verwijzing) | 22 (20.4%) |
| Manifest-entries naar niet-bestaand bestand | 47 |
| Manifest-slots met lege string (intentioneel uit) | 6 |
| HDRI / texture / skybox dir's leeg | ja (`assets/hdri/`, `assets/textures/`) |

PROJECT_STATE.md noemt "~132 GLTF assets" — feitelijk telling is 108. Het
verschil zijn waarschijnlijk de `.bin` sidecars (90×) die als losse files
meetellen op disk.

## Per directory

### assets/models/city/ (22 bestanden)

| Bestand | Status | Gebruikt in (world / propKey) | Notitie |
|---|---|---|---|
| base.gltf | Orphan | — | nooit gerefereerd in manifest of code |
| bench.gltf | Used | themepark / `bench` | spawnRoadsideProps |
| box_A.gltf | Used | neoncity / `roadblock`, deepsea / `wreck_box` | spawnRoadsideProps |
| box_B.gltf | Used | neoncity / `roadblock`, deepsea / `wreck_box` | spawnRoadsideProps |
| building_A.gltf | Used | neoncity / `building_bg`, themepark / `building_bg` | desktop-only layer |
| building_B.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| building_C.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| building_D.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| building_E.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| building_F.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| building_G.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| building_H.gltf | Used | neoncity, themepark / `building_bg` | desktop-only |
| bush.gltf | Orphan | — | grandprix `bush` slot wijst naar nature/Bush_Common*.gltf |
| dumpster.gltf | Used | neoncity / `trashbin` | spawnRoadsideProps |
| firehydrant.gltf | Used | neoncity / `bollard_neon`, themepark / `bollard` | spawnRoadsideProps |
| streetlight.gltf | Used | neoncity, themepark / `streetlight` | desktop-only neoncity |
| trafficlight_A.gltf | Used | neoncity / `traffic_light` | desktop-only |
| trafficlight_B.gltf | Used | neoncity / `traffic_light` | desktop-only |
| trafficlight_C.gltf | Used | neoncity / `traffic_light` | desktop-only |
| trash_A.gltf | Used | neoncity / `trashbin`, themepark / `barrel` | spawnRoadsideProps |
| trash_B.gltf | Used | neoncity / `trashbin`, themepark / `barrel` | spawnRoadsideProps |
| watertower.gltf | Used | neoncity / `watertower` | desktop-only |

### assets/models/nature/ (68 bestanden)

| Bestand | Status | Gebruikt in (world / propKey) | Notitie |
|---|---|---|---|
| Bush_Common.gltf | Used | grandprix / `bush` | scene.js spawnRoadsideProps |
| Bush_Common_Flowers.gltf | Used | grandprix / `bush` | scene.js |
| Clover_1.gltf | Used | grandprix / `ground_fern` | spawnGroundClutter (desktop-only) |
| Clover_2.gltf | Used | grandprix / `ground_fern` | spawnGroundClutter |
| CommonTree_1.gltf | Used | grandprix / `tree_birch` | environment.js instanced trees |
| CommonTree_2.gltf | Used | grandprix / `tree_birch` | environment.js |
| CommonTree_3.gltf | Used | grandprix / `tree_birch` | environment.js |
| CommonTree_4.gltf | Used | grandprix / `tree_birch` | environment.js |
| CommonTree_5.gltf | Used | grandprix / `tree_birch` | environment.js |
| DeadTree_1.gltf | Used | grandprix / `tree_dead`, volcano / `tree_burnt`, arctic / `tree_frosted` | hergebruikt 3× |
| DeadTree_2.gltf | Used | grandprix / `tree_dead`, volcano / `tree_burnt`, arctic / `tree_frosted` | hergebruikt 3× |
| DeadTree_3.gltf | Used | grandprix / `tree_dead`, volcano / `tree_burnt`, arctic / `tree_frosted` | hergebruikt 3× |
| DeadTree_4.gltf | Used | grandprix / `tree_dead`, volcano / `tree_burnt`, arctic / `tree_frosted` | hergebruikt 3× |
| DeadTree_5.gltf | Used | grandprix / `tree_dead`, volcano / `tree_burnt`, arctic / `tree_frosted` | hergebruikt 3× |
| Fern_1.gltf | Used | grandprix / `ground_fern` | spawnGroundClutter |
| Flower_3_Group.gltf | Used | grandprix / `ground_flower` | spawnGroundClutter |
| Flower_3_Single.gltf | Used | grandprix / `ground_flower` | spawnGroundClutter |
| Flower_4_Group.gltf | Used | grandprix / `ground_flower` | spawnGroundClutter |
| Flower_4_Single.gltf | Used | grandprix / `ground_flower` | spawnGroundClutter |
| Grass_Common_Short.gltf | Orphan | — | nooit in manifest |
| Grass_Common_Tall.gltf | Orphan | — | nooit in manifest |
| Grass_Wispy_Short.gltf | Orphan | — | nooit in manifest |
| Grass_Wispy_Tall.gltf | Orphan | — | nooit in manifest |
| Mushroom_Common.gltf | Used | grandprix / `ground_mushroom` | spawnGroundClutter |
| Mushroom_Laetiporus.gltf | Used | grandprix / `ground_mushroom` | spawnGroundClutter |
| Pebble_Round_1.gltf | Used | grandprix / `rock_small`, arctic / `snow_rock` | hergebruikt 2× |
| Pebble_Round_2.gltf | Used | grandprix / `rock_small`, arctic / `snow_rock` | hergebruikt 2× |
| Pebble_Round_3.gltf | Used | grandprix / `rock_small`, arctic / `snow_rock` | hergebruikt 2× |
| Pebble_Round_4.gltf | Used | grandprix / `rock_small`, arctic / `snow_rock` | hergebruikt 2× |
| Pebble_Round_5.gltf | Used | grandprix / `rock_small`, arctic / `snow_rock` | hergebruikt 2× |
| Pebble_Square_1.gltf | Used | volcano / `rock_basalt_small` | spawnRoadsideProps |
| Pebble_Square_2.gltf | Used | volcano / `rock_basalt_small` | spawnRoadsideProps |
| Pebble_Square_3.gltf | Used | volcano / `rock_basalt_small` | spawnRoadsideProps |
| Pebble_Square_4.gltf | Used | volcano / `rock_basalt_small` | spawnRoadsideProps |
| Pebble_Square_5.gltf | Used | volcano / `rock_basalt_small` | spawnRoadsideProps |
| Pebble_Square_6.gltf | Used | volcano / `rock_basalt_small` | spawnRoadsideProps |
| Petal_1.gltf | Orphan | — | nooit in manifest |
| Petal_2.gltf | Orphan | — | nooit in manifest |
| Petal_3.gltf | Orphan | — | nooit in manifest |
| Petal_4.gltf | Orphan | — | nooit in manifest |
| Petal_5.gltf | Orphan | — | nooit in manifest |
| Pine_1.gltf | Used | grandprix / `tree_pine` | environment.js instanced trees |
| Pine_2.gltf | Used | grandprix / `tree_pine` | environment.js |
| Pine_3.gltf | Used | grandprix / `tree_pine` | environment.js |
| Pine_4.gltf | Used | grandprix / `tree_pine` | environment.js |
| Pine_5.gltf | Used | grandprix / `tree_pine` | environment.js |
| Plant_1.gltf | Used | deepsea / `coral_small` | spawnRoadsideProps |
| Plant_1_Big.gltf | Used | deepsea / `coral_medium` | spawnRoadsideProps |
| Plant_7.gltf | Used | deepsea / `coral_small` | spawnRoadsideProps |
| Plant_7_Big.gltf | Used | deepsea / `coral_medium` | spawnRoadsideProps |
| RockPath_Round_Small_1.gltf | Orphan | — | nooit in manifest |
| RockPath_Round_Small_2.gltf | Orphan | — | nooit in manifest |
| RockPath_Round_Small_3.gltf | Orphan | — | nooit in manifest |
| RockPath_Round_Thin.gltf | Orphan | — | nooit in manifest |
| RockPath_Round_Wide.gltf | Orphan | — | nooit in manifest |
| RockPath_Square_Small_1.gltf | Orphan | — | nooit in manifest |
| RockPath_Square_Small_2.gltf | Orphan | — | nooit in manifest |
| RockPath_Square_Small_3.gltf | Orphan | — | nooit in manifest |
| RockPath_Square_Thin.gltf | Orphan | — | nooit in manifest |
| RockPath_Square_Wide.gltf | Orphan | — | nooit in manifest |
| Rock_Medium_1.gltf | Used | grandprix / `rock_medium`, volcano / `rock_basalt_medium` | hergebruikt 2× |
| Rock_Medium_2.gltf | Used | grandprix / `rock_medium`, volcano / `rock_basalt_medium` | hergebruikt 2× |
| Rock_Medium_3.gltf | Used | grandprix / `rock_medium`, volcano / `rock_basalt_medium` | hergebruikt 2× |
| TwistedTree_1.gltf | Used | volcano / `tree_burnt` | spawnRoadsideProps |
| TwistedTree_2.gltf | Used | volcano / `tree_burnt` | spawnRoadsideProps |
| TwistedTree_3.gltf | Used | volcano / `tree_burnt` | spawnRoadsideProps |
| TwistedTree_4.gltf | Used | volcano / `tree_burnt` | spawnRoadsideProps |
| TwistedTree_5.gltf | Used | volcano / `tree_burnt` | spawnRoadsideProps |

### assets/models/space/ (16 bestanden)

| Bestand | Status | Gebruikt in (world / propKey) | Notitie |
|---|---|---|---|
| crater.glb | Used | space / `crater` | desktop-only |
| craterLarge.glb | Used | space / `crater` | desktop-only |
| meteor.glb | Used | space / `asteroid_small` | spawnRoadsideProps |
| meteor_detailed.glb | Used | space / `asteroid_large` | spawnRoadsideProps |
| meteor_half.glb | Used | space / `asteroid_small` | spawnRoadsideProps |
| rock.glb | Used | space / `asteroid_small` | spawnRoadsideProps |
| rock_crystals.glb | Used | volcano / `lava_chunk` | hergebruikt cross-world |
| rock_crystalsLargeA.glb | Used | volcano / `lava_chunk`, space / `asteroid_large` | hergebruikt 2× |
| rock_crystalsLargeB.glb | Used | volcano / `lava_chunk`, space / `asteroid_large` | hergebruikt 2× |
| rock_largeA.glb | Used | space / `asteroid_large` | spawnRoadsideProps |
| rock_largeB.glb | Used | space / `asteroid_large` | spawnRoadsideProps |
| rocks_smallA.glb | Used | space / `asteroid_small` | spawnRoadsideProps |
| rocks_smallB.glb | Used | space / `asteroid_small` | spawnRoadsideProps |
| satelliteDish.glb | Used | space / `satellite` | desktop-only |
| satelliteDish_detailed.glb | Used | space / `satellite` | desktop-only |
| satelliteDish_large.glb | Used | space / `satellite` | desktop-only |

### assets/models/arctic/ (1 bestand)

| Bestand | Status | Gebruikt in | Notitie |
|---|---|---|---|
| iceberg_small.glb | Used | arctic / `iceberg_small` | spawnRoadsideProps |

### assets/models/landmarks/ (1 bestand)

| Bestand | Status | Gebruikt in | Notitie |
|---|---|---|---|
| mountain_cabin.glb | Orphan | — | alleen genoemd in `assets/README.md` als "held for a future GP track-side"; geen manifest-slot, geen code |

## Manifest issues

### Niet-bestaande bestanden waarnaar manifest verwijst

`assets/hdri/` en `assets/textures/` zijn beide leeg op disk. Manifest claimt
de volgende paden — alle laden falen graceful (loader.js zet cache-entry op
`null` en de procedural fallback neemt over).

| Manifest entry | Aantal verwijzingen | Type |
|---|---|---|
| `assets/hdri/<world>_*_2k.hdr` | 5 | HDRI desktop (grandprix, neoncity, volcano, arctic, themepark) |
| `assets/hdri/<world>_*_1k.hdr` | 5 | HDRI mobile variant |
| `assets/textures/<world>/ground_*.{jpg}` | 18 | Ground PBR (color/normal/roughness × 6 worlds) |
| `assets/textures/<world>/skyline_*.png` etc. | 14 | Skybox layers (mountains_far/near × 7 worlds) |
| `assets/hdri/themepark_evening_2k.hdr` etc. | (zit in 5 hierboven) | — |

Totaal **47** manifest-paden naar niet-bestaande bestanden. `deepsea` en
`space` hebben geen `hdri:` slot (deepsea heeft lege string, space ontbreekt);
candy ook niet. Deepsea/themepark/candy hebben skybox_layers maar de
bijbehorende texture-files bestaan niet.

### Lege slots (intentioneel uit, geen bestand verwacht)

| World | Slot | Code-call die slot leest |
|---|---|---|
| grandprix | `haybale` | `buildGPTrackProps` (worlds/grandprix.js:136) |
| arctic | `iceberg_medium` | spawnRoadsideProps (worlds/arctic.js:137) |
| themepark | `traffic_cone` | spawnRoadsideProps (worlds/themepark.js:266) |
| candy | `candy_lollipop` | spawnRoadsideProps (worlds/candy.js:38) |
| candy | `candy_cane` | spawnRoadsideProps (worlds/candy.js:38) |
| candy | `gumdrop` | spawnRoadsideProps (worlds/candy.js:38) |

Deze slots zijn lege strings in het manifest. `Assets.getGLTF` retourneert
`null`, `propKeys.filter` haalt ze eruit, en de procedural fallback draait —
geen runtime-fout. Dat is design (PROJECT_STATE: "samples are additive";
hetzelfde patroon hier voor models).

### Manifested but unspawned

Geen. Elke niet-lege manifest-prop-key wordt door minstens één wereld via
`spawnRoadsideProps` / `spawnGroundClutter` / `getGLTF` (grandprix tracksprops,
environment.js trees) bereikt.

### Spawned but ungated

Geen. Alle code-paden lopen via `Assets.getGLTF` / `Assets.listProps` /
`Assets.getGLTFVariants` — alles via manifest. Geen direct hardcoded paden
naar GLTF-bestanden in code.

## Aanbevelingen

Feitelijk, geen architectuur-discussie:

- **22 orphan-modelbestanden** kunnen weg of in `assets/_inbox/` geplaatst.
  Lijst: city/base.gltf, city/bush.gltf, landmarks/mountain_cabin.glb, en alle
  19 nature-orphans (4× Grass_, 5× Petal_, 10× RockPath_).
- **47 manifest-entries naar niet-bestaande bestanden** — beslissing nodig:
  ofwel `assets/hdri/` + `assets/textures/` echt vullen (HDRI's en PBR
  ground/skybox sets), ofwel deze entries uit manifest verwijderen. Op dit
  moment kost het alleen netwerk-roundtrips bij elke world-switch (alle 404's
  cached na eerste poging).
- **6 lege manifest-slots** (haybale, iceberg_medium, traffic_cone, candy ×3)
  zijn intentioneel placeholder voor toekomstige assets. Geen actie nodig
  tenzij besloten wordt dat ze nooit gevuld worden — dan slot + propKey-array
  in callsite samen verwijderen.
- **Externe Asset Integratie project zinvol?** De model-pipeline is gezond
  (80% used, geen ongelinkte spawns, hergebruik cross-world is hoog). De
  HDRI/textures-laag is daarentegen volledig leeg ondanks volledige manifest-
  en loader-infrastructuur. Een vervolg-sessie kan zich beter daar op
  richten dan op nog meer GLTF-props.

## Bijlage: orphan-bestanden (kopieerbaar)

```
assets/models/city/base.gltf
assets/models/city/bush.gltf
assets/models/landmarks/mountain_cabin.glb
assets/models/nature/Grass_Common_Short.gltf
assets/models/nature/Grass_Common_Tall.gltf
assets/models/nature/Grass_Wispy_Short.gltf
assets/models/nature/Grass_Wispy_Tall.gltf
assets/models/nature/Petal_1.gltf
assets/models/nature/Petal_2.gltf
assets/models/nature/Petal_3.gltf
assets/models/nature/Petal_4.gltf
assets/models/nature/Petal_5.gltf
assets/models/nature/RockPath_Round_Small_1.gltf
assets/models/nature/RockPath_Round_Small_2.gltf
assets/models/nature/RockPath_Round_Small_3.gltf
assets/models/nature/RockPath_Round_Thin.gltf
assets/models/nature/RockPath_Round_Wide.gltf
assets/models/nature/RockPath_Square_Small_1.gltf
assets/models/nature/RockPath_Square_Small_2.gltf
assets/models/nature/RockPath_Square_Small_3.gltf
assets/models/nature/RockPath_Square_Thin.gltf
assets/models/nature/RockPath_Square_Wide.gltf
```

(.bin sidecars en .png textures naast deze .gltf-bestanden zijn ook orphan en
mogen mee als de .gltf zelf weggaat — de .gltf wijst naar zijn eigen .bin.)
