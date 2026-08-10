# LEVELS.md — the twenty-level campaign

Twenty is a hard number and a tight budget. Roughly ten things want teaching, so most
mechanics get one level that introduces them in isolation and one that applies them, and
nothing gets a third. Where the budget did not fit, a mechanic was cut rather than a level
added — see *What was cut* at the bottom.

The finale and the reasoning behind it live in [`CLOCK.md`](CLOCK.md). Read that first;
this document is the route to it.

---

## The table

`New` marks a level that introduces a mechanic the player has not met. It is not a claim —
`npm run curve` derives that column from the level data and prints it back, along with
everything else in this table that can be measured. `Parts` is what the player must place;
the anchored drive and target wheels are furniture, not budget.

| # | Name | New | Intended insight | Parts | Diff |
| --- | --- | --- | --- | --- | --- |
| 1 | First Mesh | — | Two gears pass motion when their teeth touch. That is the whole game. | 1 | 2.0 |
| 2 | Straight Run | — | A train carries motion across a gap no single gear could bridge. | 3 | 5.0 |
| 3 | Turn It Around | ★ direction | Every mesh reverses the spin. Count the meshes, not the gears — and the obvious two-gear line is one mesh short. | 3 | 5.0 |
| 4 | Split the Power | branch | One gear can drive two. A train is a tree, not a line. | 3 | 5.7 |
| 5 | Gearing Up | ★ ratio | A big wheel driving a small one trades torque for speed: five out for one in. | 2 | 4.3 |
| 6 | Gearing Down | — | The same trade backwards — and the torque readout is the other half of the lesson. | 2 | 4.3 |
| 7 | Nothing In Between | — | Only the end wheels set the speed. Idlers set direction and nothing else, which is why one branch needs four of them and the other needs one. | 4 | 7.2 |
| 8 | Double Duty | two motors | Two motors, two trains, one box of parts. Budget them. | 4 | 7.2 |
| 9 | Shared Shaft | ★ stacking | Two gears on one shaft turn as one. This is the only ratio tool you control. | 2 | 6.0 |
| 10 | Overdrive | — | Run the same shaft the other way and it multiplies instead: eight to one. | 2 | 6.1 |
| 11 | Two Stages | — | Stack a reduction on a reduction and beat what any single mesh can do. | 4 | 11.3 |
| 12 | One In Sixty | — | Three stages, and the first pinion rides the motor's own arbor. The mechanism peak. | 5 | 14.8 |
| 13 | Wind the Barrel | ★ mainspring | A mainspring is a store, not a motor. Drive it and it fills. | 2 | 3.5 |
| 14 | Two Barrels | — | A barrel is a load like any other, and one motor can fill two. | 3 | 6.4 |
| 15 | First Hand | ★ hand + dial | A wheel with a pointer on a dial is a hand. Give it the right rate. | 2 | 5.8 |
| 16 | The Going Train | — | Sub-assembly one: bring the barrel down to a tenth of its speed. | 3 | 7.7 |
| 17 | Twelve To One | — | The motion work: a pinion into a four, a pinion into a three, exactly twelve to one. | 3 | 9.4 |
| 18 | Barrel To Hand | — | Sub-assembly two: fifteen barrel turns, one sweep of the minute hand — the clock's left half. | 3 | 9.5 |
| 19 | The Dial Train | — | Sub-assembly three: both hands, both dials, twelve to one — the clock's right half. | 3 | 9.4 |
| 20 | Gear Works | — | The clock. Barrel, going train, minute hand, motion work, hour hand. | 6 | 20.1 |

New elements land at **3, 5, 9, 13, 15** — never in back-to-back levels, and never more
than four levels apart. `curve.mjs` asserts the first of those and prints the second.

## The curve

`npm run curve` measures the shape rather than trusting it. Per level: part count,
distinct types, stack count, mesh count, the longest train (deepest chain of meshes and
shafts from any drive), the ratio span across the solved board, target count, and a single
difficulty index combining them. The weights live in `curve.mjs` and nowhere else; they
are a lens on the measurements, not a truth about the levels.

```
 1 ██                  8 ███████            15 ██████
 2 █████               9 ██████             16 ████████
 3 █████              10 ██████             17 █████████
 4 ██████             11 ███████████        18 █████████
 5 ████               12 ███████████████    19 █████████
 6 ████               13 ████               20 ████████████████████
 7 ███████            14 ██████
```

Every step down in that shape is a mechanic arriving on a deliberately simple board.
`curve.mjs` prints the three largest in each direction, and after the round-3 reorder they
are 13 (−11.3), 5 (−1.4) and 9 (−1.3) — the spring, the ratio pair and the shared shaft.

Four deliberate features, each of which would otherwise read as a defect:

* **A step at 3, not a ramp.** Levels 1–2 are a two-minute tutorial. Level 3 is the first
  level that can be got wrong, because its obvious answer is the wrong answer.
* **A dip at 5–6.** The ratio pair is easy on purpose. They introduce a *reading*, not a
  puzzle, and the reading is the point — the rpm and torque pills carry the lesson.
* **The report's biggest step down is 13, and it is the point of 13.** After the mechanism
  peak at 12, the spring arrives on a deliberately simple board so the new idea is the
  only thing in the room. Introducing a mechanic on a hard level teaches neither.
* **16–19 rise gently, then 20 doubles.** They are the clock's two halves and the two
  mechanisms behind them, each built standalone at three parts, so that the finale is
  assembly rather than invention. The part count is flat across them; what rises is how
  much of level 20 the player has already had in their hands. 20 itself is the only
  double-digit step in the campaign, and it is the finale — it is the two sub-assemblies
  joined, with the same wheels in the same sizes.
* **Round 3 reordered this block** to get there. It used to run motion work, going train,
  dials, barrel — which put the campaign's easiest late level at 17 and left a dip in the
  middle of the run-up. Mechanism first (16, 17), then the same mechanisms wearing their
  dials (18, 19), then both at once.

## Scoring

Every level ships **more parts than its answer needs** — one spare on level 1, two on
every other level — so "how few parts" is a question the level can actually ask. Three
stars is solving it with the answer's part count, two is one part over, one is anything
more.

A part counts when it is placed *and* connected to a motor. A spare left in the tray, or
dropped somewhere idle, is not part of the machine — and the check is the solver's own:
`_apply_drive_dynamics` already stamps every node in a driven component with its ratio to
the motor, so "is this thing in the train" is answered by the same code that decides how
fast it turns.

The score never goes down. It is re-evaluated while the level stays solved, so a player
who finds a cheaper build after the completion sheet appears keeps the better result, and
pulling the machine apart afterwards cannot cost them the stars they earned.

This also changed what the cheese tests assert. "Cannot be won badly" was the wrong bar
once spares existed — a scruffy build that satisfies the goal *has* satisfied the goal.
The bar is now that a degenerate placement must never earn **three stars**, which is a
statement about the score doing its job rather than about the level being unbreakable.

## Speed, and why every level is slower than it was

A gear whose teeth advance more than half a tooth pitch per frame strobes: its direction
becomes genuinely unreadable, the wagon-wheel effect. Direction is what levels 3 and 7 ask
the player to read, and every `ratio` goal carries a direction with it, so this is a
correctness problem and not a taste one.

```
alias = |rpm| × teeth / 1800          1.0 = ambiguous, under ~0.5 = comfortable
```

It is **teeth-dependent**, so a `U5` strobes at a third of the rpm a `U1` does, and the
fastest part in a train is not always the one that binds — level 10 is an 8:1 speed-up
whose middle pinion runs at 4× the drive, and that pinion sets the level's speed. Nine of
the twenty levels used to be over 1.0 outright and seven more were over 0.5. Every drive
was retuned against the limit; `npm test` measures peak and steady alias on all twenty.

## Reading the machine

Ratios are the campaign's constraint, and a damped train takes seconds to settle, so
reading them off the rpm numbers is guesswork. The floating readouts show **ratio to the
motor** by default in the campaign — `1 : 1`, `1 : 2.5`, `1 : 10`, `1 : 30` down a
compound train — taken straight out of the ratio solve, which means they are exact from
the first frame while the rpm numbers are still moving.

A rail button cycles **Ratio / Mesh / Speed / Off**. Speed is the rpm-and-torque pair (and
the free-play default, because the bench is where torque matters); Off is there because
the pills are a lot of furniture on a small screen.

**Mesh** answers a different question. Ratio-to-motor tells you where a wheel has ended
up; it does not tell you what any one *stage* contributed, and a compound train is built
one stage at a time. Mesh mode drops the per-wheel pills entirely and labels the meshes
instead — a small chip on the line between two engaged gears reading `4.0 : 1` or
`1 : 2.5`, oriented by power flow, so the number always reads *driving : driven*. Level 12
in Mesh mode is three chips: `4.0 : 1`, `3.0 : 1`, `5.0 : 1`. That is the level's whole
lesson on one screen, and it is what the pills could never show.

Direction comes from a breadth-first rank over the ratio graph out of the drive, so a
stage is labelled by which of its two wheels is nearer the motor rather than by which
happens to be larger. A stage that speeds up reads `1 : x`; one that reduces reads `x : 1`.

Two things surface mesh chips regardless of mode, because they answer a question you are
asking *right now*:

* **Hovering** a placed gear chips every mesh it is part of.
* **Carrying** a part chips the meshes it *would* make, for any gear within four mesh
  tolerances of the part in hand. You see the ratio a placement buys before you commit to
  it, which is the point at which the number is worth most. This is only possible because
  a mesh ratio is the pair's tooth ratio — it needs no running train and no settled solve,
  so it is correct for a mesh that does not exist yet.

  The preview **fades in** rather than popping: brightness ramps with how close the part is
  to tangency, so carrying a gear across a crowded board reads as one number getting
  brighter instead of six flashing on and off. Only the four nearest to tangency are drawn
  at all, and the part in hand drops its own readout pill while it is held — that pill says
  `— / 0 rpm`, which is true and useless, and it was sitting exactly where the chip needed
  to be.

Chips are placed rather than merely positioned: a chip starts on its mesh normal, out past
the smaller of the two gears, and if that lands on a readout pill or on a chip already
down it takes the other side of the line and then walks outward. It never leaves its own
mesh line, so a chip that has to move cannot end up annotating a mesh it is not about. The
pills are available to dodge because readouts draw first and chips draw last — which is
also why a chip is never half-hidden behind one.

A second rail button, **Detail**, sets the scope: **Key** shows the drive and the target
only — enough to answer "am I there yet" without burying the board — and **All** shows
every part in the train. It defaults off the viewport rather than the mode, because the
constraint is screen area: All on desktop, Key on a phone, and one click either way in
both. It used to be a hard rule keyed to the viewport with no way out, which is exactly
the wrong shape — a 20-part train on a laptop is as cluttered as a 4-part one on a phone,
and the player is the only one who knows which they are reading.

## The rules every level is held to

Each of these is an assertion in `npm test`, run against all twenty levels every time:

* **Every level ships a solution spec** — the exact placements that solve it, in the same
  `Rp2` units the level is authored in. The suite seats them the way a player would, so
  "solvable" is a property of the build rather than a claim in a document.
* **Exactly the intended meshes.** The solved board's mesh-edge set must match the set the
  spec's own numbers imply, computed independently in the harness. This is what stops an
  accidental tangency closing a ratio cycle and killing a level — see the two geometry
  rules in `CLOCK.md`, both of which cost a spike round.
* **0.30u of clearance** between any pair that is not meshed and not on one shaft, against
  an engine mesh tolerance of 0.15u.
* **Every part of the ANSWER is load-bearing.** Removing any single part of the par
  solution must break the win, so a level cannot pad the score it asks for.
* **The par answer scores three stars**, and no degenerate placement does.
* **Nothing strobes.** Steady alias ≤ 0.5 and peak ≤ 0.75 on every level.
* **Readouts hold still.** 240 frames of a settled board on three levels, with no pill
  moving more than half a pixel. They used to wander, because a pill's width tracked its
  own text and a settling train rewrites those digits every frame.
* **No cheese.** Dumping the inventory around the motor in a rosette must not win, on any
  level. Chaining it blindly at the target must not win either, except on levels 1, 2, 5,
  6 and 13, which declare `naive_solves` — there the obvious chain *is* the answer, and
  the suite asserts it works, because a tutorial that punishes the obvious move is a bad
  tutorial.
* **Nothing overlaps on its own plane.** Gears that mesh are at the same height, so a
  plane spreads along mesh edges and stops at a shaft. Two gears on one plane must either
  mesh or stay clear. The suite checks both directions per level: no coplanar pair
  overlaps, and the pairs that *do* overlap — sixteen levels have at least one — are
  reachable only through a shaft, which is the compound geometry the campaign is made of.
* **No winning off a coast.** The level is solved, then the part nearest the motor is
  lifted clean off the board, and every frame of the resulting spin-down is checked: no
  target may report itself satisfied on any of them. See below — this was real on sixteen
  of the twenty levels.
* **No spring soft-lock.** A barrel that reaches its hard stop while the motor still
  drives it holds the train at zero for good. Every wind goal is proved to be reached
  strictly before that point.
* **Inside the box at 390px.** Every part, staged and placed, expanded by its pitch radius
  and tooth tips, lies inside the intersection of the safe boxes measured live at both
  viewports. Mobile sets the horizontal limit and desktop sets both vertical ones.

## Does it feel right?

`npm test` proves every level is *solvable* — it seats each solution spec at its exact
tangent coordinates. That is not the same as *playable*. A player drags a part and lets go
somewhere near the right place, so whether a level works in the hand depends entirely on
how forgiving the snapper and the stack-capture radius are, and nothing in the suite
measured that.

`npm run play` does. It plays the whole campaign with real pointer events and deliberately
sloppy drops, at both viewports, missing every target by a ladder of offsets in units of
`Rp2` (one U2 pitch radius — over half a small gear at the top of the ladder), and reports
the largest miss each level still tolerates.

The first run found three things the suite could not:

* **Level 10 was very nearly unplayable.** It needs a `U2` stacked onto a `U1`, because a
  speed-increasing stage puts the pinion on the shaft of the wheel it drives. The
  stack-capture radius scaled off the *base* gear alone, so the target was 10px on desktop
  and **5px on a phone**. It is a fraction of the pair's tangent distance now — which is
  the distance the competing gesture ("mesh with that gear") actually lives at — and the
  level went from 0.15 to 0.60.
* **Branch levels were fussy.** A gear that has to mesh two fixed neighbours has one
  correct position, and the snapper only took that two-gear pocket within 0.30 step of the
  drop. Widening it helped levels 4 and 14 — but the first attempt at 0.62 was too eager
  and hijacked a placement in level 12 and the six-planet rosette in the free-play scene,
  which is where 0.40 and "the pocket must include the gear the drop is nearest to being
  tangent to" came from. Both failure modes are in the suite now.
* **Level 14 took 6.3 seconds to acknowledge a win.** Two barrels sharing one train wind
  at half the rate. Faster motor; 3.1s now.

Where it stands, at both 1280×800 and 390×844:

```
tolerance   levels
0.60        1, 3, 6, 7, 10, 13, 15, 16, 17, 19, 20
0.45        2, 5, 8, 9, 11, 12, 18
0.30        4, 14
```

Nothing needs a near-exact drop, and every level except the two spring ones acknowledges
the win on the **frame the last part lands** — nought frames, not "quickly". The two spring
levels take 2.6s and 3.8s, which is the mechanic rather than a defect: you are watching a
barrel fill, and it has a progress arc and a live turns readout while you do.

## Winning off a coast

A player found this, and it is the best bug in the campaign: *spin a gear up, pull out the
gear that was feeding it, and hook the parts onto the next target while the first one is
still turning.* Both targets are moving, so the level pays out — for a machine that no
longer exists.

The hole was that `target_ok` read `t.omega`, and a gear cut loose from its motor does not
stop, it coasts down over about a second. "This target is moving" is not "this target is
driven", and the ratio solver already knew the difference: it stamps `drive_ratio`, which
is null for every part of a component with no motor in it. The score had been using exactly
that fact all along to decide which parts count. The win check now asks the same question.

Measured with the guard removed: **sixteen of the twenty levels** could be won off a coast,
not just the multi-target ones. It also turned out to be firing by accident during ordinary
play — level 4's playthrough tolerance was reported as 0.45, but at 0.45 the second target
is never connected at all; it had been brushed by a passing gear during the drag and was
coasting. Its real tolerance was always 0.30, and the number above is now the true one.

Two goals needed more than the driven test:

* **Ratio goals** compare `drive_ratio` to `drive_ratio` rather than speed to speed. The two
  are identical on a settled train, but the first is fixed by geometry and so is exact on
  the frame the last gear lands. Both ends must also hang off the *same* motor, or the
  comparison is between two unrelated machines turning at a flattering pair of speeds.
* **Speed-bounded goals** — level 15 is the only one — read a solved steady state instead of
  the current speed. At steady state the acceleration is zero, so `T_drive + T_spring =
  (B_eff + B_motor) · ω` rearranges to one division. This matters in both directions: a
  train decaying from a coast passes through *any* band on its way down, and the honest
  build no longer has to wait for the servo to converge. Level 15 reads −8.62 rpm on frame
  one and settles at −8.62 rpm; it used to take 22 frames to admit it.

## What was cut

* **Ring / planetary, rack and pinion, crank linkage.** None of the three is on the path
  to a clock. At twenty slots, a mechanic that does not feed the finale costs a level the
  finale needs, so all three were cut from the campaign. They remain complete in free
  play, and the free-play scenes still cover them in the test suite. This is the trade the
  brief's own notes describe, taken deliberately rather than by omission.
* **A seconds hand.** 60:1 costs three compound stages and five more parts; see
  `CLOCK.md`. The arithmetic still gets taught, at level 12.
* **"A stiff barrel needs a reduction for torque."** This was going to be level 14, and it
  is true — a reduction really does let the motor wind the barrel further, because the
  stall point is where motor torque balances spring torque. But it is not *playable*: the
  reduction also divides the approach rate, so the deep-winding train is still behind the
  shallow one after twenty seconds and only overtakes it near forty. Measured, at 90 rpm:
  the reduction passes the direct chain at about 25 s and reaches the stop at about 35 s.
  A level whose lesson only becomes visible after half a minute of watching is not a
  level. Slot 14 became *Two Barrels* instead, which applies the spring against the
  branching from level 4 and resolves in about three seconds.
* **A third consolidation level.** Levels 8 and 12 do that job. A third would be filler,
  and at twenty slots filler is a failing grade.

## Parking lot

Wanted, understood, not built. Each of these has a reason it is not urgent, so that a
future pass can pick it up without re-deriving the argument.

* **Draw the planes.** The placement rule now knows which gears are at which height —
  mesh spreads a plane, a shaft changes it — but the renderer does not. A shaft-borne
  wheel passing over the one below it still reads as clipping rather than as depth, which
  is the reason the overlap looked wrong in the first place; the rule stops the cases that
  are genuinely nonsense, but the legitimate compound overlaps still have to be *taken on
  trust*. The fix is a visual one: give a raised gear an edge treatment that says it is
  above the board — a rim light, a contact occlusion under it, or a slight desaturation of
  whatever it covers. Deliberately not a global drop shadow: that is what was just removed,
  because twenty of them stacked into a smear. Worth doing when the clock levels next get a
  visual pass; the plane model it needs is already in place and tested.
