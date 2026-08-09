# Gear Works

A precision gear bench in a single self-contained HTML file. Build a train from the
motor to the target and watch speed trade against torque — spur gears, compound shafts,
racks, ring/planetary sets, crank-slider linkages and wind-up springs, all solved through
one ratio graph.

A hand-authored campaign of **twenty levels** runs from a single mesh to a working clock:
a barrel arbor, a going train, a 12:1 motion work and two hands on two dials. The route
and the rules every level is held to are in [`LEVELS.md`](LEVELS.md); why the finale is
built the way it is — including the measurements that ruled out a spring-powered clock and
a real escapement — is in [`CLOCK.md`](CLOCK.md).

Every level ships more parts than its answer needs and scores out of three stars on how
few you use. The floating readouts show each wheel's **ratio to the motor**, taken out of
the ratio solve rather than inferred from the rpm, so they are exact before the train has
finished settling; a rail button cycles them between Ratio, **Mesh**, Speed and Off, and a
second sets how much of the board they cover. Mesh mode labels each engaged pair with the
ratio *that stage* contributes, driving-to-driven, which is the number you are actually
choosing between while you build. Hovering a gear, or carrying one near a mesh it could
make, shows those chips in any mode.

A level is won when its targets are **driven** to their goal, not merely moving: a gear cut
loose from its motor coasts for about a second, and that was long enough to win a level off
a machine you had already taken apart. Every goal now reads the ratio solve rather than the
current motion, so a correct build is acknowledged on the frame the last part lands.

**▶ [Play the current build](https://i-r0n.github.io/Gear-game/)**

No build step and no runtime dependencies: open `gear_works.html` in a browser, or serve
the directory with anything that returns files.

## Previews

Every branch state that matters is published to GitHub Pages by
[`.github/workflows/preview.yml`](.github/workflows/preview.yml):

| what | URL |
| --- | --- |
| `main` | `https://i-r0n.github.io/Gear-game/` |
| pull request *N* | `https://i-r0n.github.io/Gear-game/pr/N/` |

Each pull request gets a sticky comment with its own link, re-pointed on every push. When
a pull request closes, its directory is deleted from the site. Both live on a single
`gh-pages` branch in separate directories, so a preview can never overwrite `main`.

Until something has been published from `main`, the site root shows a small directory of
the open pull request previews instead of 404ing. `main`'s own build replaces it the first
time it deploys.

**Nothing is published until `npm test` passes.** The workflow runs the suite first and
only deploys behind a green run, so a preview link always points at a build whose levels
still solve and whose physics fingerprint is intact. A failing suite leaves the previous
preview in place rather than replacing it with a broken one. Cleaning up a closed pull
request skips the gate — there is nothing to verify when only deleting a directory.

Pull requests **from forks** still run the test suite, but do not get a preview — GitHub
gives those runs a read-only token, so they cannot publish. The workflow skips the deploy
rather than failing.

### One-time setup

The workflow creates and pushes the `gh-pages` branch by itself, but GitHub Pages has to
be pointed at it once, by hand:

> **Settings → Pages → Build and deployment**
> Source: **Deploy from a branch** · Branch: **`gh-pages`** · Folder: **`/ (root)`**

Until that switch is flipped the branch will fill up correctly and the links will 404.

## Development

```bash
npm install          # Playwright, used only by the tooling below
npm test             # the campaign, cheese checks, invariants, interaction, fingerprint
npm run audit        # frame cost, WCAG AA contrast, 44px touch targets
npm run curve        # per-level difficulty instrumentation
npm run shots        # render shots/after/*.png at 1280x800 and 390x844
npm run shots:levels # every level, start and solved, both viewports -> shots/levels/
npm run play         # play the campaign with real pointer input and sloppy drops
```

`npm test` is the campaign's contract. Every level ships a machine-checkable **solution
spec** — the placements that solve it — and the suite seats them the way a player would,
then asserts the level wins, has *exactly* the meshes its own numbers imply, keeps 0.30
units clear of an accidental tangency, needs every part it ships, resists both degenerate
placements, cannot wind a barrel into a soft-lock, and fits inside the intersection of the
safe boxes measured live at both viewports. 216 assertions.

`npm run play` is the feel check. It plays every level with real pointer events and
deliberately sloppy drops at both viewports, and reports the largest miss each level still
tolerates. Solvable and playable are different properties, and only the first one is easy
to test: the run that introduced this found a level whose stack target was 5px on a phone.

`npm run curve` is the difficulty-curve instrumentation: part count, distinct types, stack
count, mesh count, longest train, ratio span and new-element flag per level, with the
largest steps in each direction called out. A spike in it is a design smell.

`tests/baseline.json` is a numeric fingerprint of the simulation — part positions, angles,
angular velocities, torques, spring wind, rack travel and lock state after a fixed number
of fixed-dt frames. It exists so a presentation change can prove it did not disturb the
physics. Regenerate it with `node scripts/test.mjs --update` **only** when a behaviour
change is intended and reviewed. The free-play, planetary and mechanism scenes are the
presentation-only guard and still reproduce the pre-overhaul build; the puzzle and win
scenes are campaign content and are re-anchored deliberately, with the diff explained in
the commit that does it.

The art direction, design tokens and the reasoning behind the HTML-chrome-over-canvas
split are documented in [`DESIGN.md`](DESIGN.md).
