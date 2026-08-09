# CLOCK.md — the finale, and why it is built this way

The campaign's twentieth level is a working clock. This document records the Phase 0
feasibility spike that chose its mechanism, the measurements behind that choice, and the
geometry rules the spike discovered — the ones that constrain every compound level in the
campaign, not just the finale.

Everything below was measured against the real build with a throwaway harness driving the
page, not reasoned about on paper.

---

## The decision, up front

**Option (a): a clock WITHOUT an escapement.** Power comes from a constant-rate *barrel
arbor* — an anchored drive turning at 60 rpm — standing in for a mainspring whose
escapement is already doing its job off-stage. The player builds the **going train** from the barrel to
the minute hand and the **12:1 motion work** from the minute hand to the hour hand.

Option (b) is not attempted. A real escapement needs intermittent engagement, and
`_apply_drive_dynamics` solves exactly one degree of freedom per connected component
through a *consistent linear ratio graph*. There is no frame in that solver where a pallet
is in contact and a frame where it is not: an inconsistent ratio around a cycle does not
produce alternating engagement, it produces `locked = true` and a dead train. Adding
escapement dynamics means adding a second solver, and the cost lands on every existing
scene through `tests/baseline.json`.

**A wound spring is not the clock's prime mover.** This was the part of the brief's
option (a) that did not survive contact with the engine. See below.

---

## Measurement 1 — a wound spring cannot power a clock here

Spike: a spring gear wound to 5 turns, meshed into a two-gear train
(`SP → U2 → U4`), run for 20 simulated seconds at a fixed 1/60 dt, sampling the middle
gear's rpm every 2 seconds.

| damping preset | direction reversals in 20 s | net revolutions | rpm at 0, 2, 4, 6, 8, 10 s |
| --- | --- | --- | --- |
| Normal | 2 | 7.50 | 2.7 · 131.4 · 73.4 · 11.7 · **−9.9** · −8.2 |
| Clock | 3 | 1.59 | 2.7 · 249.9 · 181.5 · **−115.1** · −265.7 · −81.2 |

The mechanism is not subtle. A spring contributes `τ = −K·wind` and integrates
`d(wind)/dt = ω`, so a spring plus the train's inertia *is* a harmonic oscillator:

```
I·ω̇ = −K·k²·w ,  ẇ = k·ω   ⟹   period = 2π·√(I / (K·k²))
```

For a small train that period is on the order of ten seconds. The "Clock" damping preset
does not fix this — it makes it worse, which is exactly what DESIGN.md says it is for
("nearly removes loss so a wound spring **rings** like a clock/hairspring"). A hairspring
oscillates on purpose. A going train must not.

There is a second, independent problem. A spring left alone still forms a one-node
component, so it unwinds *while the player is building*. By the time a five-part train is
seated the mainspring is flat, and whether the level is winnable depends on how fast the
player drags. That is not a puzzle.

**Consequence for the campaign.** The mainspring keeps its slot, but as the thing you
*wind*, which is what a mainspring is actually for. Level 13's goal is a new win condition —
`wind_turns`: build a train from the motor to the barrel and drive it to N turns of wind.
That is robust (it needs sustained correct meshing, and cannot be cheesed by a transient),
it teaches the part honestly, and it feeds the finale's fiction: the barrel you wound in
level 13 is the barrel driving the clock in level 20.

## Measurement 2 — the going train and motion work do work

Spike: barrel `U2 @ −2.5` at 60 rpm → minute wheel `U3 @ 0` → `U1` pinion on the minute
arbor → `U4 @ +2.5` → `U1` pinion on that arbor → hour wheel `U3 @ +4.5`.

```
edges: barrel-minute, p1-w1, p2-hour     locked: 0
barrel  +58.17 rpm     minute  −38.78 rpm     hour  −3.23 rpm
minute / hour = 11.999997        (want 12)
```

Exact to solver precision, nothing locked, exactly the three intended mesh edges. The
ratio is `(0.5/2.0) · (0.5/1.5) = 1/12` — a `U1` pinion into a `U4` wheel, then a `U1`
pinion into a `U3` wheel.

It is worth being precise about *why* this is exact and stays exact. The ratio graph is
solved to a single reference DOF, so `ω_hour = k_hour · ω_ref` and `ω_minute = k_minute ·
ω_ref` with both `k` fixed by geometry alone. The hands cannot drift apart, at any speed,
under any damping, ever. That is what makes "the hour hand runs at 1/12 the minute hand"
a fair *win condition* rather than a tolerance-chasing exercise.

## Measurement 3 — two geometry rules that cost me a spike round

Both of these are cycle bugs that present as a completely dead board (`locked = 6`,
every ω zero), and both are invisible until you run it.

**Rule 1 — consecutive wheels in a compound chain must not be the same size.**
My first 12:1 was `U3 → U1|U3 → U1|U3`. A `U1` pinion riding a `U3` wheel sits `0.5 + 1.5
= 2.0` from the next `U3` wheel's centre — and the *previous* `U3` wheel is also `2.0` from
that pinion, because `1.5 + 0.5 = 2.0`. The minute wheel silently meshed the second stage's
pinion, closing a ratio cycle with two different ratios in it. The solver correctly seized.

Generally, for `wheel_n(r_n) — pinion(p) — wheel_{n+1}(r_{n+1})`, the unintended mesh
`wheel_n ↔ pinion_{n+1}` appears exactly when `p + r_{n+1} = r_n + p_{n+1}`. With `U1`
pinions throughout (`p = p_{n+1} = 0.5`) that reduces to **`r_n = r_{n+1}`**. So `U5→U4→U3`
is safe and `U5→U5→U4` is not. My first 60:1 attempt hit the second case.

**Rule 2 — a compound reduction always overlaps in plan view, and that is correct.**
A pinion of radius `p` on a wheel of radius `r_w` drives a wheel `r_d` at centre distance
`p + r_d`, which is less than `r_w + r_d` whenever `p < r_w` — i.e. for every reduction.
The engine already models this properly: `_overlaps` skips any gear with a `partner`
("shaft gears sit in their own plane"), so a stacked wheel does not block the next wheel,
and `_build_mesh_edges` only ever cares about tangency, so no spurious mesh appears. The
spike render confirms it reads as a layered machine rather than a collision — the
lightening holes and the stacked gear's central window are doing the work DESIGN.md says
they are for. Campaign levels set `z` by pitch radius descending, so big wheels sit
behind, and a wheel wearing a dial sits in front of everything.

The rule the engine enforces had to change to allow this, and the change is not cosmetic.
`_overlaps` originally refused any placement whose pitch circles crossed, which makes every
compound train unbuildable by hand — the wheel a pinion drives always lands inside the
previous wheel's footprint. Seating now refuses only a drop that lands inside another
gear's stack-capture radius, which is the ambiguous case stacking already handles.
Spawning a part out of the tray still keeps full clearance, so the bench stays tidy.

Neither rule can be left to authoring discipline across twenty levels, so both are
enforced by the harness: every level's solution spec asserts that the solved board's mesh
edge set is *exactly* the intended one, and that nothing is locked.

## Measurement 4 — the safe design box

Derived live from `_recompute_geometry` plus the measured chrome rects, at both viewports,
in units of `Rp2` from the arena centre:

| | 1280×800 | 390×844 |
| --- | --- | --- |
| `Rp2` | 34.895 px | 17.011 px |
| `is_pos_safe` box | x ±17.75, y ±10.87 | x ±10.87, y ±24.22 |
| top bar occludes | y ≥ 9.80 | y ≥ 21.87 |
| tool rail occludes | x ≤ −13.18 | y ≤ −23.75 |
| hint bar occludes | y ≤ −10.14 | y ≤ −20.7 |

The intersection is **x ∈ [−10.87, +10.87], y ∈ [−10.14, +9.80]** for a part *centre*, and
a part also has to fit: its pitch radius plus a tooth addendum has to stay inside too. The
mobile viewport sets the horizontal limit and the desktop viewport sets both vertical
limits, which is precisely why a level that only fits on desktop is easy to author by
accident. `scripts/test.mjs` re-derives this box at both viewports on every run and asserts
every part of every level — placed *and* staged — lies inside it, so the number above can
never quietly rot.

`LEVEL_BOX` in the source is the authoring box the game itself uses — x ±10.6,
y ∈ [−10.0, 9.5] — and the suite asserts that box is inside the measured one. Level content
is authored well inside it, |x| ≤ 8 and y ∈ [−4, 6.5], because the strip along the bottom
is the deterministic inventory staging row and the camera frames both together.

---

## The clock

### What a "hand" and a "dial" are

**A rendering mode on an existing gear, not a new part.** A driven gear may declare
`hand: "minute" | "hour" | "second"` and `dial: <label>` in the level schema. Rendering
draws a recessed dial plate behind the gear — hour marks, minute ticks, an engraved
caption — and a counterweighted pointer on the gear at its own `angle`.

This is deliberately presentation-only, and it stays out of the physics: the hand adds no
node, no edge, no inertia and no ratio. Nothing in `_build_ratio_graph` or
`_apply_drive_dynamics` knows hands exist. The *mechanical* half of the finale — "the hour
hand turns at exactly 1/12 the minute hand" — is a **win condition** read off solved
`omega` values, and that half does go through the shared code path with every other win
condition and is covered by the invariant tests. Drawing a pointer is a draw-path concern;
deciding whether the clock is right is not, and the two are not allowed to touch.

### The mechanism, level 20

```
  barrel arbor        going train, 1:15        motion work, 1:12
  (anchored drive)  → U1 pinion on the     →   U1 pinion on the     →  hour hand
   U2, 60 rpm          barrel arbor            minute arbor            U3 + HOURS dial
   "the escapement     → U5 wheel               → U4 wheel
    is already         → U1 pinion              → U1 pinion
    regulating this"   → minute hand
                         U3 + MINUTES dial
```

* The barrel is anchored and drives at a constant 60 rpm, which puts the minute hand at
  one sweep a minute and the hour hand at 2°/s — slow enough to read as an hour hand,
  fast enough that you can see it move while you watch.
* Both hands are `U3`. That is a legibility constraint, not an arbitrary one: the two
  arbors are fixed 4.35 Rp2 apart by the motion work's own geometry, and two dials have to
  fit side by side inside that. A `U5` minute hand — which is what the going train wanted
  — makes a face that overlaps its neighbour.
* Two dials side by side is a **regulator** layout, which is a real clock face rather than
  a compromise. Concentric hands are genuinely impossible here: shaft partners share
  `omega` by definition, and 12:1 hands do not.
* Win condition: both hands turning, **and** `minute = barrel/15`, **and**
  `hour = minute/12`. An arrangement that happens to spin both hands does not pass.
* Level 19 builds the left half of that diagram and level 18 the right half, with the same
  wheels in the same sizes, so the finale is assembly rather than invention.

### What was cut, and why

* **A seconds hand.** 60:1 from the seconds arbor costs three more compound stages
  (`U1→U5`, `U1→U4`, `U1→U3`) and five more parts. It would make level 20 an eleven-part
  build and push the finale past the safe box. Two hands is a clock.
* **Ring/planetary, rack and pinion, crank linkage.** None of them are on the path to a
  clock, and at twenty slots there is no room for a mechanic that does not feed the finale.
  They remain fully available in free play. This is the trade the brief's own notes call
  for, made deliberately rather than by omission.
