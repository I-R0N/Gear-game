# LEVELS.md — the twenty-level campaign

Twenty is a hard number and a tight budget. Roughly ten things want teaching, so most
mechanics get one level that introduces them in isolation and one that applies them, and
nothing gets a third. Where the budget did not fit, a mechanic was cut rather than a level
added — see *What was cut* at the bottom.

The finale and the reasoning behind it live in [`CLOCK.md`](CLOCK.md). Read that first;
this document is the route to it.

---

## The table

`New` marks a level that introduces a mechanic, a win condition or an element the player
has not seen. `Parts` is what the player must place (the anchored drive and target wheels
are furniture, not budget). `Time` is the solve time the level is tuned for, for a player
who understood the level before it.

| # | Name | New | Intended insight | Parts | Time |
| --- | --- | --- | --- | --- | --- |
| 1 | First Mesh | — | Two gears pass motion when their teeth touch. That is the whole game. | 1 | 0:10 |
| 2 | Straight Run | — | A train carries motion across a gap no single gear could bridge. | 3 | 0:25 |
| 3 | Turn It Around | ★ `spin` | Every mesh reverses direction. Count the meshes, not the gears. | 3 | 1:10 |
| 4 | Split the Power | — | One gear can drive two. A train is a tree, not a line. | 3 | 0:50 |
| 5 | Gearing Up | ★ `min_rpm` | A big wheel driving a small one trades torque for speed. | 2 | 0:40 |
| 6 | Gearing Down | — | The same trade, run backwards: slow output, heavy torque. | 2 | 0:35 |
| 7 | Nothing In Between | ★ `ratio` | Only the end wheels set the speed. Idlers set direction and nothing else. | 4 | 1:30 |
| 8 | Double Duty | — | Two motors, two trains, one box of parts. Budget them. | 4 | 1:10 |
| 9 | Shared Shaft | ★ stacking | Two gears on one shaft turn as one. This is the only ratio tool you control. | 2 | 1:00 |
| 10 | Two Stages | — | Stack a reduction on a reduction and beat what any single mesh can do. | 3 | 1:30 |
| 11 | Overdrive | — | Run the same stack the other way for speed past 5:1. | 3 | 1:20 |
| 12 | The Bench Test | — | Branch, stack and ratio in one board. Everything before the clock. | 5 | 2:15 |
| 13 | Wind the Barrel | ★ `wind_turns` | A mainspring is a store. Drive it and it fills; that is what winding is. | 2 | 0:50 |
| 14 | Heavy Barrel | — | A stiff barrel needs torque, and torque comes from a reduction. | 4 | 1:40 |
| 15 | First Hand | ★ hand + dial | A wheel with a pointer on a dial is a hand. Give it the right rate. | 3 | 1:10 |
| 16 | Twelve To One | — | The motion work: `U1→U4` then `U1→U3` is exactly 12:1. | 3 | 1:50 |
| 17 | The Going Train | — | Sub-assembly A: barrel to centre wheel, exactly one turn a minute. | 4 | 1:50 |
| 18 | Under The Dial | — | Sub-assembly B: the motion work, this time carrying the hour hand. | 3 | 1:30 |
| 19 | The Dial Train | — | Sub-assembly C: both hands, both dials, twelve to one, running. | 4 | 2:00 |
| 20 | Gear Works | — | The clock. Barrel, going train, minute hand, motion work, hour hand. | 6 | 3:00 |

New elements land at **3, 5, 7, 9, 13, 15** — never two levels in a row, and never more
than three levels apart until the clock arc takes over at 16, where every level is itself a
new part of the finale.

## The curve

`npm run curve` instruments the shape rather than trusting it. Per level it reports part
count, distinct part types, mesh count, longest train (the deepest chain from any drive),
ratio span (fastest ÷ slowest wheel), and whether the level introduces something new. The
intended shape:

```
    difficulty
      │                                                        ██
      │                                              ██  ██ ██ ██
      │                          ██          ██  ██  ██  ██ ██ ██
      │              ██  ██  ██  ██  ██  ██  ██  ██  ██  ██ ██ ██
      │  ██  ██  ██  ██  ██  ██  ██  ██  ██  ██  ██  ██  ██ ██ ██
      └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴──┴───
         1   2   3   4   5   6   7   8   9  10  11  12 …      20
```

Three deliberate features, each of which would otherwise read as a defect:

* **A step at 3, not a ramp.** Levels 1–2 are a two-minute tutorial. Level 3 is the first
  level that can be got wrong, because its obvious answer is the wrong answer.
* **A dip at 5–6.** The ratio pair is easy on purpose. They introduce a reading, not a
  puzzle, and the reading is the point — the rpm and torque pills carry the lesson.
* **A rise from 16, not a plateau.** The clock arc is meant to feel like assembly, so each
  level adds one more third of a machine the player has already built once.

Anything else that spikes is a design smell, and the report is checked every round.

## The rules every level is held to

* **Every level ships a solution spec** — the exact placements that solve it, in the same
  `Rp2` units the level itself is authored in. `npm test` seats them and asserts a win, so
  "solvable" is a property of the build, not a claim in a document.
* **Exactly the intended meshes.** The solved board's mesh-edge set must match the spec's,
  which is what stops an accidental tangency closing a ratio cycle and killing the level
  (see the two geometry rules in `CLOCK.md` — both of them cost me a spike round).
* **Every placed part is load-bearing.** Removing any single part from the solution must
  break the win. A level cannot pad its part count.
* **No cheese.** Dumping the whole inventory in a heap at the arena centre must not win,
  for any level. Chaining it blindly off the drive must not win either, except on levels
  1, 2 and 4, where that chain *is* the intended solution and the naive attempt succeeding
  is the tutorial working.
* **Inside the box at 390px.** Every part, placed and staged, expanded by its pitch radius,
  lies inside the intersection of the two viewports' safe boxes. Derived live at both
  sizes, not hardcoded.

## What was cut

* **Ring / planetary, rack and pinion, crank linkage.** None of the three is on the path to
  a clock. At twenty slots, a mechanic that does not feed the finale is a mechanic that
  costs a level the finale needs, so all three were cut from the campaign. They remain
  complete and available in free play, and the free-play scenes still cover them in the
  test suite. This is the trade the brief's own notes describe, taken deliberately.
* **A seconds hand.** 60:1 costs three compound stages and five more parts; see `CLOCK.md`.
* **A third consolidation level.** Levels 8 and 12 do that job. A third would be filler,
  and at twenty slots filler is a failing grade.
