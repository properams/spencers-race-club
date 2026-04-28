# Car Selection Redesign — Done

Branch: `claude/redesign-car-selection-SxN1y`
Files touched: `css/select.css`, `js/ui/select.js`, `index.html`
Commits: 6 phase commits + 1 post-review fix commit.

## Shipped

### Phase 1 — layout grid rewrite
- Body grid widened to `240px 1fr 280px`.
- Center column now flex-column: brand/model/specs → canvas (flex-grow,
  min-height 280, max-width 760) → vertical stat stack pinned below.
- Stat cards become horizontal-grid rows `[label | bar | value]`.
- Mobile keeps stats as a 2×2 grid for compactness.

### Phase 2 — 3D preview stage upgrade
- Hexagonal podium (CylinderGeometry 6-segment, metallic standard
  material) replacing the flat dark cylinder.
- Emissive magenta torus rim + scrolling procedural grid texture
  on the deck + additive radial-glow halo plane underneath.
- 3-point lighting: warm key (front-left), cool fill (right),
  magenta rim (behind) for cyberpunk silhouette.
- Camera lowered to (4.8, 1.5, 5.6), FOV 34. Auto-rotate slowed
  0.6 → 0.3 rad/s.
- Renderer becomes responsive via ResizeObserver — no more blurry
  stretch when the canvas grew.
- DRAG TO ROTATE hint brightened + magenta text-shadow + 0.8s fade
  after first interaction.
- Selected color swatch picks up a magenta+white neon glow.

### Phase 3 — stat bars with comparison context
- Ghost bar at the catalogue-wide max for each stat sits behind
  the current car's bar.
- Numeric becomes `<value> / 100`, value coloured by rank
  (top-3 = green, top-half = amber, white otherwise).
- `_STAT_DEFS` table + lazy `_computeStatRanks()` precomputation
  using actual catalog field names (`topSpd`, `accel`, `hdlg`,
  `nitro`).
- Render path switched from innerHTML rebuild to build-once + update
  so the CSS width transition (.22s ease-out) actually fires when
  switching cars.

### Phase 4 — garage list polish
- Team-colour border-left (3px → 5px on selected) using `def.accent`
  via a `--team` CSS var, with a soft team-colour glow on the swatch.
- Selected card gains a stronger gradient bg + neon shadow + a `▶`
  marker on the right edge.
- Locked cards: greyscale swatch, faded border, lock+price combo
  (`🔒 800c`), price turns green-glow when affordable. Hover title
  pulled from existing `_unlockHints`.
- Filter chips: nowrap + horizontal scroll (hidden scrollbar) so
  they never orphan-wrap; active chip gets a magenta text-shadow.
- New thin pink progress bar under the GARAGE label, driven by
  `_renderHeaderSubtitle` from `_unlockedCars.size / CAR_DEFS.length`.

### Phase 5 — right panel polish
- Each setting group (LAPS / DIFFICULTY / MODE) becomes a faint card
  (rgba(255,255,255,.02) bg + 1px low-opacity border).
- RIVAL becomes a proper card: ghost-emoji icon in a magenta-glow
  badge + BEST LAP micro-label + existing `_renderRival` text.
- Race summary moves INSIDE the START RACE button as a small caption.
- Hover adds a 1.6s magenta box-shadow pulse keyframe.

### Phase 6 — cyberpunk accents
- Tron-style perspective grid floor (`#sSelect::after`) at the
  bottom 240px, masked to fade up. Hidden under
  `prefers-reduced-motion` and on phones <600px.
- 2px scanlines layered into `#sSelect::before` next to the existing
  dot field (rgba .025 — barely visible, gives CRT feel).
- Title gains a magenta text-shadow + 8s flicker keyframe.
- Four magenta L-shaped corner brackets (`<span class="prevCorner">`)
  inside the canvas wrap to anchor the preview as a "viewport".

### Post-review fixes
- Defer-until-laid-out resize: `updateCarPreview()` self-corrects when
  the canvas had no client size on init.
- `setTimeout` race in the name fade is now safely cleared on rapid
  car-switching so stale timers can't override `textContent`.
- Reduced-motion + small-phone fallback hides the perspective grid.

## Verification

- All edits are syntactically valid (`node -c` on `select.js` clean).
- All 6 phases preserve the existing `_savedBL` / `_lapRecords` /
  `_unlockHints` / `CAR_UNLOCK_RULES` / `_carPrices` / progression
  systems — no shadowing or duplication.
- `setPreviewCar` / `updateCarPreview` / `_selectPreviewCar` /
  `rebuildWorld` all still invoked from the same entry points
  (`buildCarSelectUI`, `gameState==='SELECT'` render loop).
- Audio system, gen counter, and in-race HUD untouched.

## Deferred / out of scope

- Color override persistence across screen re-entries — pre-existing
  cosmetic issue (override is applied to the live mesh but not used
  by `makeCar` on rebuild). Predates this redesign.
- Mobile pixel-ratio cap on the preview renderer (recommended by
  efficiency review). Acceptable as-is; only one preview scene.
- Drag/touch event listeners on `window` are anonymous arrows and
  thus cannot be unbound. Static select screen, harmless today.

## Not done (could not be done in this environment)

- No browser screenshots taken at 1920×1080 / 1366×768 / 414×896 —
  no browser available in this session. CSS / JS were verified by
  reading the diff against the actual source structure (verified
  before any edit by the bug-verifier agent that flagged 7 incorrect
  claims in the original prompt — see commit history).
