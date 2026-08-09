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
| 16 | Twelve To One | — | The motion work: a pinion into a four, a pinion into a three, exactly twelve to one. | 3 | 9.4 |
| 17 | The Going Train | — | Sub-assembly A: bring the barrel down to a tenth of its speed. | 3 | 7.7 |
| 18 | The Dial Train | — | Sub-assembly B: the same twelve to one, now between two hands on two dials. | 3 | 9.4 |
| 19 | Barrel To Hand | — | Sub-assembly C: fifteen barrel turns, one sweep of the minute hand. | 3 | 9.5 |
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
 2 █████               9 ██████             16 █████████
 3 █████              10 ██████             17 ████████
 4 ██████             11 ███████████        18 █████████
 5 ████               12 ███████████████    19 █████████
 6 ████               13 ████               20 ████████████████████
 7 ███████            14 ██████
```

Four deliberate features, each of which would otherwise read as a defect:

* **A step at 3, not a ramp.** Levels 1–2 are a two-minute tutorial. Level 3 is the first
  level that can be got wrong, because its obvious answer is the wrong answer.
* **A dip at 5–6.** The ratio pair is easy on purpose. They introduce a *reading*, not a
  puzzle, and the reading is the point — the rpm and torque pills carry the lesson.
* **The report's biggest step down is 13, and it is the point of 13.** After the mechanism
  peak at 12, the spring arrives on a deliberately simple board so the new idea is the
  only thing in the room. Introducing a mechanic on a hard level teaches neither.
* **17–19 sit level, not rising.** They are the three thirds of the clock, each built
  standalone, so that 20 is assembly rather than invention. The part count is flat; what
  rises is how much of the finale the player has already held in their hands.

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
* **Every placed part is load-bearing.** Removing any single part must break the win, so a
  level cannot pad its part count.
* **No cheese.** Dumping the inventory around the motor in a rosette must not win, on any
  level. Chaining it blindly at the target must not win either, except on levels 1, 2, 5,
  6 and 13, which declare `naive_solves` — there the obvious chain *is* the answer, and
  the suite asserts it works, because a tutorial that punishes the obvious move is a bad
  tutorial.
* **No spring soft-lock.** A barrel that reaches its hard stop while the motor still
  drives it holds the train at zero for good. Every wind goal is proved to be reached
  strictly before that point.
* **Inside the box at 390px.** Every part, staged and placed, expanded by its pitch radius
  and tooth tips, lies inside the intersection of the safe boxes measured live at both
  viewports. Mobile sets the horizontal limit and desktop sets both vertical ones.

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
