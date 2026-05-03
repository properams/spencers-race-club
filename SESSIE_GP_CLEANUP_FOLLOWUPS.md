# SESSIE_GP_CLEANUP_FOLLOWUPS.md

Out-of-scope observaties tijdens de GP cleanup sessie. Niet gefixt in
PR — laat de user beslissen of/wanneer.

---

## FU-1 — Lap 1 recorded time inflated by ~16.5%

**Severity**: MEDIUM (subtle data corruption, not gameplay-breaking)
**Out of scope reason**: Lap-counting wasn't on the cleanup-list; the QA
agent partially mis-diagnosed it as "race ends at 77% of intended" but
the actual finish-distance is correct (3.165 laps drive-time). Only the
*recorded lap-1 time* is wrong.

**Files**:
- `js/cars/build.js:91` — `_worldGridT` spawn-position table (GP at t=0.955)
- `js/gameplay/tracklimits.js:153-156` — first crossing logic
- `js/ui/navigation.js:119` — `lapStartTime=_nowSec` set at GO

**What happens**:
- Spawn at t=0.955, prevProg=0.955. `lapStartTime` set at GO.
- First S/F crossing fires after driving from 0.955 → 1.0 → 0.12 = 16.5%
  of track. Gate `car.isPlayer && car.lap>=1` SKIPS (car.lap is 0). Then
  `car._lapStart=now; car.lap++` (always runs).
- **`lapStartTime` is NOT updated at this first crossing.** Stays at
  race-start time.
- Second crossing (after 1 full lap of additional driving):
  `car.lap>=1` passes → `lastLapTime = now - lapStartTime`. But
  lapStartTime is still race-start → lastLapTime = 1.165 laps of
  driving time, attributed as "lap 1".
- Lap 2 and 3 are correct.

**Player-visible effect**:
- "LAP 2/3" banner appears at what should be the end of lap 1
- `bestLapTime` candidate is the inflated lap 1 time (~16.5% too long)
- Subsequent legit laps may NOT beat the inflated lap 1 → bestLap stays
  on lap 2 anyway, so visible bug is small
- Sector-time consistency check across laps could be off

**Fix options** (pick one in a follow-up sessie):
1. Update `lapStartTime` at the first crossing too: move
   `lapStartTime=now;` outside the `car.lap>=1` gate.
2. Spawn cars at t=0.0..0.07 (just past S/F line) so the first crossing
   takes ~93% of track instead of 16.5%. Less invasive but changes
   visual start-grid position.
3. Initialize `prevProg = (t0 - 0.5 + 1) % 1` so the first
   `prevProg > 0.86` only fires after at least half a lap of driving.

Option 1 is the minimal-touch fix. The `_lapStart=now` already runs at
the first crossing — adding `lapStartTime=now` next to it is a 1-line
change.

**All 8 worlds affected** — every world has its `_worldGridT` between
0.935 and 0.955, all with the same prevProg-init pattern.

---

## FU-2 — Spin-pad visual update runs while player airborne

**Severity**: LOW (cosmetic)

**Context**: From QA-agent finding MEDIUM-3. `js/track/ramps.js:242`
`checkSpinPads(dt)` updates the disc rotation + ring scale + emissive
unconditionally. Trigger-check is correctly gated on `car.inAir`. So
visuals continue spinning even when no car is on the pad.

This is intentional ambient animation ("the pad looks powered") and not
a bug. Document in code comment if a future cleanup wants to gate the
visuals too. No fix recommended.

---

## FU-3 — `Audio.playCollision&&Audio.playCollision()` style inconsistency

**Severity**: LOW (style)

**Files**: `js/gameplay/propcollisions.js:54`

The codebase generally uses `if(typeof Audio!=='undefined' && Audio.foo)
Audio.foo()`. The new propcollisions.js uses the shorter
`Audio.playCollision && Audio.playCollision()`. Functionally identical
post-boot; difference is whether boot-race-condition could cause issues.

Audio is initialised in boot.js before any race-tick can run, so this
is safe. Skip.
