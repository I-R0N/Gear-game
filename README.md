# Gear Works

A precision gear bench in a single self-contained HTML file. Build a train from the
motor to the target and watch speed trade against torque — spur gears, compound shafts,
racks, ring/planetary sets, crank-slider linkages and wind-up springs, all solved through
one ratio graph.

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
npm test             # solvability, mesh/dynamics invariants, interaction, physics fingerprint
npm run audit        # frame cost, WCAG AA contrast, 44px touch targets
npm run shots        # render shots/after/*.png at 1280x800 and 390x844
```

`tests/baseline.json` is a numeric fingerprint of the simulation — part positions, angles,
angular velocities, torques, spring wind, rack travel and lock state after a fixed number
of fixed-dt frames. It exists so a presentation change can prove it did not disturb the
physics. Regenerate it with `node scripts/test.mjs --update` **only** when a behaviour
change is intended and reviewed.

The art direction, design tokens and the reasoning behind the HTML-chrome-over-canvas
split are documented in [`DESIGN.md`](DESIGN.md).
