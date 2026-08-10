// Difficulty-curve instrumentation.  `npm run curve`
//
// One row per level, measured from the level's own solution spec rather than from
// anything an author wrote down: part count, distinct part types, mesh count, the
// longest train (deepest chain of meshes from any drive), the ratio span across the
// solved board, and whether the level introduces something new.
//
// This exists so "the curve is monotonic-ish" is a measurement, not an opinion. A
// spike is a design smell; the report flags the largest jumps so a round of the
// gauntlet has somewhere to look.
import { launch, openPage } from "./browser.mjs";
import { levelKit } from "./levels.mjs";

const browser = await launch();
const page = await openPage(browser, { file: "gear_works.html", width: 1280, height: 800, dpr: 1 });
await page.addScriptTag({ content: levelKit });

const rows = await page.evaluate(() => {
  const L = window.__L, g = L.g(), out = [];
  // What each level introduces that no earlier level has. Derived, not declared:
  // a level is a milestone if it uses a win-condition kind, a part or an element
  // that has not appeared before.
  const seen = new Set();
  for (let i = 0; i < L.levels().length; i++) {
    const lv = L.levels()[i];
    // A milestone is a new MECHANIC, not a new field: min_rpm and max_rpm are two
    // faces of "hit a rate", and a hand always arrives with its dial.
    const fresh = [], notes = [];
    const note = (k) => { if (!seen.has(k)) { seen.add(k); fresh.push(k); } };
    const aside = (k) => { if (!seen.has(k)) { seen.add(k); notes.push(k); } };
    for (const v of lv.driven) {
      if (v.spin !== undefined) note("spin");
      if (v.min_rpm !== undefined || v.max_rpm !== undefined) note("rate");
      if (v.wind_turns !== undefined) note("spring");
      if (v.ratio) note("ratio");
      if (v.hand || v.dial) note("hand+dial");
    }
    if ((lv.solution || []).some((s) => s.stack !== undefined)) note("stack");
    if (lv.drives.length > 1) aside("two motors");
    if (lv.driven.length > 1) aside("branch");

    const r = L.solve(i);
    const types = new Set(r.parts.filter((p) => !p.loose || true).map((p) => p.label));
    // longest train: BFS depth over the mesh graph from every drive
    const tiles = g.tile_list;
    const adj = new Map(tiles.map((t) => [t, []]));
    for (const [a, b] of g.mesh_edges) { adj.get(a).push(b); adj.get(b).push(a); }
    for (const t of tiles) if (t.partner && adj.has(t.partner)) adj.get(t).push(t.partner);
    let longest = 0;
    for (const d of tiles.filter((t) => t.role === "drive")) {
      const dist = new Map([[d, 0]]), q = [d];
      while (q.length) {
        const c = q.shift();
        for (const n of adj.get(c)) if (!dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); }
      }
      longest = Math.max(longest, ...dist.values());
    }
    const spins = tiles.filter((t) => Math.abs(t.omega) > 1e-6).map((t) => Math.abs(t.omega));
    const span = spins.length ? Math.max(...spins) / Math.min(...spins) : 1;
    out.push({
      n: i + 1, name: lv.name,
      parts: (lv.solution || []).length,
      types: new Set((lv.solution || []).map((s) => s.type)).size,
      stacks: (lv.solution || []).filter((s) => s.stack !== undefined).length,
      mesh: r.edges, longest, span: +span.toFixed(1),
      targets: lv.driven.length,
      fresh: fresh.join("+"), notes: notes.join("+"),
      win: r.win,
    });
  }
  return out;
});

// A single difficulty index, so the shape can be compared round to round. Weights
// are stated here and nowhere else; they are a lens on the measurements above, not
// a truth about the levels.
const score = (r) => r.parts * 1.0 + r.stacks * 1.6 + r.longest * 0.5 +
                     (r.targets - 1) * 1.2 + Math.log10(Math.max(1, r.span)) * 1.1;

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
console.log("\n  #  level              parts  types  stk  mesh  train  span   tgts  new            diff");
console.log("  " + "-".repeat(88));
let prev = null, jumps = [];
for (const r of rows) {
  const d = score(r);
  const bar = "█".repeat(Math.max(1, Math.round(d)));
  console.log(`  ${rpad(r.n, 2)} ${pad(r.name, 18)} ${rpad(r.parts, 5)} ${rpad(r.types, 6)} ` +
    `${rpad(r.stacks, 4)} ${rpad(r.mesh, 5)} ${rpad(r.longest, 6)} ${rpad(r.span, 6)} ` +
    `${rpad(r.targets, 5)}  ${pad(r.fresh || (r.notes ? "(" + r.notes + ")" : "·"), 14)} ${rpad(d.toFixed(1), 4)} ${bar}`);
  if (prev !== null) jumps.push({ n: r.n, name: r.name, d: d - prev });
  prev = d;
}

const unsolved = rows.filter((r) => !r.win);
if (unsolved.length) console.log(`\n  !! ${unsolved.length} level(s) did not solve from their spec: ` +
  unsolved.map((r) => r.n + " " + r.name).join(", "));

jumps.sort((a, b) => b.d - a.d);
console.log("\n  largest step ups:   " + jumps.slice(0, 3).map((j) => `${j.n} ${j.name} +${j.d.toFixed(1)}`).join(" · "));
jumps.sort((a, b) => a.d - b.d);
console.log("  largest step downs: " + jumps.slice(0, 3).map((j) => `${j.n} ${j.name} ${j.d.toFixed(1)}`).join(" · "));

const news = rows.filter((r) => r.fresh);
console.log("\n  new elements at:    " + news.map((r) => r.n).join(", "));
const adjacent = news.filter((r, i) => i > 0 && r.n === news[i - 1].n + 1);
console.log("  " + (adjacent.length
  ? `!! ${adjacent.length} new element(s) land in back-to-back levels: ${adjacent.map((r) => r.n).join(", ")}`
  : "no two new elements land in back-to-back levels"));

await browser.close();
