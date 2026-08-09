# Level design pass — gauntlet prompt

Paste the block below as the opening prompt of a fresh session. It is written to be
self-contained: it names the files to read, the geometry it needs, the known risk, and
the stop condition.

Base any level-design branch on a branch that already contains
`.github/workflows/preview.yml`, or pull requests from it get no preview link —
`main` does not have that workflow until the visual-overhaul PR merges.

---

```
ROLE: You are doing a LEVEL DESIGN pass on Gear Works (the single self-contained HTML
file). Goal: replace the 5 placeholder levels with a hand-authored campaign of EXACTLY
20 levels that teaches the mechanics it needs and culminates in a small working clock.
Work AUTONOMOUSLY in a critique→refine loop until the rubric bar is met. This is a
GAMEPLAY pass — unlike the visual pass, you MAY add mechanics, parts and win conditions,
but only where a level genuinely needs them.

20 is a hard number, not a target. It is a tight budget: roughly 10 things want teaching
and you have 20 slots, so most mechanics get one teaching level and one application, and
there is no room for filler. When the budget does not fit, CUT A MECHANIC — do not add
a level. Mechanics cut from the campaign still exist in free play.

CRITICAL PATH — these serve the clock and must be taught:
  meshing · direction reversal · ratio (speed vs torque) · compound stacks (shared shaft)
  · spring power · whatever the clock's hands/dial need.
ENRICHMENT — ring/planetary, rack + pinion, crank linkage. Each earns a slot ONLY if it
strengthens the arc. Dropping all three is an acceptable outcome; dropping the clock is not.

READ FIRST: README.md, DESIGN.md, then gear_works.html. Map these specifically:
  - `LEVELS[]` schema and the comment block above it.
  - `_add_anchor` / `_drop_inventory` / `start_level` — how a level is instantiated.
  - `_check_win` — the ONLY current win condition is "every driven gear is turning".
  - `_build_ratio_graph` / `_apply_drive_dynamics` — the engine solves ONE degree of
    freedom per connected component via a linear ratio graph.
  - `DAMP_PRESETS` — "Clock" mode nearly removes loss so a wound spring rings.
  - The part set: U1..U5, SP (spring), RK (rack), RG (ring), and crank linkages.

GEOMETRY YOU NEED (do not rediscover this):
  - Level `pos` is in units of Rp2 (the U2 pitch radius) from the arena centre.
  - Two gears mesh when centre-to-centre == the SUM of their pitch radii. In level units:
      U1 = 0.5 · U2 = 1.0 · U3 = 1.5 · U4 = 2.0 · U5 = 2.5 · SP = 1.5
    so U2–U2 = 2.0, U3–U2 = 2.5, U2–U1 = 1.5, U5–U3 = 4.0, and so on.
  - Ring: inner pitch radius 4.0, rim 1.5, outer pitch radius 5.5. A planet of radius r
    meshes internally at centre distance (4.0 − r) and externally at (5.5 + r).
    Sun + 2·planet closes the set: sun radius = 4.0 − 2·r_planet (U4 sun + U2 planets).
  - Compound stacks (two gears on one shaft) already work and are your ratio multiplier.
  - Rack length and engage gap derive from RACK_LEN_MULT / module — compute, don't guess.
  - SAFE DESIGN BOX: derive the arena half-extents from `_recompute_geometry` at BOTH
    1280x800 and 390x844 and take the intersection, then subtract the chrome (176px rail,
    52px top bar). Expect roughly |x| <= 9 and |y| <= 9 in Rp2 units — verify it in the
    harness and encode it as an assertion, because a level that only fits on desktop is
    a broken level.

PHASE 0 — FEASIBILITY SPIKE, BEFORE ANY LEVEL DESIGN:
The engine solves one DOF per component with a consistent linear ratio graph. Anything
requiring intermittent engagement — a true escapement, a ratchet, a Geneva drive, a
one-way clutch — is NOT expressible today and would need new dynamics. Decide and write
up, in CLOCK.md, which of these you are doing:
  (a) Clock WITHOUT an escapement: spring barrel → going train → 12:1 motion work →
      hands, regulated by the "Clock" damping preset. Cheapest, no engine change.
  (b) Clock WITH a real escapement: specify the new dynamics, prove it in a spike
      before committing, and state the risk to solver stability.
Also decide what a "hand" and a "dial" are: a new part, or a rendering mode on an
existing gear. Prototype the finale FIRST and confirm it actually runs and reads as a
clock. If the finale is not achievable, say so and propose the nearest thing that is —
do not design 19 levels toward a finale you have not proven.
Then write LEVELS.md: all 20 levels as a table (number, name, new mechanic, intended
insight, part budget, target solve time) plus the difficulty curve you intend. Start from
this allocation and change it only with a stated reason:
    1–4    fundamentals: first mesh, chain across a gap, direction, two trains
    5–8    ratio: big drives small, small drives big, compound stack, stack as reduction
    9–12   enrichment and/or consolidation levels that combine the above
    13–16  clock parts: spring power, going train, 12:1 motion work, hands on a dial
    17–19  sub-assemblies: build and run each third of the clock standalone
    20     the full clock
Milestones (a new element or a clock part) should land at a steady cadence — roughly
every third level, never two in a row. Commit CLOCK.md and LEVELS.md before writing
level data.

PHASE 1 — HARNESS (extend the existing one, do not start over):
Every level must ship a machine-checkable SOLUTION SPEC alongside it — the placements
that solve it. Then extend `scripts/`:
  1. `npm test` proves ALL 20 levels solvable from their own specs (the current suite
     hardcodes a 5-level PAIRING table; replace it with the per-level specs).
  2. A "cheese" check: assert each level is NOT solved by a degenerate placement
     (e.g. dumping all inventory adjacent to the drive), so levels have real solutions.
  3. `scripts/curve.mjs` — emit a report per level: part count, distinct part types,
     mesh count, longest train, ratio span, new-mechanic flag. This is your difficulty
     curve instrumentation; a spike in it is a design smell.
  4. Extend `scripts/shots.mjs` with a `levels` mode: for every level, capture the
     START state and the SOLVED state at 1280x800 and 390x844.
  You must OPEN and look at these PNGs each round — do not critique blind.

REQUIRED FIX (do this in round 1, it is a known player complaint):
The level-complete overlay is a centred card that covers the finished gear train, so the
player never gets to watch the thing they just built run. Rework the completion flow so
the solved mechanism stays fully visible and running — e.g. a bottom sheet or side panel,
a reduced scrim, auto-framing the solved train, and a beat of delay before any UI appears.
Reuse the existing DESIGN.md tokens and primitives. Getting to watch your machine work is
the reward; treat it as such. This matters most at level 20, where the reward IS the clock.

THE GAUNTLET — repeat up to 6 rounds:
  1. Build/refresh all levels, run the harness, render all shots.
  2. Critique against the rubric; score every dimension 1–10. Be harshly honest — a 6 is
     not "fine", it's "not shipping".
  3. Pick the 2 lowest-scoring dimensions overall.
  4. Fix them. Prefer changing level data over changing the engine. If a level cannot be
     made to earn its slot, REPLACE it — the count stays at 20.
  5. `npm test` and `npm run audit`. ZERO regressions.
  6. Re-render, re-score, `git commit` with the round's scorecard in the message.
  STOP when every dimension is >= 8/10, OR after 6 rounds, OR when a round raises the
  minimum score by < 1 point (diminishing returns).

RUBRIC (score each, every round):
  1.  Teaching — each mechanic introduced in isolation before being combined
  2.  Difficulty curve — monotonic-ish, measured by curve.mjs, no unexplained spikes
  3.  Insight per level — one clear idea each; at 20 slots, ANY filler is a failing grade
  4.  Solution elegance — the intended solution is the obvious-in-hindsight one
  5.  Milestone pacing — new elements and clock parts land at deliberate intervals
  6.  Clock arc coherence — the finale is earned, legible, and visibly a clock
  7.  Level readability — goal and constraints clear at a glance, at both viewports
  8.  Completion flow — win state celebrates and REVEALS the built mechanism
  9.  Robustness — every level provably solvable, no degenerate cheese, no soft-locks
  10. Performance & fit — inside the safe box at 390px, holds 60fps with the densest level

HARD CONSTRAINTS:
  - EXACTLY 20 levels at every commit. Never 19, never 21.
  - Keep it ONE self-contained HTML file, no runtime dependencies.
  - Do NOT regress the existing engine. `tests/baseline.json` is a physics fingerprint
    anchored to the pre-overhaul build; the free-play/planetary/mechanism scenes must
    still match it exactly. Content scenes (puzzle, win) will legitimately change —
    re-anchor those DELIBERATELY, in their own commit, and say why in the message.
  - Any new part or win condition must be added to the ratio graph consistently and
    covered by the invariant tests, not special-cased in the draw path.
  - Preserve every accessibility property already verified: WCAG AA contrast on all text,
    44px minimum touch targets, keyboard-reachable controls. `npm run audit` must pass.
  - Levels must be playable with touch only.
  - If a level needs a part the level schema cannot express today (rack, ring, spring,
    linkage as level furniture), extend the SCHEMA — do not hardcode it in start_level.

DELIVERABLES: CLOCK.md (feasibility decision + the clock's mechanism), LEVELS.md (the
20-level table and curve), the updated file, the extended harness, shots/levels/ for all
20 levels, and a final scorecard table (dimension x round) in the PR description.
Open a PR.
```

---

## Notes for whoever runs this

**The escapement is the real risk.** `_apply_drive_dynamics` solves one degree of freedom
per connected component through a linear ratio graph — which is why two gears both meshing
the same rack correctly seize the train. A true escapement needs intermittent engagement,
which that solver cannot express. Phase 0 exists to force that decision before 19 levels
get built toward a finale that needs new dynamics.

**Solvability testing has to change shape.** `scripts/test.mjs` currently hardcodes a
five-level `PAIRING` table written by hand. That does not scale to 20, hence the
requirement that each level ships its own solution spec — plus the cheese check, because
"is solvable" and "is only solvable the interesting way" are different properties and
only the first one is easy to test.

**Ring, rack and linkage are not on the path to a simple clock.** A strict reading of the
budget cuts all three from the campaign, leaving them as free-play-only mechanics. That is
the right trade at 20 levels, but it is a real consequence — if they must appear in the
campaign, say so up front and cut something else instead.

**Preview links.** `.github/workflows/preview.yml` publishes every pull request to
`https://i-r0n.github.io/Gear-game/pr/<N>/` behind a green `npm test`. It only runs if the
workflow file is present in the pull request's merge result, so branch from somewhere that
has it. GitHub Pages must also be enabled once, by hand:
**Settings → Pages → Deploy from a branch → `gh-pages` → `/ (root)`**.
