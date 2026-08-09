// Playthrough harness.  `npm run play`
//
// `npm test` proves every level is SOLVABLE — it seats each solution spec at its
// exact tangent coordinates and asserts a win. That is not the same as the level
// being PLAYABLE. A player drags a part with a mouse or a thumb and lets go
// somewhere near the right place; whether the level works then depends entirely on
// how forgiving the snapper and the stack-capture radius are, and nothing in the
// suite measures that.
//
// So this plays the campaign with real pointer events and DELIBERATELY SLOPPY
// drops, at both viewports, and reports per level the largest miss it still
// tolerates. Anything that needs better than about a third of a gear radius is a
// level that will feel bad in the hand, whatever the test suite says.
//
//   node scripts/play.mjs                 both viewports, the full ladder
//   node scripts/play.mjs --only 9,10     just those levels
//   node scripts/play.mjs --viewport mobile
import { launch, openPage } from "./browser.mjs";
import { levelKit } from "./levels.mjs";
import { VIEWPORTS } from "./scenes.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const only = arg("only", "").split(",").filter(Boolean).map(Number);
const vpFilter = arg("viewport", "");

// Misses are in units of Rp2 (one U2 pitch radius). 0.60 is well over half a small
// gear; if a level survives that, a human will not notice the snapping at all.
const LADDER = [0.60, 0.45, 0.30, 0.15, 0];
// Eight directions, so a miss is not always helpfully pointing the same way.
const DIRS = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => d * Math.PI / 180);

const toScreen = (page, w) => page.evaluate((wp) => {
  const g = window.__GW.game;
  return [g.camPanX + g.zoom * wp[0], g.camPanY + g.zoom * (g.H - wp[1])];
}, w);

async function drag(page, from, to) {
  const a = await toScreen(page, from), b = await toScreen(page, to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(a[0] + (b[0] - a[0]) * i / 12, a[1] + (b[1] - a[1]) * i / 12);
  }
  await page.mouse.up();
}

// Play one level end to end with every drop missed by `miss` units.
async function play(page, idx, miss) {
  const setup = await page.evaluate((idx) => {
    const g = window.__GW.game, L = window.__L;
    g.start_level(idx);
    window.__GW.step(2, 1 / 60);           // let the chrome settle, as a player's frame would
    const lv = window.__GW.LEVELS[idx];
    return { sol: lv.solution, loose: L.loose().map((t) => t.uid), U: g.Rp2 };
  }, idx);

  const steps = [];
  for (let i = 0; i < setup.sol.length; i++) {
    const s = setup.sol[i];
    // where the player is aiming, and where they actually let go
    const aim = await page.evaluate(([i, sol, looseUids]) => {
      const g = window.__GW.game, L = window.__L;
      const s = sol[i];
      const t = g.tile_list.find((x) => x.uid === looseUids[i]);
      let target;
      if (s.stack !== undefined) {
        const base = typeof s.stack === "number"
          ? g.tile_list.find((x) => x.uid === looseUids[s.stack])
          : g.tile_list.find((x) => x.lvid === s.stack);
        target = base.pos.slice();
      } else {
        target = L.toWorld(s.pos);
      }
      return { from: t.pos.slice(), to: target, uid: t.uid,
               isStack: s.stack !== undefined, type: s.type };
    }, [i, setup.sol, setup.loose]);

    const a = DIRS[(idx * 3 + i) % DIRS.length];
    const off = [Math.cos(a) * miss * setup.U, Math.sin(a) * miss * setup.U];
    const drop = [aim.to[0] + off[0], aim.to[1] + off[1]];
    await drag(page, aim.from, drop);
    await page.evaluate(() => window.__GW.step(8, 1 / 60));

    steps.push(await page.evaluate(([uid, drop, want]) => {
      const g = window.__GW.game, t = g.tile_list.find((x) => x.uid === uid);
      const U = g.Rp2;
      return {
        // how far the snapper had to move the part from where it was released
        correction: +(Math.hypot(t.pos[0] - drop[0], t.pos[1] - drop[1]) / U).toFixed(3),
        // and how far it ended up from where the solution says it belongs
        offSpec: +(Math.hypot(t.pos[0] - want[0], t.pos[1] - want[1]) / U).toFixed(3),
        stacked: !!t.partner,
      };
    }, [aim.uid, drop, aim.to]));
    steps[steps.length - 1].isStack = aim.isStack;
    steps[steps.length - 1].type = aim.type;
  }

  // frames from the last drop until the level acknowledges the win
  const res = await page.evaluate(() => {
    const g = window.__GW.game;
    let f = 0;
    for (; f < 60 * 25 && !g.win; f++) g.update(1 / 60);
    return { win: g.win, frames: f, edges: g.mesh_edges.length,
             locked: g.tile_list.filter((t) => t.locked).length };
  });
  return { ...res, steps };
}

const browser = await launch();
const report = [];

for (const vp of VIEWPORTS) {
  if (vpFilter && vp.name !== vpFilter) continue;
  const page = await openPage(browser, { file: "gear_works.html", width: vp.width, height: vp.height, dpr: 1 });
  await page.addScriptTag({ content: levelKit });
  const n = await page.evaluate(() => window.__GW.LEVELS.length);

  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
  console.log("  #  level              tolerance  win@0   frames  worst correction  notes");
  console.log("  " + "-".repeat(92));

  for (let i = 0; i < n; i++) {
    if (only.length && !only.includes(i + 1)) continue;
    const name = await page.evaluate((i) => window.__GW.LEVELS[i].name, i);
    let tolerance = null, best = null;
    for (const miss of LADDER) {
      const r = await play(page, i, miss);
      if (r.win) { tolerance = miss; best = r; break; }
      if (miss === 0) best = r;                  // nothing worked, keep the exact-drop run
    }
    const exact = tolerance === 0 ? best : await play(page, i, 0);
    const worst = Math.max(0, ...(best ? best.steps : []).map((s) => s.correction));
    const notes = [];
    if (tolerance === null) notes.push("UNPLAYABLE: never solved");
    else if (tolerance <= 0.15) notes.push("tight: needs a near-exact drop");
    const failedStacks = (best ? best.steps : []).filter((s) => s.isStack && !s.stacked);
    if (failedStacks.length) notes.push(`${failedStacks.length} stack(s) missed`);
    if (exact.frames > 90) notes.push(`slow: ${(exact.frames / 60).toFixed(1)}s to register`);
    report.push({ vp: vp.name, n: i + 1, name, tolerance, frames: exact.frames, worst, notes });
    const pad = (s, w) => String(s).padEnd(w), rp = (s, w) => String(s).padStart(w);
    console.log(`  ${rp(i + 1, 2)} ${pad(name, 18)} ${rp(tolerance === null ? "none" : tolerance.toFixed(2), 9)}` +
      `  ${rp(exact.win ? "yes" : "NO", 5)}  ${rp(exact.frames, 6)}  ${rp(worst.toFixed(2), 16)}  ${notes.join("; ")}`);
  }
  await page.close();
}

await browser.close();

const bad = report.filter((r) => r.tolerance === null || r.tolerance <= 0.15);
console.log("\n" + (bad.length
  ? `${bad.length} level/viewport pair(s) need a near-exact drop:\n  ` +
    bad.map((r) => `${r.vp} L${r.n} ${r.name} (${r.tolerance === null ? "never solved" : r.tolerance})`).join("\n  ")
  : "every level solves with a drop missed by at least 0.30 Rp2, at both viewports"));
const slow = report.filter((r) => r.frames > 90);
if (slow.length) console.log(`\nslow to acknowledge: ` +
  slow.map((r) => `${r.vp} L${r.n} ${(r.frames / 60).toFixed(1)}s`).join(", "));
