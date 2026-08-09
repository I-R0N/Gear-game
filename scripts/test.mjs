// Headless regression suite.  `npm test`
//
// Three layers, in increasing strictness:
//   1. solvability  — every level can still be completed by seating its inventory
//   2. invariants   — mesh ratios, shaft coupling, rack kinematics, no NaNs
//   3. baseline     — a numeric fingerprint of the whole board after a fixed number
//                     of fixed-dt frames, compared against tests/baseline.json.
//                     This is what enforces "presentation-only": any change to the
//                     physics, meshing or snapping shifts the fingerprint.
//
//   node scripts/test.mjs --update    regenerate the baseline (only when the
//                                     behaviour change is intended and reviewed)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { launch, openPage, ROOT } from "./browser.mjs";
import { SCENES, preamble } from "./scenes.mjs";

const UPDATE = process.argv.includes("--update");
const FILE = (() => {
  const i = process.argv.indexOf("--file");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "gear_works.html";
})();
const BASELINE = path.join(ROOT, "tests", "baseline.json");

let pass = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(name + (detail ? `\n      ${detail}` : "")); console.log(`  ✗ ${name}${detail ? "\n      " + detail : ""}`); }
}

const browser = await launch();
const page = await openPage(browser, { file: FILE, width: 1280, height: 800, dpr: 1 });
await page.addScriptTag({ content: preamble });

// ---------------------------------------------------------------- solvability
console.log("\nlevel solvability");
// which drive/target chain each inventory gear belongs to, in inventory order
const PAIRING = [[0], [0, 0, 0], [0, 0, 1, 1], [0, 0], [0, 0]];
const solved = await page.evaluate((pairing) => {
  const g = window.__GW.game;
  const out = [];
  for (let idx = 0; idx < window.__GW.LEVELS.length; idx++) {
    g.start_level(idx);
    const loose = g.tile_list.filter((t) => !t.anchored);
    const drives = g.tile_list.filter((t) => t.role === "drive");
    const targets = g.tile_list.filter((t) => t.role === "driven");
    const head = drives.slice();
    loose.forEach((t, i) => {
      const k = pairing[idx][i];
      const from = head[k], to = targets[k];
      let dx = to.pos[0] - from.pos[0], dy = to.pos[1] - from.pos[1];
      const d = Math.hypot(dx, dy) || 1;
      const R = from.pitch_r() + t.pitch_r();
      const p = [from.pos[0] + (dx / d) * R, from.pos[1] + (dy / d) * R];
      t.pos = p.slice();
      g._snap_gear(t, p.slice());
      head[k] = t;
    });
    g._mark_dirty();
    for (let f = 0; f < 240; f++) g.update(1 / 60);
    out.push({
      name: window.__GW.LEVELS[idx].name,
      win: g.win,
      edges: g.mesh_edges.length,
      targets: targets.map((t) => t.omega),
    });
  }
  return out;
}, PAIRING);

for (const r of solved) {
  check(`level "${r.name}" solves`, r.win === true,
    r.win ? "" : `win=${r.win} edges=${r.edges} target omegas=${r.targets.map((o) => o.toFixed(4)).join(", ")}`);
  check(`level "${r.name}" targets all spinning`,
    r.targets.length > 0 && r.targets.every((o) => Math.abs(o) > 1e-2),
    r.targets.map((o) => o.toFixed(4)).join(", "));
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

// ---------------------------------------------------------------- interaction
// The chrome layer sits over the canvas, so every pointer path it could have
// broken gets exercised with REAL mouse events, not synthetic calls.
console.log("\ninteraction through the chrome layer");
{
  const ip = await openPage(browser, { file: FILE, width: 1280, height: 800, dpr: 1 });
  await ip.addScriptTag({ content: preamble });
  // `--file <pre-overhaul build>` is how the baseline gets re-anchored, and that
  // build predates the chrome layer. Skip rather than fail: the point of that
  // run is the physics fingerprint, not the DOM.
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

  // 6. dragging an inventory gear into place solves the level and shows the overlay
  const seat = await ip.evaluate(() => {
    const g = window.__GW.game;
    const loose = g.tile_list.filter((t) => !t.anchored);
    const drive = g.tile_list.find((t) => t.role === "drive");
    const targ = g.tile_list.find((t) => t.role === "driven");
    // seat two by hand, drag the third with the mouse
    [-2, 0].forEach((u, i) => {
      const p = [g.origin[0] + g.Rp2 * u, drive.pos[1]];
      loose[i].pos = p.slice(); g._snap_gear(loose[i], p.slice());
    });
    g._mark_dirty();
    const t = loose[2];
    return { uid: t.uid, from: t.pos.slice(), to: [g.origin[0] + g.Rp2 * 2, targ.pos[1]] };
  });
  p1 = await toScreen(seat.from);
  const p3 = await toScreen(seat.to);
  await ip.mouse.move(p1[0], p1[1]);
  await ip.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await ip.mouse.move(p1[0] + (p3[0] - p1[0]) * i / 10, p1[1] + (p3[1] - p1[1]) * i / 10);
  }
  await ip.mouse.up();
  await ip.evaluate(() => window.__GW.step(120, 1 / 60));
  await ip.waitForTimeout(200);
  const won = await ip.evaluate(() => ({
    win: window.__GW.game.win,
    overlay: document.getElementById("winscreen").classList.contains("on"),
    next: !!document.querySelector('#win-acts .btn[data-id="next"]'),
  }));
  check("mouse-dragging the last gear solves the level", won.win, JSON.stringify(won));
  check("win overlay appears with a Next Level action", won.overlay && won.next, JSON.stringify(won));

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
console.log("\nbehavioural baseline (presentation-only guard)");
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
