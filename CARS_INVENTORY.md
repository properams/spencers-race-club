# CARS_INVENTORY.md

Feitelijke inventaris van het auto-systeem in `js/cars/`. Niet-evaluatief — pure beschrijving van wat er staat.

Bestanden: `brands.js` (822 regels), `car-parts.js` (342 regels), `build.js` (179 regels), `physics.js` (329 regels).

Brand-data wordt geladen vanuit `data/cars.json` (12 entries, ids 0-11) en gemapt naar `CAR_DEFS` in `js/main.js:25`.

---

## 1. `brands.js` — per-builder breakdown

### 1.1 Builder-registry

`BRAND_BUILDERS` (regel 795-808) mapt `def.brand` (string) → builder-functie. Geëxposeerd via `window.BRAND_BUILDERS` (regel 810). Alle 12 brands hebben een explicit builder; legacy parametric fallback is verwijderd (zie commentaar regel 791-794).

| `def.brand` key | Builder | car id (cars.json) | Type |
|---|---|---|---|
| `FERRARI` | `buildFerrariSF90` | 3 | super |
| `BUGATTI` | `buildBugattiChiron` | 0 | super |
| `LAMBORGHINI` | `buildLamborghiniHuracan` | 1 | super |
| `MASERATI` | `buildMaseratiMC20` | 2 | super |
| `AUDI` | `buildAudiR8` | 7 | super |
| `PORSCHE` | `buildPorscheGT3RS` | 8 | super |
| `MCLAREN` | `buildMcLarenP1` | 9 | super |
| `KOENIGSEGG` | `buildKoenigseggJesko` | 11 | super |
| `RED BULL` | `buildRedBullRBF1` | 4 | f1 |
| `MERCEDES` | `buildMercedesW14F1` | 10 | f1 |
| `FORD` | `buildFordMustang` | 5 | muscle |
| `TESLA` | `buildTeslaModelS` | 6 | electric |

### 1.2 Gemeenschappelijke signature

Elke builder heeft de signature:

```js
function build<Brand>(g, def, mats, lod)
```

- `g` — leeg `THREE.Group()` aangemaakt door `makeCar()` (build.js:55). De builder voegt body-meshes toe; wheels worden NA de builder toegevoegd door `buildAllWheels()`.
- `def` — entry uit `CAR_DEFS` (id, brand, name, color, accent, type, topSpd, accel, hdlg, nitro)
- `mats` — `Object.assign({}, getSharedCarMats(), makePaintMats(def))` (build.js:58). Bevat keys: `glass`, `glassDark`, `chrome`, `blk`, `matBlk`, `grille`, `tire`, `rim`, `brakeRed`, `brakeDisc`, `head`, `tail`, `indicator`, `paint`, `accent`.
- `lod` — string `'low'` of `'high'` uit `carLOD()`. `'low'` skipt details zoals slats, stripes, vents, hood-creases, secondary lights.
- **Return value**: niets (mutates `g` in plaats).

`_buildF1Common(g, def, mats, lod)` (regel 528-564) is een helper voor F1-cars; geen entry in `BRAND_BUILDERS`. Wordt aangeroepen door `buildRedBullRBF1` en `buildMercedesW14F1`.

### 1.3 Per-builder geometrie-tabellen

Tellingen zijn voor **high LOD** (alle `if(!lo)` blokken inclusief). Geometry-counts tellen unieke `new THREE.X()`-aanroepen — niet de meshes (een geometry kan meerdere meshes voeden via `[-x,x].forEach`). `addPart()` maakt elk een mesh van een verse geometry.

#### `buildFerrariSF90` (regel 18-91)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Lower chassis | 21 | BoxGeometry | paint |
| Side rocker | 24 | BoxGeometry | matBlk |
| Front nose | 27 | BoxGeometry | paint |
| Front splitter | 29 | BoxGeometry | matBlk |
| Hood | 31 | BoxGeometry | paint |
| Front grille | 33 | BoxGeometry | grille |
| Headlights (helper) | 35 | → `buildHeadlights` | head |
| Cabin | 37 | BoxGeometry | paint |
| Windshield | 39 | BoxGeometry | glass |
| Side windows ×2 | 42 | BoxGeometry | glass |
| Rear glass | 45 | BoxGeometry | glassDark |
| Roof | 47 | BoxGeometry | paint |
| Engine cover | 49 | BoxGeometry | paint |
| Engine slats ×3 | 53 | BoxGeometry | matBlk |
| Wheel arches (helper, ×4) | 57-59 | → `buildWheelArches` | paint |
| Side intake outer ×2 | 63 | BoxGeometry | matBlk |
| Side intake inner ×2 | 64 | BoxGeometry | grille |
| Side vents (helper) | 66 | → `buildSideVents` | blk |
| Rear bumper | 69 | BoxGeometry | paint |
| Diffuser plate | 71 | BoxGeometry | matBlk |
| Diffuser fins ×4 | 74 | BoxGeometry | blk |
| Spoiler stands ×2 | 79 | BoxGeometry | matBlk |
| Spoiler plate | 81 | BoxGeometry | paint |
| Spoiler underside | 83 | BoxGeometry | matBlk |
| Tail lights (helper) | 86 | → `buildTaillights` | tail |
| Exhausts (helper) | 88 | → `buildExhausts` (Cylinder) | chrome |
| Side skirts (helper) | 90 | → `buildSideSkirts` | matBlk |

Geometry-types: BoxGeometry ×~30 unieke calls + 2 SphereGeometry (in `buildWheelArches`) + 1 CylinderGeometry (in `buildExhausts`) + 1 BoxGeometry (in `buildHeadlights`/`buildTaillights`/`buildSideSkirts`/`buildSideVents` elk).
Helpers: `buildHeadlights`, `buildWheelArches`, `buildSideVents`, `buildTaillights`, `buildExhausts`, `buildSideSkirts`.
Estimated body triangle count (high LOD, ex-wheels): **~700-800 tris** (≈30 box-meshes × 12 tri + 4 sphere-arches × ~120 tri + ~6 cyl-meshes × ~16 tri).

#### `buildBugattiChiron` (regel 97-153)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Wide chassis | 100 | BoxGeometry | paint |
| Front clamshell | 102-104 | SphereGeometry (12,8 segs, half-sphere) | paint |
| Front splitter | 106 | BoxGeometry | matBlk |
| Hood | 108 | BoxGeometry | paint |
| Horseshoe grille | 110 | BoxGeometry | grille |
| Grille rim (gold) | 112 | BoxGeometry | accent |
| Headlights (helper) | 114 | → `buildHeadlights` | head |
| Cabin (accent kleur!) | 118 | BoxGeometry | accent |
| Windshield | 119 | BoxGeometry | glass |
| Side windows ×2 | 120 | BoxGeometry | glass |
| Rear glass | 121 | BoxGeometry | glassDark |
| Roof (accent) | 122 | BoxGeometry | accent |
| Engine cover | 124 | BoxGeometry | paint |
| C-line side accent ×2 | 128 | BoxGeometry | matBlk |
| Upper accent dot ×2 | 129 | BoxGeometry | accent |
| Lower accent dot ×2 | 130 | BoxGeometry | accent |
| Wheel arches (helper) | 133 | → `buildWheelArches` | paint |
| Rear bumper | 137 | BoxGeometry | paint |
| Rear diffuser plate | 139 | BoxGeometry | matBlk |
| Rear spoiler | 142 | BoxGeometry | matBlk |
| Tail lights (helper) | 144 | → `buildTaillights` | tail |
| Centre exhaust | 146 | CylinderGeometry (10 segs) | chrome |
| Exhaust ring | 149 | TorusGeometry (5,12 segs) | chrome |
| Side skirts (helper) | 152 | → `buildSideSkirts` | matBlk |

Geometry-types: BoxGeometry, SphereGeometry, CylinderGeometry, TorusGeometry. Geen `buildExhausts` helper (custom centre exhaust).
Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildSideSkirts`.
Estimated body triangles: **~700-800 tris**.

#### `buildLamborghiniHuracan` (regel 159-227)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Lower chassis | 162 | BoxGeometry | paint |
| Pointed front | 164 | BoxGeometry | paint |
| Front splitter | 166 | BoxGeometry | matBlk |
| Hood | 168 | BoxGeometry | paint |
| Hood crease | 171 | BoxGeometry | matBlk |
| Front intakes ×2 | 175 | BoxGeometry | grille |
| Headlights (helper) | 177 | → `buildHeadlights` | head |
| Cabin | 179 | BoxGeometry | paint |
| Windshield | 181 | BoxGeometry | glass |
| Side windows ×2 | 182 | BoxGeometry | glass |
| Rear glass | 184 | BoxGeometry | glassDark |
| Flat roof | 186 | BoxGeometry | paint |
| Engine cover | 188 | BoxGeometry | paint |
| Engine bay vents ×3 | 192 | BoxGeometry | matBlk |
| Side intake outer ×2 | 198 | BoxGeometry | matBlk |
| Side intake inner ×2 | 199 | BoxGeometry | accent |
| Wheel arches (helper) | 202 | → `buildWheelArches` | paint |
| Rear bumper | 206 | BoxGeometry | paint |
| Diffuser plate | 208 | BoxGeometry | matBlk |
| Diffuser fins ×5 | 210 | BoxGeometry | blk |
| Tail lights (helper) | 213 | → `buildTaillights` | tail |
| Quad exhausts (high LOD ×4) | 217 | CylinderGeometry (8 segs) — **per-instance** | chrome |
| Exhausts (low LOD helper) | 221 | → `buildExhausts` | chrome |
| Spoiler stands ×2 | 224 | BoxGeometry | matBlk |
| Spoiler plate | 225 | BoxGeometry | paint |
| Side skirts (helper) | 226 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildExhausts` (low LOD only), `buildSideSkirts`.
**Note**: high LOD bouwt 4 individuele exhaust cylinders (regel 217), niet via helper.
Estimated body triangles: **~750-850 tris**.

#### `buildMaseratiMC20` (regel 233-280)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Slim chassis | 236 | BoxGeometry | paint |
| Long front | 238 | BoxGeometry | paint |
| Front splitter | 239 | BoxGeometry | matBlk |
| Trident grille | 242 | BoxGeometry | grille |
| Trident slats ×3 | 243 | BoxGeometry | accent |
| Hood | 246 | BoxGeometry | paint |
| Headlights (helper) | 247 | → `buildHeadlights` | head |
| Cabin | 249 | BoxGeometry | paint |
| Windshield | 250 | BoxGeometry | glass |
| Side windows ×2 | 251 | BoxGeometry | glass |
| Rear glass | 253 | BoxGeometry | glassDark |
| Roof | 254 | BoxGeometry | paint |
| Engine cover | 256 | BoxGeometry | paint |
| Door-line stripe ×2 | 260 | BoxGeometry | accent |
| Subtle side intake ×2 | 263 | BoxGeometry | matBlk |
| Wheel arches (helper) | 265 | → `buildWheelArches` | paint |
| Rear bumper | 269 | BoxGeometry | paint |
| Diffuser plate | 271 | BoxGeometry | matBlk |
| Spoiler | 274 | BoxGeometry | matBlk |
| Tail lights (helper) | 276 | → `buildTaillights` | tail |
| Exhausts (helper) | 278 | → `buildExhausts` | chrome |
| Side skirts (helper) | 279 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildExhausts`, `buildSideSkirts`.
Estimated body triangles: **~600-700 tris**.

#### `buildAudiR8` (regel 286-337)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Long chassis | 289 | BoxGeometry | paint |
| Squared front | 291 | BoxGeometry | paint |
| Splitter | 292 | BoxGeometry | matBlk |
| Single-frame grille | 295 | BoxGeometry | grille |
| Grille accent rim | 296 | BoxGeometry | accent |
| Hood | 299 | BoxGeometry | paint |
| Headlights (helper) | 301 | → `buildHeadlights` | head |
| Cabin | 303 | BoxGeometry | paint |
| Windshield | 304 | BoxGeometry | glass |
| Side windows ×2 | 305 | BoxGeometry | glass |
| Rear glass | 306 | BoxGeometry | glassDark |
| Roof | 307 | BoxGeometry | paint |
| Engine cover | 309 | BoxGeometry | paint |
| Side blade outer ×2 | 313 | BoxGeometry | matBlk |
| Side blade inner ×2 | 314 | BoxGeometry | accent |
| Wheel arches (helper) | 317 | → `buildWheelArches` | paint |
| Rear bumper | 320 | BoxGeometry | paint |
| Diffuser | 322 | BoxGeometry | matBlk |
| Spoiler lip | 325 | BoxGeometry | matBlk |
| Tail lights (helper) | 326 | → `buildTaillights` | tail |
| Oval exhausts (high LOD ×2, scaled) | 330 | CylinderGeometry (10 segs) — **per-instance, scaled** | chrome |
| Exhausts (low LOD helper) | 334 | → `buildExhausts` | chrome |
| Side skirts (helper) | 336 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildExhausts` (low LOD only), `buildSideSkirts`.
**Note**: high LOD scales x by 1.4 to fake oval exhausts.
Estimated body triangles: **~600-700 tris**.

#### `buildPorscheGT3RS` (regel 344-396)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Chassis | 346 | BoxGeometry | paint |
| Clamshell front | 348-350 | SphereGeometry (12,8 segs) | paint |
| Front splitter | 352 | BoxGeometry | matBlk |
| Air dam grilles ×2 | 354 | BoxGeometry | grille |
| Round headlights ×2 (high LOD) | 359 | CylinderGeometry (12 segs) — **per-instance** | head |
| Headlights (low LOD helper) | 363 | → `buildHeadlights` | head |
| Cabin | 366 | BoxGeometry | paint |
| Windshield | 367 | BoxGeometry | glass |
| Side windows ×2 | 368 | BoxGeometry | glass |
| Rear glass | 370 | BoxGeometry | glassDark |
| Roof | 371 | BoxGeometry | paint |
| Rear deck | 373 | BoxGeometry | paint |
| Side blade ×2 | 376 | BoxGeometry | accent |
| Wheel arches (helper) | 378 | → `buildWheelArches` | paint |
| Rear bumper | 381 | BoxGeometry | paint |
| Diffuser | 383 | BoxGeometry | matBlk |
| Wing stands ×2 | 386 | BoxGeometry | matBlk |
| Wing plate | 387 | BoxGeometry | paint |
| Wing underside | 389 | BoxGeometry | matBlk |
| Wing endplates ×2 | 390 | BoxGeometry | matBlk |
| Tail lights (helper) | 392 | → `buildTaillights` | tail |
| Twin centre exhausts (helper) | 394 | → `buildExhausts` | chrome |
| Side skirts (helper) | 395 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights` (low LOD only), `buildWheelArches`, `buildTaillights`, `buildExhausts`, `buildSideSkirts`.
**Note**: high LOD bouwt round headlights als cylinders (CylinderGeometry, 12 segs).
Estimated body triangles: **~700-800 tris**.

#### `buildMcLarenP1` (regel 403-458)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Chassis | 405 | BoxGeometry | paint |
| Pointed nose | 407 | BoxGeometry | paint |
| Nose-cut block | 410 | BoxGeometry | matBlk |
| Front splitter | 412 | BoxGeometry | matBlk |
| Front grilles ×2 | 414 | BoxGeometry | grille |
| Headlights (helper) | 416 | → `buildHeadlights` | head |
| Hood | 418 | BoxGeometry | paint |
| Hood vents ×2 | 420 | BoxGeometry | matBlk |
| Cabin | 423 | BoxGeometry | paint |
| Windshield | 424 | BoxGeometry | glass |
| Side windows ×2 | 425 | BoxGeometry | glass |
| Rear glass | 426 | BoxGeometry | glassDark |
| Roof | 427 | BoxGeometry | paint |
| Engine cover | 429 | BoxGeometry | paint |
| Engine slats ×4 | 431 | BoxGeometry | matBlk |
| Side intake outer ×2 | 436 | BoxGeometry | matBlk |
| Side intake inner ×2 | 437 | BoxGeometry | accent |
| Wheel arches (helper) | 440 | → `buildWheelArches` | paint |
| Rear bumper | 443 | BoxGeometry | paint |
| Diffuser plate | 445 | BoxGeometry | matBlk |
| Diffuser fins ×3 | 446 | BoxGeometry | blk |
| Wing stands ×2 | 449 | BoxGeometry | matBlk |
| Wing plate | 450 | BoxGeometry | paint |
| Wing underside | 452 | BoxGeometry | matBlk |
| Tail lights (helper) | 454 | → `buildTaillights` | tail |
| Exhausts (helper) | 456 | → `buildExhausts` | chrome |
| Side skirts (helper) | 457 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildExhausts`, `buildSideSkirts`.
Estimated body triangles: **~750-850 tris**.

#### `buildKoenigseggJesko` (regel 464-521)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Chassis | 466 | BoxGeometry | paint |
| Pointed front | 468 | BoxGeometry | paint |
| Splitter | 469 | BoxGeometry | matBlk |
| Grille | 471 | BoxGeometry | grille |
| Grille tabs ×4 | 472 | BoxGeometry | accent |
| Headlights (helper) | 474 | → `buildHeadlights` | head |
| Hood | 475 | BoxGeometry | paint |
| Cabin | 477 | BoxGeometry | paint |
| Windshield | 478 | BoxGeometry | glass |
| Side windows ×2 | 479 | BoxGeometry | glass |
| Rear glass | 480 | BoxGeometry | glassDark |
| Roof | 481 | BoxGeometry | paint |
| Roof scoop body | 484 | BoxGeometry | matBlk |
| Roof scoop accent | 485 | BoxGeometry | accent |
| Engine cover | 488 | BoxGeometry | paint |
| Side intakes ×2 | 492 | BoxGeometry | matBlk |
| Wheel arches (helper) | 495 | → `buildWheelArches` | paint |
| Rear bumper | 498 | BoxGeometry | paint |
| Diffuser plate | 500 | BoxGeometry | matBlk |
| Diffuser fins ×4 | 501 | BoxGeometry | blk |
| Wing stands ×2 | 504 | BoxGeometry | matBlk |
| Wing plate | 505 | BoxGeometry | paint |
| Wing underside | 507 | BoxGeometry | matBlk |
| Wing endplates ×2 | 508 | BoxGeometry | matBlk |
| Tail lights (helper) | 510 | → `buildTaillights` | tail |
| Quad exhausts (high LOD ×4) | 514 | CylinderGeometry (8 segs) — **per-instance** | chrome |
| Exhausts (low LOD helper) | 518 | → `buildExhausts` | chrome |
| Side skirts (helper) | 520 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildExhausts` (low LOD only), `buildSideSkirts`.
Estimated body triangles: **~750-850 tris**.

#### `_buildF1Common` (regel 528-564) — shared F1 base

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Chassis tub | 531 | BoxGeometry | paint |
| Bargeboards/floor | 534 | BoxGeometry | matBlk |
| Sidepods ×2 | 538 | BoxGeometry | paint |
| Sidepod intakes ×2 | 541 | BoxGeometry | grille |
| Cockpit collar | 545 | BoxGeometry | matBlk |
| Halo bar | 548 | TorusGeometry (6,16 segs) | chrome |
| Halo strut | 551 | BoxGeometry | chrome |
| Engine airbox | 554 | BoxGeometry | paint |
| Airbox intake | 556 | BoxGeometry | matBlk |
| Engine cover | 559 | BoxGeometry | paint |
| Camera mount | 562 | BoxGeometry | matBlk |

Geen helpers aangeroepen (F1 cars hebben geen wheel arches / side skirts / exhausts).

#### `buildRedBullRBF1` (regel 570-603)

Roept eerst `_buildF1Common`. Daarna:

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Pointed nose | 574-576 | CylinderGeometry (10 segs, taper) | paint |
| Front wing plate | 578 | BoxGeometry | paint |
| Front wing upper | 580 | BoxGeometry | accent |
| Front wing endplates ×2 | 582 | BoxGeometry | matBlk |
| Front wing strakes ×3 | 584 | BoxGeometry | matBlk |
| Rear wing pillars ×2 | 587 | BoxGeometry | matBlk |
| Rear wing plate | 588 | BoxGeometry | paint |
| Rear wing upper flap | 590 | BoxGeometry | accent |
| Rear wing endplates ×2 | 591 | BoxGeometry | matBlk |
| DRS pod / rain light | 595 | BoxGeometry | tail |
| Sidepod accent stripes ×2 | 600 | BoxGeometry | accent |

Geen `buildHeadlights/Taillights/Exhausts/SideSkirts/WheelArches` aanroepen.
Estimated body triangles (incl. `_buildF1Common`): **~400-500 tris**.

#### `buildMercedesW14F1` (regel 609-644)

Roept eerst `_buildF1Common`. Daarna:

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Slimmer nose | 613-615 | CylinderGeometry (10 segs, taper) | paint |
| Front wing plate | 617 | BoxGeometry | paint |
| Front wing flap 1 | 619 | BoxGeometry | chrome |
| Front wing flap 2 | 620 | BoxGeometry | chrome |
| Front wing endplates ×2 | 621 | BoxGeometry | matBlk |
| Front wing strakes ×3 | 622 | BoxGeometry | matBlk |
| Rear wing pillars ×2 | 625 | BoxGeometry | matBlk |
| Rear wing plate | 626 | BoxGeometry | paint |
| Rear wing upper | 628 | BoxGeometry | chrome |
| Rear wing endplates ×2 | 629 | BoxGeometry | matBlk |
| DRS pod | 633 | BoxGeometry | tail |
| Sidepod chrome stripes ×2 | 638 | BoxGeometry | chrome |
| Star horizontal | 641 | BoxGeometry | chrome |
| Star vertical | 642 | BoxGeometry | chrome |

Estimated body triangles (incl. `_buildF1Common`): **~450-550 tris**.

#### `buildFordMustang` (regel 651-725)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Chassis | 654 | BoxGeometry | paint |
| Front bumper | 656 | BoxGeometry | paint |
| Lower black trim | 657 | BoxGeometry | matBlk |
| Big grille | 659 | BoxGeometry | grille |
| Pony badge | 662 | BoxGeometry | accent |
| Grille slats ×3 | 664 | BoxGeometry | matBlk |
| Headlights (helper) | 667 | → `buildHeadlights` | head |
| Inner DRL bars (×2 sides × 3) | 671 | BoxGeometry | head |
| Hood | 675 | BoxGeometry | paint |
| Hood scoop body | 678 | BoxGeometry | paint |
| Scoop opening | 679 | BoxGeometry | matBlk |
| Cabin | 682 | BoxGeometry | paint |
| Windshield | 683 | BoxGeometry | glass |
| Side windows ×2 | 684 | BoxGeometry | glass |
| Rear glass | 686 | BoxGeometry | glass |
| Roof | 687 | BoxGeometry | paint |
| Trunk lid | 689 | BoxGeometry | paint |
| Wheel arches (helper) | 691 | → `buildWheelArches` | paint |
| Rear bumper | 695 | BoxGeometry | paint |
| Lower rear trim | 697 | BoxGeometry | matBlk |
| Three-bar tail lights (×2 × 3) | 702 | BoxGeometry | tail |
| Tail lights (low LOD helper) | 705 | → `buildTaillights` | tail |
| Exhausts (helper) | 708 | → `buildExhausts` | chrome |
| Hood stripes ×2 | 717 | BoxGeometry | accent |
| Roof stripes ×2 | 719 | BoxGeometry | accent |
| Trunk stripes ×2 | 721 | BoxGeometry | accent |
| Side skirts (helper) | 724 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights` (low LOD only), `buildExhausts`, `buildSideSkirts`.
Estimated body triangles: **~700-800 tris** (3-stripe livery telt zwaar).

#### `buildTeslaModelS` (regel 732-788)

| Onderdeel | Regel | Geometry | Mat key |
|---|---|---|---|
| Chassis | 735 | BoxGeometry | paint |
| Smooth front | 737 | BoxGeometry | paint |
| Lower air intake | 740 | BoxGeometry | matBlk |
| Front splitter | 743 | BoxGeometry | matBlk |
| Headlights (helper) | 745 | → `buildHeadlights` | head |
| LED light strips ×2 | 748 | BoxGeometry | head |
| Hood | 751 | BoxGeometry | paint |
| Cabin | 753 | BoxGeometry | paint |
| Windshield | 754 | BoxGeometry | glass |
| Side windows ×2 | 755 | BoxGeometry | glass |
| Glass roof centre | 757 | BoxGeometry | glassDark |
| Front roof rail | 758 | BoxGeometry | paint |
| Rear roof rail | 759 | BoxGeometry | paint |
| Rear glass | 761 | BoxGeometry | glassDark |
| Trunk lid | 763 | BoxGeometry | paint |
| Wheel arches (helper) | 765 | → `buildWheelArches` | paint |
| Door handles ×2 (front + rear) | 771-772 | BoxGeometry | chrome |
| Rear bumper | 776 | BoxGeometry | paint |
| Lower rear trim | 778 | BoxGeometry | matBlk |
| Tail lights (helper) | 781 | → `buildTaillights` | tail |
| Connecting light bar | 784 | BoxGeometry | tail |
| Side skirts (helper) | 787 | → `buildSideSkirts` | matBlk |

Helpers: `buildHeadlights`, `buildWheelArches`, `buildTaillights`, `buildSideSkirts`. **Geen `buildExhausts`** (electric).
Estimated body triangles: **~650-750 tris**.

### 1.4 Materials per builder

Alle builders schrijven naar materials uit één gedeelde `mats` object dat `getSharedCarMats()` (gedeeld) + `makePaintMats(def)` (per-instance) combineert. Geen builder maakt zelf nieuwe materialen — dus alle paint variations komen van `def.color` / `def.accent`.

| Mat key | Type (desktop) | Type (mobile) | Kleur | metalness | roughness | envMap | Special |
|---|---|---|---|---|---|---|---|
| `glass` | MeshStandardMaterial | MeshLambertMaterial | 0x0a1a2a | 0.0 | 0.05 | 0.85 | transparent .72 |
| `glassDark` | MeshStandardMaterial | MeshLambertMaterial | 0x040810 | 0.0 | 0.10 | 0.75 | transparent .86 |
| `chrome` | MeshStandardMaterial | MeshLambertMaterial | 0xdddddd | 1.0 | 0.18 | 1.0 | — |
| `blk` | MeshStandardMaterial | MeshLambertMaterial | 0x050505 | 0.0 | 0.75 | 0.30 | — |
| `matBlk` | MeshStandardMaterial | MeshLambertMaterial | 0x101012 | 0.0 | 0.85 | 0.25 | — |
| `grille` | MeshStandardMaterial | MeshLambertMaterial | 0x1a1a1c | 0.4 | 0.55 | 0.40 | — |
| `tire` | MeshStandardMaterial | MeshLambertMaterial | 0x080808 | 0.0 | 0.95 | 0.10 | — |
| `rim` | MeshStandardMaterial | MeshLambertMaterial | 0xc0c0c8 | 0.85 | 0.30 | 0.85 | — |
| `brakeRed` | MeshStandardMaterial | MeshLambertMaterial | 0xcc1010 | 0.0 | 0.85 | 0.30 | — |
| `brakeDisc` | MeshStandardMaterial | MeshLambertMaterial | 0x282828 | 0.7 | 0.40 | 0.65 | — |
| `head` | MeshStandardMaterial | MeshLambertMaterial | 0xfff8e8 | 0.1 | 0.30 | 0.40 | emissive 0xffe8a8, intensity .6 |
| `tail` | MeshStandardMaterial | MeshLambertMaterial | 0xff1010 | 0.1 | 0.30 | 0.35 | emissive 0xcc0000, intensity .45 |
| `indicator` | MeshStandardMaterial | MeshLambertMaterial | 0xff7e10 | 0.1 | 0.30 | 0.35 | emissive 0xff5500, intensity .35 |
| `paint` (per-car) | MeshStandardMaterial | MeshPhongMaterial | def.color | 0.65 | 0.22 | 0.85 | — (mobile: shininess 120) |
| `accent` (per-car) | MeshStandardMaterial | MeshLambertMaterial | def.accent | 0.50 | 0.35 | 0.65 | — |

Alle desktop-PBR materialen krijgen `userData._carPBR=true`. Shared materialen krijgen `userData._sharedAsset=true` zodat `disposeScene` ze niet vrijgeeft.

`MeshPhysicalMaterial` wordt **nergens** gebruikt (commentaar regel 119-122 in car-parts.js: "three r134 has no MeshPhysicalMaterial.clearcoat in this build path").

---

## 2. `car-parts.js` — helpers

### 2.1 Material setup

| Functie | Signature | Returns / muteert | Shared materials | Per-instance | Disposal |
|---|---|---|---|---|---|
| `_carMat(opts)` | `{color, metalness?, roughness?, transparent?, opacity?, emissive?, emissiveIntensity?, envMapIntensity?}` | nieuwe `MeshStandardMaterial` (desktop) / `MeshLambertMaterial` (mobile) | n/a | n/a — caller bepaalt | n/a |
| `getSharedCarMats()` | geen | `{glass, glassDark, chrome, blk, matBlk, grille, tire, rim, brakeRed, brakeDisc, head, tail, indicator}` | bouwt singleton `_carShared` | nee | flagged `_sharedAsset`; survives `disposeScene`; `disposeSharedCarMats()` voor full reset |
| `disposeSharedCarMats()` | geen | sets `_carShared=null`, disposes alle 13 materialen, clears `window._headlightMats` | — | — | **caller-driven**; momenteel geen caller in codebase |
| `syncHeadlights(intensity)` | `intensity:number` | mutates `m.emissiveIntensity` op alle `window._headlightMats` | reads shared head-mat | nee | — |
| `makePaintMats(def)` | `def:{color,accent}` | `{paint, accent: accentMat}` | nee | beide nieuw per call | **niet expliciet** — meshes refereren via group; assumed to be GC'd met group |

### 2.2 Mesh-builder helpers

| Functie | Signature | Returns / muteert | Shared materials | Per-instance | Disposal |
|---|---|---|---|---|---|
| `addPart(group, geo, mat, x, y, z, rx?, ry?, rz?)` | mesh-spawn helper | returns nieuwe `Mesh`, parented op `group`, `castShadow=true` | gebruikt aangeleverde mat | nieuwe mesh + verse geometry per call | parent group disposal |
| `buildWheel(group, x, y, z, radius, width, mats, lod)` | bouwt 1 wheel sub-group | returns `wheelGroup` (Group); voegt tire+rim+spokes+disc als kinderen toe; caliper als sibling op `group` | gebruikt `mats.tire`, `mats.rim`, `mats.brakeDisc`, `mats.brakeRed` | verse cylinder + box geos per wheel | parent disposal |
| `buildAllWheels(group, def, mats, lod, posOverride?)` | spawned 4 wheels | mutates `group.userData.wheels[]`, `group.userData.wheelFL/FR/RL/RR` | shared via `mats` | wheel-geos per call | parent disposal |
| `buildHeadlights(group, mats, opts)` | `opts:{spread,y,z,w,h,d}` | spawned 2 emissive boxes; **shared geometry** binnen 1 call | gebruikt `mats.head` | 1 BoxGeometry **gedeeld over 2 meshes** binnen call; verse geo per call | parent disposal |
| `buildTaillights(group, mats, opts)` | id. | id., met `mats.tail` | id. | id. | id. |
| `buildExhausts(group, mats, opts)` | `opts:{spread,y,z,radius,length}` | 2 chrome cylinders, gedeelde geo binnen call | `mats.chrome` | 1 CylinderGeometry gedeeld over 2 meshes | id. |
| `buildSideVents(group, mats, opts)` | id. | 2 blk boxen, gedeelde geo | `mats.blk` | id. | id. |
| `buildWheelArches(group, paintMat, opts)` | `opts:{positions[]}` | 4 platte hemisphere arches (default) — gedeelde SphereGeometry, 4 meshes geschaald | per-instance `paintMat` (uit `makePaintMats`) | 1 SphereGeometry gedeeld over alle arches binnen call | id. |
| `buildSideSkirts(group, mats, opts)` | `opts:{spread,y,z,length}` | 2 matBlk boxen, gedeelde geo | `mats.matBlk` | 1 BoxGeometry gedeeld over 2 meshes | id. |
| `carLOD()` | geen | returns `'low' \| 'high'` | reads `window._isMobile`, `window._lowQuality` | — | — |

**Disposal samenvatting**: er is geen expliciete per-mesh / per-geometry dispose in `car-parts.js`. Geometries worden GC'd wanneer hun parent group uit `scene` wordt verwijderd door `makeAllCars()` (zie `build.js:66`: `carObjs.forEach(c=>scene.remove(c.mesh))`) — maar `scene.remove()` alleen disposed geen Three.js resources. Materials zijn gedeeld via `_sharedAsset` flag en overleven `disposeScene`. **Geometries worden niet expliciet vrijgegeven**.

### 2.3 Globals geëxposeerd op `window`

`getSharedCarMats`, `disposeSharedCarMats`, `syncHeadlights`, `makePaintMats`, `addPart`, `buildWheel`, `buildAllWheels`, `buildHeadlights`, `buildTaillights`, `buildExhausts`, `buildSideVents`, `buildWheelArches`, `buildSideSkirts`, `carLOD`, `_headlightMats`.

---

## 3. `build.js`

### 3.1 LOD-setup

**Geen `THREE.LOD` object. Geen distance-based switching.** LOD is een globale boolean `'low' | 'high'` uit `carLOD()`:

```js
function carLOD(){
  return (window._isMobile || window._lowQuality) ? 'low' : 'high';
}
```

| LOD niveau | Trigger | Wat is anders |
|---|---|---|
| `'low'` | `_isMobile === true` OR `_lowQuality === true` | Builders skippen `if(!lo){ ... }` blokken (slats, accent stripes, hood-creases, secondary lights, sidepod intakes, wing endplates, exhaust ringen, F1-bargeboards, hexagonal vents, etc.). Wheel-build skipt rim+spokes+caliper+disc, halveert tire-segs (16→8). Player headlight beam-cones gebruiken 16×4 segs i.p.v. 32×8. |
| `'high'` | desktop, `_lowQuality !== true` | Volledige detail. |

**Niveau wordt 1× per `makeCar()` bepaald** (build.js:49). Eenmaal gebouwd verandert LOD niet — een runtime-flip vereist een rebuild via `makeAllCars()`.

### 3.2 `makeCar(def)` — entry point (regel 48-62)

| Stap | Regel | Wat |
|---|---|---|
| 1. Bepaal LOD | 49 | `carLOD()` → 'low' \| 'high' |
| 2. Lookup builder | 50 | `BRAND_BUILDERS[def.brand]` — gooit Error als niet gevonden (51-54) |
| 3. Maak group | 55 | `new THREE.Group()` (leeg) |
| 4. Mats | 56-58 | `Object.assign({}, getSharedCarMats(), makePaintMats(def))` |
| 5. Bouw body | 59 | `brandBuilder(g, def, mats, lod)` |
| 6. Wheels | 60 | `buildAllWheels(g, def, mats, lod)` (geen posOverride) |
| 7. Return | 61 | `g` (Group) |

### 3.3 Scene-graph parent-child structuur na `makeCar()`

```
mesh (THREE.Group) — added to `scene` by makeAllCars (build.js:106)
├── ~30-50 body Meshes (BoxGeometry / SphereGeometry / CylinderGeometry / TorusGeometry)
│   — direct kinderen op de top-level group (geen body-subgroup)
├── 4× wheelGroup (THREE.Group) — userData.wheels[0..3]
│   ├── tire Mesh (CylinderGeometry, axis along world-X due to wheelGroup.rotation.z=π/2)
│   ├── rim Mesh (CylinderGeometry, only if lod≠'low')
│   ├── 5× spoke Mesh (BoxGeometry, only if lod≠'low')
│   └── brakeDisc Mesh (CylinderGeometry, only if lod≠'low')
├── 4× caliper Mesh (BoxGeometry) — sibling van wheelGroup, NIET binnen wheelGroup, only if lod≠'low'
│   — geplaatst op (x, y-.08, z) = direct onder de wheel
├── reverseLight Mesh (BoxGeometry, MeshLambertMaterial own — NIET shared) — added by makeAllCars (build.js:111-114)
├── livery underglow Mesh (CircleGeometry, MeshBasicMaterial own — NIET shared) — only AI, only world ≠ grandprix (build.js:130-132)
└── 2× headlight beam-cone Mesh (ConeGeometry) — only player (build.js:151-162)
    — userData.isHeadBeam=true, userData.flickerPhase
    — material: `MeshBasicMaterial` cloned per beam (line 153: beamMat.clone())
    — texture: `_softHeadlightTex` (CanvasTexture, 128×128 alpha radial gradient, _sharedAsset=true)
```

Top-level group `userData`:
- `wheels` — array van 4 wheelGroups
- `wheelFL` / `wheelFR` / `wheelRL` / `wheelRR` — references naar dezelfde wheelGroups (alias)

`carObjs[i]` (data wrapper) — dit is **NIET** `mesh.userData`, maar een aparte JS-object:
- `mesh` (de Group)
- `speed`, `vy`, `progress`, `prevProg`, `lap`, `isPlayer`, `def`, `finished`
- `boostTimer`, `spinTimer`, `inAir`, `lateralOff`, `bestLap`, `_lapStart`, `_finishTime`
- `tireWear`, `hitCount`, `smokeSrc`, `_personality`
- (init in build.js:168-170)

### 3.4 `addPart` signature (gedefinieerd in `car-parts.js`)

```js
function addPart(group, geo, mat, x, y, z, rx, ry, rz)
```

- Wraps `new THREE.Mesh(geo, mat)`.
- Sets `position` van `(x||0, y||0, z||0)`.
- Sets `rotation` als minstens één van `rx/ry/rz` truthy is — anders default 0.
- Sets `castShadow = true` op de mesh.
- Parents op `group` via `group.add(m)`.
- Returns de mesh.

**Note**: `castShadow` is altijd `true`, ongeacht of de scene shadows aan heeft. `receiveShadow` wordt niet gezet.

### 3.5 `makeAllCars()` overzicht (regel 65-179)

| Stap | Regel | Wat |
|---|---|---|
| Cleanup | 66-67 | `scene.remove` op alle bestaande, clear `_reverseLights` |
| Volgorde | 69-70 | Player op pole, AI in def-volgorde erna |
| Grid | 75-86 | Per-world `_worldGridT[activeWorld]` bepaalt waar de grid staat (start-T langs `trackCurve`) |
| Per-car loop | 87-171 | makeCar → position via `trackCurve.getPoint/getTangent` → 2-wide stagger → reverse light → AI underglow OR player headlight beams |
| Reset state | 173-178 | near-miss cooldowns, pit-stop flags, fastest lap |

---

## 4. `physics.js` — leesbare interface (NIET aanraken)

### 4.1 Hardcoded mesh-name / child-index references

`physics.js` raakt **geen** child-indices direct aan. Alleen één userData-key.

| Reference | Regel | Type | Bron (set-locatie) |
|---|---|---|---|
| `car.mesh.userData.wheels` | 328 (`spinWheels`) | array iteration | `buildAllWheels` (car-parts.js:213-217) |

**Geen `car.mesh.children[N]` access. Geen mesh-name lookups (`getObjectByName`). Geen referenties naar `wheelFL/FR/RL/RR` aliases binnen physics.js** — die staan op userData maar worden in deze file niet gelezen (set-only in car-parts.js, gelezen in andere files).

### 4.2 userData-keys gelezen / geset op auto-meshes

| Key | Locatie | R/W | Door |
|---|---|---|---|
| `mesh.userData.wheels` | car-parts.js:213, 216-217 | W (init), R (loop) | `buildAllWheels` (W); `spinWheels` (R, physics.js:328) |
| `mesh.userData.wheelFL` | car-parts.js:221 | W | `buildAllWheels`. **Niet gelezen door physics.js**. |
| `mesh.userData.wheelFR` | car-parts.js:222 | W | id. |
| `mesh.userData.wheelRL` | car-parts.js:223 | W | id. |
| `mesh.userData.wheelRR` | car-parts.js:224 | W | id. |
| `mesh.userData.isHeadBeam` (op beam-child, niet op auto zelf) | build.js:159 | W | gelezen in `js/effects/night.js:196` (NIET in physics.js) |
| `mesh.userData.flickerPhase` (op beam-child) | build.js:160 | W | gelezen in night.js |

`physics.js` schrijft **geen** keys naar `mesh.userData`. Alle per-frame state staat op de `carObjs[i]` wrapper-object (zie 3.3 hierboven), niet op `mesh.userData`.

### 4.3 Wat `physics.js` op `car.mesh` direct muteert (niet via userData)

| Property | Lokatie in physics.js | Operatie |
|---|---|---|
| `car.mesh.position.y` | 82, 130, 133 | suspension bounce, gravity, landing |
| `car.mesh.position` (xyz) | 146 | `addScaledVector(fwd, car.speed)` |
| `car.mesh.rotation.y` | 108, 112, 113 | spin pad, lft/rgt steer |
| `car.mesh.rotation.z` | 121 | tilt-into-corner |
| `car.mesh.rotation.x` | 122 | pitch on accel/brake |
| `car.mesh.quaternion` | 137, 144, 159, 186, 275-276 | reads via `applyQuaternion` op scratch vectors |

**Implicatie voor refactor**: een refactor mag de internal child-structuur van de car-group veranderen zonder physics.js te breken, ZOLANG `mesh.userData.wheels` (een array van 4 spinning wheelGroups) intact blijft en de top-level `mesh` zelf de bewegende object blijft (positie, rotatie, quaternion eigen).

---

## 5. Visual baseline — screenshot-plan

Onderstaande 5 combinaties dekken: (a) default speler-auto (id=0 Bugatti) op default world (Grand Prix), (b) elke type-bucket (super, f1, muscle, electric), (c) high-contrast wereld-paint paringen (witte cars op donkere wereld, gekleurde car op contrast-wereld), (d) F1-car op F1-thema circuit.

| # | Car | Wereld | Reden |
|---|---|---|---|
| 1 | Bugatti Chiron (id 0, blauw/goud, super) | Grand Prix | default selectie + default circuit; "first impression" van het spel |
| 2 | Ferrari SF90 (id 3, rood/geel, super) | Volcano | rode super tegen oranje/zwarte omgeving — paint reflection / metallic check tegen warme lighting |
| 3 | Tesla Model S (id 6, zilver, electric) | Neon City | smooth sedan + neon reflections — chrome / glassroof / `_softHeadlightTex` beam-cone test bij night |
| 4 | Red Bull RB F1 (id 4, donkerblauw/rood, f1) | Grand Prix | F1-car op F1-thema; halo + wing detail-budget tegen hoogste circuit-detail |
| 5 | Ford Mustang (id 5, wit met blauwe stripes, muscle) | Themepark | breedste muscle silhouette met meeste accent-stripes; high-contrast white tegen kleurige themepark backdrop |

Aanvullende dekking voor side-by-side vergelijkingen (optioneel):
- Lamborghini Huracán (id 1, oranje, super) op Arctic — warme paint tegen koele wereld
- Porsche GT3 RS (id 8, wit/rood, super) op Deep Sea — round headlights + wing tegen blauwe omgeving

Per screenshot: capture minimaal in (a) day, (b) night (zodat `head` emissive intensity en `_softHeadlightTex` cone zichtbaar zijn), (c) replay-camera vanaf 3/4 achterkant zodat exhaust + spoiler + diffuser detail leesbaar zijn.
