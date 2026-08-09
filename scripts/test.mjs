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
  // The inventory starts with the answer's parts, in order — the harness indexes
  // loose parts by solution position — and then carries spares, so that "how few
  // parts" is a question the level can actually ask.
  check(`${label} ships ${lv.inventory.length - lv.solution.length} spare(s) beyond its ${lv.solution.length}-part answer`,
    lv.inventory.length > lv.solution.length &&
    lv.solution.every((sp, k) => lv.inventory[k] === sp.type),
    `inventory ${lv.inventory.join(",")} vs solution ${lv.solution.map((s) => s.type).join(",")}`);
  check(`${label} scores three stars for the ${lv.solution.length}-part answer`,
    r.stars === 3 && r.partsUsed === lv.solution.length,
    `stars=${r.stars} used=${r.partsUsed} par=${lv.solution.length}`);
}

// ------------------------------------------------------------------ no cheese
console.log("\nno cheese");
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i], label = `${i + 1} "${lv.name}"`;
  // Now that every level ships spares, "cannot be won badly" is the wrong bar —
  // a scruffy build that happens to satisfy the goal HAS satisfied the goal, and
  // the score is what should punish it. The bar is: a degenerate placement must
  // never earn three stars.
  const heap = await page.evaluate((i) => window.__L.heap(i), i);
  check(`${label} is not solved WELL by tipping the inventory into a heap`,
    heap.win === false || heap.stars < 3,
    `win=${heap.win} stars=${heap.stars} used=${heap.partsUsed}/${heap.par}`);
  const naive = await page.evaluate((i) => window.__L.naive(i), i);
  if (lv.naive_solves) {
    check(`${label} IS won by the obvious chain (declared: it is the tutorial)`, naive.win === true,
      JSON.stringify(naive.targets));
  } else {
    check(`${label} is not solved WELL by blindly chaining off the drive`,
      naive.win === false || naive.stars < 3,
      `win=${naive.win} stars=${naive.stars} used=${naive.partsUsed}/${naive.par}`);
  }
  // every placed part is load-bearing
  const bad = [];
  for (let k = 0; k < lv.solution.length; k++) {
    const r = await page.evaluate(([i, k]) => window.__L.solve(i, { skip: k }), [i, k]);
    if (r.win) bad.push(`${k}:${lv.solution[k].type}`);
  }
  check(`${label} needs all ${lv.solution.length} of its parts`, bad.length === 0,
    "still wins without " + bad.join(", "));
  // The board's fixtures must not look like the stock in the tray. Anchors are cast
  // in role metal — amber for the motor, green for what it is asking for — so "can I
  // pick this up" is answered by colour before any ring or label is read. Springs are
  // exempt: their coil already runs green to red to show the wind.
  const paint = await page.evaluate((i) => {
    const g = window.__GW.game;
    g.start_level(i);
    const A = window.__GW.alloy_for;
    const anchors = g.tile_list.filter(t => t.anchored && !t.is_spring() && !t.is_rack() && !t.is_ring());
    const loose = g.tile_list.filter(t => !t.anchored);
    return { anchors: anchors.map(t => [t.role, A(t)]), loose: [...new Set(loose.map(t => A(t)))] };
  }, i);
  const clash = paint.anchors.filter(([, c]) => paint.loose.includes(c));
  check(`${label} paints its anchors in role metal, not stock metal`,
    clash.length === 0, JSON.stringify({ clash, loose: paint.loose }));
  // A player found this one: spin a target up, cut the gear feeding it, and cash the
  // win while it is still coasting. Cut the train and watch every frame of the
  // spin-down — no target may report satisfied on any of them.
  const coast = await page.evaluate((i) => window.__L.coast(i), i);
  check(`${label} cannot be won off a coasting gear`,
    coast.wind || coast.everOk === false,
    JSON.stringify(coast));
  // ...and the check above only means anything if the parts really were still turning.
  if (!coast.wind) {
    check(`${label} coast test is real: targets were still turning after the cut`,
      coast.stillMoving > 0, JSON.stringify(coast));
  }
}

// Direction is part of several goals, and a gear advancing more than half a tooth
// pitch per frame strobes — its direction is genuinely unreadable, the wagon-wheel
// effect. This is the speed limit that keeps every campaign board legible.
console.log("\nnothing strobes");
for (let i = 0; i < LEVELS.length; i++) {
  const r = await page.evaluate((i) => window.__L.strobe(i), i);
  check(`${i + 1} "${LEVELS[i].name}" spins slowly enough to read its direction`,
    r.steady <= 0.5 + 1e-9 && r.peak <= 0.75 + 1e-9,
    `steady ${r.steady} (${r.steadyPart})  peak ${r.peak} (${r.peakPart})  — 1.0 is ambiguous`);
}

// Readouts that drift around a board nobody is touching are the single most
// distracting thing on screen, and the cause is subtle enough to come back.
console.log("\nreadouts hold still");
for (const i of [6, 11, 19]) {
  const r = await page.evaluate((i) => window.__L.pillDrift(i), i);
  check(`${i + 1} "${LEVELS[i].name}" — ${r.pills} readouts do not move over 4s of settling`,
    r.drift < 0.5, JSON.stringify(r));
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

  // 4b. the title screen's level list must actually scroll. The chrome layer is
  // pointer-events:none with only buttons opting back in, which left the wheel
  // falling through to the canvas and zooming the board instead.
  await ip.evaluate(() => { window.__GW.game.enter_main_menu(); window.__GW.step(2, 1 / 60); });
  await ip.waitForTimeout(140);
  const scroll = await ip.evaluate(async () => {
    const el = document.getElementById("title-list");
    const before = el.scrollTop, zoom0 = window.__GW.game.zoom;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 400, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
    return { scrollable: el.scrollHeight > el.clientHeight + 4,
             hit: getComputedStyle(el).pointerEvents !== "none",
             rows: el.querySelectorAll(".btn").length,
             moved: el.scrollTop > before, zoomChanged: window.__GW.game.zoom !== zoom0 };
  });
  check(`the title list holds all ${scroll.rows} rows and can be scrolled`,
    scroll.rows === 21 && scroll.scrollable && scroll.hit && !scroll.zoomChanged,
    JSON.stringify(scroll));

  // 4c. the mobile dock is wider than the screen — 93px in a level, 997px in free
  // play — and had exactly the same defect as the title list: overflow-x:auto on an
  // element that cannot receive a pointer. Checked at 390px, in both modes.
  {
    const mp = await openPage(browser, { file: FILE, width: 390, height: 844, dpr: 1 });
    await mp.addScriptTag({ content: preamble });
    for (const [mode, how] of [["puzzle", () => window.__GW.game.start_level(19)],
                               ["free", () => window.__GW.game.start_free_play()]]) {
      await mp.evaluate(how);
      await mp.evaluate(() => window.__GW.step(3, 1 / 60));
      await mp.waitForTimeout(320);
      const d = await mp.evaluate(() => {
        const el = document.getElementById("rail"), cs = getComputedStyle(el);
        const fade = document.getElementById("railfade");
        const before = el.scrollLeft;
        const fade0 = getComputedStyle(fade).opacity;
        el.scrollLeft = 9999;
        el.dispatchEvent(new Event("scroll"));
        return { over: el.scrollWidth - el.clientWidth, hit: cs.pointerEvents !== "none",
                 moved: el.scrollLeft > before, snap: cs.scrollSnapType !== "none",
                 fade0: +fade0, want: fade.style.opacity };
      });
      // the fade is a 140ms transition, so the computed value has to be read after it
      await mp.waitForTimeout(240);
      d.fade1 = await mp.evaluate(() => +getComputedStyle(document.getElementById("railfade")).opacity);
      check(`mobile ${mode} dock scrolls its ${d.over}px of overflow`,
        d.over <= 0 || (d.hit && d.moved), JSON.stringify(d));
      // The fade is the only thing telling a thumb there is more dock off-screen, and
      // the only thing that must not sit over the last button once there isn't.
      check(`mobile ${mode} dock fades its scrolling edge, and stops at the end`,
        d.over <= 0 ? d.fade0 === 0 : (d.fade0 === 1 && d.fade1 === 0), JSON.stringify(d));
    }
    await mp.close();
  }

  // 5. a title-screen level row starts that level
  await ip.evaluate(() => { window.__GW.game.enter_main_menu(); window.__GW.step(2, 1 / 60); });
  await ip.waitForTimeout(120);
  await ip.click("#title-list .btn:nth-child(3)");
  const lvl = await ip.evaluate(() => ({ mode: window.__GW.game.mode, idx: window.__GW.game.level_idx }));
  check("title level row starts the level", lvl.mode === "puzzle" && lvl.idx === 1, JSON.stringify(lvl));
  // Let the chrome layer catch up before pointing at the board. With the real
  // loop running this is automatic; here the page only draws when we step it, and
  // a title screen that has not been told to hide yet still owns the pointer.
  await ip.evaluate(() => window.__GW.step(2, 1 / 60));
  await ip.waitForTimeout(80);
  const cam0 = await ip.evaluate(() => { const g = window.__GW.game; return [g.zoom, g.camPanX, g.camPanY]; });

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
  // far enough past the win for the target to be turning, still well inside the
  // 0.85s reveal beat that starts when the win latches
  await ip.evaluate(() => window.__GW.step(40, 1 / 60));
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
      cam: [g.zoom, g.camPanX, g.camPanY],
      // Invisible-but-clickable is the worst failure mode a control has, and a
      // contrast audit cannot see it: it measures colour, not opacity.
      acts: [...document.querySelectorAll("#win-acts .btn")].map((b) => {
        const cs = getComputedStyle(b), r = b.getBoundingClientRect();
        return { t: b.textContent.trim(), op: +cs.opacity,
                 inCard: r.top >= card.top - 1 && r.bottom <= card.bottom + 1 };
      }),
    };
  });
  check("completion sheet appears with a Next Level action", won.overlay && won.next, JSON.stringify(won));
  check("the completion sheet leaves the built mechanism fully visible", won.clear, JSON.stringify(won));
  check(`the ${won.acts.length} completion actions are actually visible`,
    won.acts.length > 0 && won.acts.every((a) => a.op >= 0.9 && a.inCard),
    JSON.stringify(won.acts));
  check("the camera re-frames onto the solved mechanism",
    won.cam.some((v, i) => Math.abs(v - cam0[i]) > 1),
    `before ${cam0.map((v) => v.toFixed(1))} after ${won.cam.map((v) => v.toFixed(1))}`);

  // 6a2. mesh ratio chips: on every mesh in Mesh mode, and — the useful bit —
  // PROSPECTIVELY on whatever the part in your hand would mesh with if you dropped
  // it here. That preview is only possible because a mesh ratio is the pair's tooth
  // ratio, so it needs no running train and no settled solve.
  {
    const chips = await ip.evaluate(() => {
      const g = window.__GW.game, out = {};
      const count = () => { window.__GW.render(); return g._chips; };
      g.readout_mode = "ratio"; g.drag_tile = null; g._hover_tile = null;
      out.ratioIdle = count();
      g.readout_mode = "mesh";
      out.meshAll = count();
      // now pick a loose part up and hold it just off a tangency it could take
      g.readout_mode = "ratio";
      const t = g.tile_list.find((x) => !x.anchored && x.drive_ratio != null);
      const o = g.tile_list.find((x) => x !== t && x.anchored);
      const R = t.pitch_r() + o.pitch_r();
      g.drag_tile = t; g.dragging = true;
      const hold = (k) => {
        t.pos = [o.pos[0] + R * k, o.pos[1]];
        const n = count();
        const mine = window.__GW.chips.slice();
        return { n, a: Math.max(0, ...mine.map((c) => c.a)) };
      };
      const near = hold(0.995);                       // all but touching
      const far = hold(1 + (g.mesh_tol * 3.4) / R);   // out near the edge of the band
      out.holding = near.n;
      out.nearAlpha = +near.a.toFixed(3);
      out.farAlpha = +far.a.toFixed(3);
      // the part in hand must not also be flying its own "— / 0 rpm" pill
      t.pos = [o.pos[0] + R * 0.995, o.pos[1]];
      count();
      out.heldPill = window.__GW.readouts.some((p) => p.t === t);
      // and no chip may land on a pill
      out.overlap = window.__GW.chips.some((c) => window.__GW.readouts.some((p) =>
        Math.abs(p.cx - c.cx) < (p.bw + c.w) / 2 && Math.abs(p.cy - c.cy) < (p.bh + c.h) / 2));
      g.drag_tile = null; g.dragging = false;
      return out;
    });
    check("Mesh mode labels every mesh; Ratio mode labels none until you reach for one",
      chips.ratioIdle === 0 && chips.meshAll >= 2, JSON.stringify(chips));
    check("a part in hand previews the ratio it would create",
      chips.holding >= 1, JSON.stringify(chips));
    // The fade is the whole reason carrying a part across a crowded board is not a
    // strobe of numbers: brightness has to mean "how close this mesh is to being real".
    check("the in-hand preview fades in as the part approaches tangency",
      chips.nearAlpha > 0.9 && chips.farAlpha < 0.35 && chips.farAlpha > 0,
      JSON.stringify({ near: chips.nearAlpha, far: chips.farAlpha }));
    check("the part in hand drops its own readout pill instead of talking over the chip",
      chips.heldPill === false, JSON.stringify(chips));
    check("no mesh chip lands on a readout pill", chips.overlap === false, JSON.stringify(chips));
  }

  // 6b. the reported "false positive": drop the last gear correctly, then grab it
  // again during the 0.85s before the sheet appears. The board must stay live and
  // the part must follow the pointer — it used to be frozen by the win, and before
  // that a target still coasting from a broken train could latch a win off a gear
  // that was only HOVERING, which then landed wherever the player let go.
  const regrab = await ip.evaluate(() => {
    const g = window.__GW.game;
    const t = g.tile_list.find((x) => !x.anchored && x.drive_ratio != null);
    return { uid: t.uid, pos: t.pos.slice(), step: g.step, win: g.win };
  });
  p1 = await toScreen(regrab.pos);
  const p5 = await toScreen([regrab.pos[0], regrab.pos[1] + regrab.step * 2.4]);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await ip.mouse.move(p1[0] + (p5[0] - p1[0]) * i / 6, p1[1] + (p5[1] - p1[1]) * i / 6);
  }
  const held = await ip.evaluate((uid) => {
    const g = window.__GW.game, t = g.tile_list.find((x) => x.uid === uid);
    return { dragging: g.dragging, isIt: g.drag_tile === t, cam: !!g._cam_to || !!g._cam_pending };
  }, regrab.uid);
  await ip.mouse.up();
  check("a solved board stays live: the part can be picked back up and follows",
    regrab.win && held.dragging && held.isIt && !held.cam,
    JSON.stringify({ regrab: regrab.win, ...held }));

  // 7. stacking a BIG gear onto a SMALL one, with a real mouse and a sloppy drop.
  // Level 10 needs exactly this (a speed-increasing stage puts the pinion on the
  // shaft of the wheel it drives), and it used to be a 10px target on desktop and
  // 5px on a phone. `npm run play` measures every level's tolerance; this pins the
  // one that was genuinely unplayable so the capture constant cannot quietly
  // regress back to scaling off the base gear alone.
  await ip.evaluate(() => { window.__GW.game.start_level(9); window.__GW.step(2, 1 / 60); });
  const st = await ip.evaluate(() => {
    const g = window.__GW.game, U = g.Rp2;
    const sol = window.__GW.LEVELS[9].solution;
    const loose = g.tile_list.filter((t) => !t.anchored);
    const p = [g.origin[0] + U * sol[0].pos[0], g.origin[1] + U * sol[0].pos[1]];
    loose[0].pos = p.slice(); g._snap_gear(loose[0], p.slice());   // seat the U1 base
    g._mark_dirty();
    // release the U2 a third of a U2-radius off the U1's centre
    return { uid: loose[1].uid, from: loose[1].pos.slice(),
             to: [loose[0].pos[0] + U * 0.33, loose[0].pos[1] - U * 0.2] };
  });
  p1 = await toScreen(st.from);
  const p4 = await toScreen(st.to);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await ip.mouse.move(p1[0] + (p4[0] - p1[0]) * i / 10, p1[1] + (p4[1] - p1[1]) * i / 10);
  }
  await ip.mouse.up();
  await ip.evaluate(() => window.__GW.step(90, 1 / 60));
  const stacked = await ip.evaluate((uid) => {
    const g = window.__GW.game, t = g.tile_list.find((x) => x.uid === uid);
    return { partner: !!t.partner, win: g.win };
  }, st.uid);
  check("a sloppy drop stacks a big gear onto a small one", stacked.partner && stacked.win,
    JSON.stringify(stacked));

  // 8. and Next Level advances
  if (won.next) {
    await ip.evaluate(() => { window.__GW.game.start_level(1); window.__GW.step(2, 1 / 60); });
    await ip.evaluate(() => { const g = window.__GW.game; g.win = true; g._win_at = g.anim - 2; });
    await ip.evaluate(() => window.__GW.step(2, 1 / 60));
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
