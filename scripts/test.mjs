// Headless regression suite.  `npm test`
//
// Five layers, in increasing strictness:
//   1. campaign    — exactly 20 levels, each solvable from its OWN solution spec,
//                    with exactly the meshes that spec implies and nothing locked
//   2. no cheese   — degenerate placements do not win, every placed part is
//                    load-bearing, and no spring level can wind itself into a
//                    soft-lock
//   3. fit         — every part of every level, placed and staged, lies inside the
//                    intersection of the safe boxes measured at BOTH viewports
//   4. invariants  — mesh ratios, shaft coupling, rack kinematics, no NaNs
//   5. baseline    — a numeric fingerprint of the whole board after a fixed number
//                    of fixed-dt frames, compared against tests/baseline.json.
//                    Free-play scenes are the presentation-only guard; the puzzle
//                    and win scenes are content and are re-anchored deliberately.
//
//   node scripts/test.mjs --update    regenerate the baseline (only when the
//                                     behaviour change is intended and reviewed)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { launch, openPage, ROOT } from "./browser.mjs";
import { SCENES, preamble, VIEWPORTS } from "./scenes.mjs";
import { levelKit, intersectBoxes } from "./levels.mjs";

const UPDATE = process.argv.includes("--update");
const FILE = (() => {
  const i = process.argv.indexOf("--file");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "gear_works.html";
})();
const BASELINE = path.join(ROOT, "tests", "baseline.json");

// Pitch radii in level units. Duplicated here ON PURPOSE: computing the expected
// mesh set from the same code the engine uses would prove nothing.
const RP = { U1: 0.5, U2: 1.0, U3: 1.5, U4: 2.0, U5: 2.5, SP: 1.5 };
const MESH_TOL = 0.15;        // engine tolerance, in level units (step*0.14 / 0.933)
const MIN_CLEARANCE = 0.30;   // how far a non-meshing pair must stay from tangency

let pass = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(name + (detail ? `\n      ${detail}` : "")); console.log(`  ✗ ${name}${detail ? "\n      " + detail : ""}`); }
}

const browser = await launch();
const page = await openPage(browser, { file: FILE, width: 1280, height: 800, dpr: 1 });
await page.addScriptTag({ content: preamble });
const hasCampaign = await page.evaluate(() => !!(window.__GW.LEVELS[0] || {}).solution);
if (hasCampaign) await page.addScriptTag({ content: levelKit });

const LEVELS = await page.evaluate(() => JSON.parse(JSON.stringify(window.__GW.LEVELS)));

// `--file <pre-overhaul build>` re-anchors the fingerprint against a build that
// predates the campaign. Everything below layer 4 is skipped for that run.
if (!hasCampaign) console.log("\ncampaign — skipped: this build has no level solution specs");

if (hasCampaign) {
// ------------------------------------------------------------------- campaign
console.log("\ncampaign");
check(`exactly 20 levels (${LEVELS.length})`, LEVELS.length === 20, `got ${LEVELS.length}`);

// The mesh set each level's spec IMPLIES, computed here from the declared numbers.
function expectedMeshes(lv) {
  const parts = [];
  const byId = {};
  for (const d of lv.drives) { const p = { key: (d.id || "drive") + ":" + d.type, pos: d.pos, r: RP[d.type] }; parts.push(p); if (d.id) byId[d.id] = p; }
  for (const v of lv.driven) { const p = { key: (v.id || "driven") + ":" + v.type, pos: v.pos, r: RP[v.type] }; parts.push(p); if (v.id) byId[v.id] = p; }
  const sol = [];
  for (const s of lv.solution) {
    let pos = s.pos, base = null;
    if (s.stack !== undefined) { base = typeof s.stack === "number" ? sol[s.stack] : byId[s.stack]; pos = base.pos; }
    const p = { key: s.type + "@" + pos[0].toFixed(2) + "," + pos[1].toFixed(2), pos, r: RP[s.type], base };
    sol.push(p); parts.push(p);
  }
  const edges = [], tight = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (a.base === b || b.base === a) continue;                       // shaft partners
    const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
    const gap = d - (a.r + b.r);
    if (Math.abs(gap) <= MESH_TOL) edges.push([a.key, b.key].sort().join(" ~ "));
    else if (Math.abs(gap) < MIN_CLEARANCE) tight.push(`${a.key}/${b.key} ${gap.toFixed(3)}`);
  }
  return { edges: edges.sort(), tight };
}

const solved = [];
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i];
  const r = await page.evaluate((i) => window.__L.solve(i), i);
  solved.push(r);
  const want = expectedMeshes(lv);
  const label = `${i + 1} "${lv.name}"`;
  check(`${label} solves from its own spec`, r.win === true,
    r.win ? "" : "locked=" + r.locked + " edges=" + r.edges + " targets=" + JSON.stringify(r.targets));
  check(`${label} has exactly the ${want.edges.length} meshes its spec implies`,
    JSON.stringify(r.edgeKeys) === JSON.stringify(want.edges),
    "want " + want.edges.join(" | ") + "\n      got  " + r.edgeKeys.join(" | "));
  check(`${label} nothing locked, no NaN`, r.locked === 0 && !r.nan,
    `locked=${r.locked} nan=${r.nan}`);
  check(`${label} keeps ${MIN_CLEARANCE} clearance off an accidental mesh`,
    !want.tight.length && r.tightest.clearance >= MIN_CLEARANCE - 1e-9,
    (want.tight.join(", ") || "") + " nearest " + r.tightest.pair + " " + r.tightest.clearance);
  check(`${label} inventory matches its solution`,
    lv.inventory.length === lv.solution.length &&
    lv.inventory.every((t, k) => t === lv.solution[k].type),
    `inventory ${lv.inventory.join(",")} vs solution ${lv.solution.map((s) => s.type).join(",")}`);
}

// ------------------------------------------------------------------ no cheese
console.log("\nno cheese");
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i], label = `${i + 1} "${lv.name}"`;
  const heap = await page.evaluate((i) => window.__L.heap(i), i);
  check(`${label} is not won by tipping the inventory into a heap`, heap.win === false,
    JSON.stringify(heap.targets));
  const naive = await page.evaluate((i) => window.__L.naive(i), i);
  if (lv.naive_solves) {
    check(`${label} IS won by the obvious chain (declared: it is the tutorial)`, naive.win === true,
      JSON.stringify(naive.targets));
  } else {
    check(`${label} is not won by blindly chaining off the drive`, naive.win === false,
      JSON.stringify(naive.targets));
  }
  // every placed part is load-bearing
  const bad = [];
  for (let k = 0; k < lv.solution.length; k++) {
    const r = await page.evaluate(([i, k]) => window.__L.solve(i, { skip: k }), [i, k]);
    if (r.win) bad.push(`${k}:${lv.solution[k].type}`);
  }
  check(`${label} needs all ${lv.solution.length} of its parts`, bad.length === 0,
    "still wins without " + bad.join(", "));
}

// A wound barrel that reaches its hard stop while the motor is still driving holds
// the train at zero for good. Prove that cannot happen before the goal is met.
console.log("\nspring soft-lock guard");
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i];
  const winds = lv.driven.filter((v) => v.wind_turns !== undefined);
  if (!winds.length) continue;
  const c = await page.evaluate((i) => window.__L.windCeiling(i), i);
  const mixed = lv.driven.length !== winds.length;
  const ok = winds.every((v) => v.wind_turns < c.peakTurns - 1e-9) &&
             (!mixed || c.peakTurns < c.maxTurns - 1e-9);
  check(`${i + 1} "${lv.name}" barrel settles above its goal and cannot lock the train`, ok,
    `goals ${winds.map((v) => v.wind_turns).join(",")} peak ${c.peakTurns} stop ${c.maxTurns}` +
    (mixed ? " (level mixes wind and non-wind targets)" : ""));
}

// ------------------------------------------------------------------------ fit
// The horizontal limit comes from 390x844 and both vertical limits from 1280x800,
// so a level that only fits on desktop has to fail here rather than ship.
console.log("\nfit inside the safe box at both viewports");
{
  const boxes = [];
  for (const vp of VIEWPORTS) {
    const p2 = await openPage(browser, { file: FILE, width: vp.width, height: vp.height, dpr: 1 });
    await p2.addScriptTag({ content: levelKit });
    await p2.evaluate(() => window.__GW.game.start_level(0));
    await p2.waitForTimeout(260);
    boxes.push(await p2.evaluate(() => window.__L.safeBox()));
    await p2.close();
  }
  const box = intersectBoxes(boxes);
  console.log(`  box  x [${box.x0.toFixed(2)}, ${box.x1.toFixed(2)}]  y [${box.y0.toFixed(2)}, ${box.y1.toFixed(2)}]  (intersection of ${VIEWPORTS.map((v) => v.width + "x" + v.height).join(" and ")})`);
  const declared = await page.evaluate(() => window.__GW.LEVEL_BOX);
  check("the authoring box the game uses is inside the measured box",
    declared.x <= box.x1 + 1e-6 && -declared.x >= box.x0 - 1e-6 &&
    declared.top <= box.y1 + 1e-6 && declared.bottom >= box.y0 - 1e-6,
    `LEVEL_BOX x±${declared.x} y [${declared.bottom}, ${declared.top}]`);
  for (let i = 0; i < LEVELS.length; i++) {
    // start state (everything staged) and solved state (everything placed)
    const start = await page.evaluate((i) => { window.__L.g().start_level(i); return window.__L.report(i); }, i);
    const out = [];
    for (const [tag, r] of [["staged", start], ["solved", solved[i]]]) {
      for (const p of r.parts) {
        const e = Math.max(p.r, p.tip);
        if (p.x - e < box.x0 || p.x + e > box.x1 || p.y - e < box.y0 || p.y + e > box.y1) {
          out.push(`${tag} ${p.label}@${p.x},${p.y} r${e.toFixed(2)}`);
        }
      }
    }
    check(`${i + 1} "${LEVELS[i].name}" fits`, out.length === 0, out.join(" · "));
  }
}
}

// ----------------------------------------------------------------- invariants
console.log("\nmesh / dynamics invariants");
for (const name of ["free", "puzzle", "planetary"]) {
  const scene = SCENES[name];
  await page.evaluate(scene.build);
  const res = await page.evaluate(() => {
    const g = window.__GW.game;
    for (let f = 0; f < 120; f++) g.update(1 / 60);
    const bad = [];
    let checked = 0, stacks = 0, rings = 0, racks = 0;
    const nz = g.tile_list.some((t) => Math.abs(t.omega) > 1e-3);
    for (const [a, b] of g.mesh_edges) {
      if (a.locked || b.locked) continue;
      if (a.is_rack() || b.is_rack()) {
        const rack = a.is_rack() ? a : b, gear = a.is_rack() ? b : a;
        racks++;
        if (Math.abs(Math.abs(rack.omega) - Math.abs(gear.pitch_r() * gear.omega)) > 1e-6 + 1e-6 * Math.abs(rack.omega)) {
          bad.push(`rack v mismatch: ${rack.omega} vs ${gear.pitch_r() * gear.omega}`);
        }
        continue;
      }
      if (a.is_ring() || b.is_ring()) {
        const ring = a.is_ring() ? a : b, gear = a.is_ring() ? b : a;
        rings++;
        const kind = g._ring_engage(ring, gear);
        const rr = kind === "internal" ? ring.inner_r() : ring.pitch_r();
        const lhs = ring.omega * rr, rhs = gear.omega * gear.pitch_r() * (kind === "internal" ? 1 : -1);
        if (Math.abs(lhs - rhs) > 1e-6 * (1 + Math.abs(lhs))) bad.push(`ring ${kind} ratio: ${lhs} vs ${rhs}`);
        continue;
      }
      checked++;
      // external mesh: equal and opposite pitch-line velocity
      const lhs = a.omega * a.pitch_r(), rhs = -b.omega * b.pitch_r();
      if (Math.abs(lhs - rhs) > 1e-6 * (1 + Math.abs(lhs))) bad.push(`external ratio: ${lhs} vs ${rhs}`);
    }
    for (const t of g.tile_list) {
      if (t.partner) { stacks++; if (Math.abs(t.omega - t.partner.omega) > 1e-9) bad.push(`shaft omega split: ${t.omega} vs ${t.partner.omega}`); }
      for (const k of ["omega", "torque", "angle"]) if (!Number.isFinite(t[k])) bad.push(`${t.label}.${k} = ${t[k]}`);
      for (const v of t.pos) if (!Number.isFinite(v)) bad.push(`${t.label}.pos NaN`);
    }
    return { bad, checked, stacks, rings, racks, nz, tiles: g.tile_list.length, edges: g.mesh_edges.length };
  });
  check(`${name}: board built (${res.tiles} parts, ${res.edges} mesh edges)`, res.tiles > 0 && res.edges > 0);
  check(`${name}: something is turning`, res.nz);
  check(`${name}: ${res.checked} external meshes hold their ratio`, res.bad.length === 0, res.bad.slice(0, 4).join(" | "));
  if (name === "free") check(`free: compound shaft shares omega (${res.stacks} partnered)`, res.stacks >= 2);
  if (name === "planetary") check(`planetary: ring meshes engaged (${res.rings})`, res.rings >= 3);
}

// A campaign win condition is only as good as the omegas it reads, so the goal
// checker is exercised against the solver directly rather than through the UI.
if (hasCampaign) {
  console.log("\nwin conditions read the solver, not the draw path");
  const wc = await page.evaluate(() => {
    const L = window.__L, g = L.g(), out = [];
    for (let i = 0; i < L.levels().length; i++) {
      L.solve(i);
      for (const t of g.tile_list.filter((x) => x.role === "driven")) {
        const s = t.spec || {};
        if (!s.ratio) continue;
        const o = g._anchor(s.ratio.of);
        // the ratio the solver produced, recomputed from pitch-line velocities
        out.push({ i: i + 1, want: s.ratio.value, got: t.omega / o.omega, ok: g.target_ok(t) });
      }
    }
    return out;
  });
  const off = wc.filter((r) => Math.abs(r.got - r.want) > Math.abs(r.want) * 1e-6);
  check(`${wc.length} ratio goals are exact to 1e-6, not merely inside tolerance`, off.length === 0,
    off.map((r) => `L${r.i} want ${r.want} got ${r.got}`).join(" | "));
  check("every ratio goal is satisfied at the solution", wc.every((r) => r.ok));
}

// ---------------------------------------------------------------- interaction
// The chrome layer sits over the canvas, so every pointer path it could have
// broken gets exercised with REAL mouse events, not synthetic calls.
console.log("\ninteraction through the chrome layer");
{
  const ip = await openPage(browser, { file: FILE, width: 1280, height: 800, dpr: 1 });
  await ip.addScriptTag({ content: preamble });
  await ip.evaluate(() => { window.__GW.game.start_free_play(); window.__GW.step(2, 1 / 60); });
  const hasChrome = await ip.evaluate(() => !!document.getElementById("rail"));
  if (!hasChrome) {
    console.log("  – skipped: this build has no chrome layer");
    await ip.close();
  } else {
  const toScreen = (w) => ip.evaluate((wp) => {
    const g = window.__GW.game;
    return [g.camPanX + g.zoom * wp[0], g.camPanY + g.zoom * (g.H - wp[1])];
  }, w);

  // 1. a DOM rail tile adds a part to the canvas world
  const before = await ip.evaluate(() => window.__GW.game.tile_list.length);
  await ip.click('#rail .tile[aria-label="Add U4"]');
  const after = await ip.evaluate(() => window.__GW.game.tile_list.length);
  check("rail tile adds a part", after === before + 1, `${before} -> ${after}`);

  // 2. tap-to-drive: press and release on a gear with no movement
  const tap = await ip.evaluate(() => {
    const g = window.__GW.game;
    const t = g.tile_list.find((x) => !x.is_driver && !x.is_rack() && !x.is_ring());
    return { uid: t.uid, pos: t.pos.slice(), was: t.is_driver };
  });
  let p1 = await toScreen(tap.pos);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  await ip.mouse.up();
  const tapped = await ip.evaluate((uid) => {
    const g = window.__GW.game, t = g.tile_list.find((x) => x.uid === uid);
    if (!t) return { driver: false, selected: false, gone: true, mode: g.mode, n: g.tile_list.length };
    return { driver: t.is_driver, selected: g.selected_driver === t };
  }, tap.uid);
  check("tap on a gear makes it the motor", tapped.driver && tapped.selected,
    JSON.stringify(tapped));

  // 3. drag: the gear follows the pointer and seats by pitch tangency
  const drag = await ip.evaluate(() => {
    const g = window.__GW.game;
    const t = g.tile_list.find((x) => !x.anchored && !x.is_rack() && !x.is_ring() && !x.partner);
    return { uid: t.uid, pos: t.pos.slice(), step: g.step };
  });
  p1 = await toScreen(drag.pos);
  const p2 = await toScreen([drag.pos[0] + drag.step * 3, drag.pos[1] - drag.step * 2.5]);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await ip.mouse.move(p1[0] + (p2[0] - p1[0]) * i / 8, p1[1] + (p2[1] - p1[1]) * i / 8);
  }
  await ip.mouse.up();
  const moved = await ip.evaluate((d) => {
    const t = window.__GW.game.tile_list.find((x) => x.uid === d.uid);
    return Math.hypot(t.pos[0] - d.pos[0], t.pos[1] - d.pos[1]);
  }, drag);
  check("drag moves a gear", moved > drag.step, `moved ${moved.toFixed(1)}px`);

  // 4. drop on the tool rail scraps the part (the rail rect the chrome publishes)
  const scrap = await ip.evaluate(() => {
    const g = window.__GW.game;
    const t = g.tile_list.find((x) => !x.anchored && !x.is_rack() && !x.is_ring() && !x.partner);
    const r = document.getElementById("rail").getBoundingClientRect();
    return { uid: t.uid, pos: t.pos.slice(), n: g.tile_list.length,
             rail: [r.left + r.width / 2, r.top + r.height * 0.75] };
  });
  p1 = await toScreen(scrap.pos);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  await ip.mouse.move((p1[0] + scrap.rail[0]) / 2, (p1[1] + scrap.rail[1]) / 2);
  await ip.mouse.move(scrap.rail[0], scrap.rail[1]);
  await ip.mouse.up();
  const left = await ip.evaluate((uid) => ({
    n: window.__GW.game.tile_list.length,
    gone: !window.__GW.game.tile_list.some((x) => x.uid === uid),
  }), scrap.uid);
  check("drop on the tool rail scraps a part", left.gone && left.n === scrap.n - 1,
    `${scrap.n} -> ${left.n}, gone=${left.gone}`);

  // 5. a title-screen level row starts that level
  await ip.evaluate(() => { window.__GW.game.enter_main_menu(); window.__GW.step(2, 1 / 60); });
  await ip.waitForTimeout(120);
  await ip.click("#title-list .btn:nth-child(3)");
  const lvl = await ip.evaluate(() => ({ mode: window.__GW.game.mode, idx: window.__GW.game.level_idx }));
  check("title level row starts the level", lvl.mode === "puzzle" && lvl.idx === 1, JSON.stringify(lvl));

  // 6. dragging an inventory gear into place solves the level and shows the sheet
  const seat = await ip.evaluate(() => {
    const g = window.__GW.game;
    const loose = g.tile_list.filter((t) => !t.anchored);
    // seat all but the last by hand, drag the last one with the mouse
    const sol = window.__GW.LEVELS[g.level_idx].solution;
    for (let i = 0; i < sol.length - 1; i++) {
      const p = [g.origin[0] + g.Rp2 * sol[i].pos[0], g.origin[1] + g.Rp2 * sol[i].pos[1]];
      loose[i].pos = p.slice(); g._snap_gear(loose[i], p.slice());
    }
    g._mark_dirty();
    const last = sol[sol.length - 1], t = loose[sol.length - 1];
    return { uid: t.uid, from: t.pos.slice(),
             to: [g.origin[0] + g.Rp2 * last.pos[0], g.origin[1] + g.Rp2 * last.pos[1]] };
  });
  p1 = await toScreen(seat.from);
  const p3 = await toScreen(seat.to);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await ip.mouse.move(p1[0] + (p3[0] - p1[0]) * i / 10, p1[1] + (p3[1] - p1[1]) * i / 10);
  }
  await ip.mouse.up();
  // one frame past the win, but well before the reveal beat has elapsed
  await ip.evaluate(() => window.__GW.step(6, 1 / 60));
  await ip.waitForTimeout(120);
  const early = await ip.evaluate(() => ({
    win: window.__GW.game.win,
    overlay: document.getElementById("winscreen").classList.contains("on"),
  }));
  check("mouse-dragging the last gear solves the level", early.win, JSON.stringify(early));
  check("the solved mechanism gets a beat to itself before any UI appears",
    early.win && !early.overlay, JSON.stringify(early));
  await ip.evaluate(() => window.__GW.step(120, 1 / 60));
  await ip.waitForTimeout(200);
  const won = await ip.evaluate(() => {
    const g = window.__GW.game;
    const card = document.querySelector("#winscreen .card").getBoundingClientRect();
    // the sheet must not sit over the mechanism it is congratulating
    const parts = g.tile_list.filter((t) => t.anchored)
      .map((t) => g.camPanY + g.zoom * (g.H - t.pos[1]));
    return {
      win: g.win,
      overlay: document.getElementById("winscreen").classList.contains("on"),
      next: !!document.querySelector('#win-acts .btn[data-id="next"]'),
      clear: parts.every((y) => y < card.top - 8),
      framed: Math.abs(g.zoom - 1) > 1e-3 || Math.abs(g.camPanX) > 1 || Math.abs(g.camPanY) > 1,
    };
  });
  check("completion sheet appears with a Next Level action", won.overlay && won.next, JSON.stringify(won));
  check("the completion sheet leaves the built mechanism fully visible", won.clear, JSON.stringify(won));
  check("the camera frames the solved mechanism", won.framed, JSON.stringify(won));

  // 7. and Next Level advances
  if (won.next) {
    await ip.click('#win-acts .btn[data-id="next"]');
    const nx = await ip.evaluate(() => ({ idx: window.__GW.game.level_idx, win: window.__GW.game.win }));
    check("Next Level advances", nx.idx === 2 && nx.win === false, JSON.stringify(nx));
  }
  await ip.close();
  }
}

// ------------------------------------------------------------------- baseline
console.log("\nbehavioural baseline");
const fingerprint = await page.evaluate(async (scenes) => {
  const out = {};
  const round = (v) => Math.round(v * 1e9) / 1e9;
  for (const [name, src] of scenes) {
    // eslint-disable-next-line no-new-func
    new Function("return (" + src + ")")()();
    const g = window.__GW.game;
    for (let f = 0; f < 90; f++) g.update(1 / 60);
    out[name] = {
      win: g.win,
      edges: g.mesh_edges.length,
      tiles: g.tile_list.map((t) => [
        t.label, round(t.pos[0]), round(t.pos[1]), round(t.angle),
        round(t.omega), round(t.torque), round(t.wind || 0), round(t.s || 0),
        !!t.locked, !!t.is_driver, t.partner ? 1 : 0,
      ]),
    };
  }
  return out;
}, Object.entries(SCENES).map(([k, v]) => [k, v.build.toString()]));

if (UPDATE || !existsSync(BASELINE)) {
  mkdirSync(path.dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(fingerprint, null, 1) + "\n");
  console.log(`  ✓ baseline written (${path.relative(ROOT, BASELINE)})`);
  pass++;
} else {
  const want = JSON.parse(readFileSync(BASELINE, "utf8"));
  for (const name of Object.keys(want)) {
    const a = JSON.stringify(want[name]), b = JSON.stringify(fingerprint[name]);
    let detail = "";
    if (a !== b) {
      const wa = want[name], wb = fingerprint[name] || { tiles: [] };
      if (wa.win !== wb.win) detail += `win ${wa.win}->${wb.win} `;
      if (wa.edges !== wb.edges) detail += `edges ${wa.edges}->${wb.edges} `;
      if (wa.tiles.length !== wb.tiles.length) detail += `tiles ${wa.tiles.length}->${wb.tiles.length} `;
      else {
        for (let i = 0; i < wa.tiles.length && detail.length < 300; i++) {
          const x = JSON.stringify(wa.tiles[i]), y = JSON.stringify(wb.tiles[i]);
          if (x !== y) detail += `\n      [${i}] ${x}\n      [${i}] ${y}`;
        }
      }
    }
    check(`${name}: physics fingerprint unchanged`, a === b, detail);
  }
}

await browser.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.error("\nFAILED:\n - " + failures.join("\n - ")); process.exit(1); }
