// Screenshot harness.
//   node scripts/shots.mjs                       -> shots/after/*.png from gear_works.html
//   node scripts/shots.mjs --out shots/before --file /tmp/original.html
//   node scripts/shots.mjs --only free,planetary
//   node scripts/shots.mjs --mode levels         -> shots/levels/NN-name-{start,solved}-*.png
//                                                   every level, both states, both viewports
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { launch, openPage, ROOT } from "./browser.mjs";
import { SCENES, VIEWPORTS, preamble } from "./scenes.mjs";
import { levelKit } from "./levels.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const mode = arg("mode", "scenes");
const outDir = path.resolve(ROOT, arg("out", mode === "levels" ? "shots/levels" : "shots/after"));
const file = arg("file", "gear_works.html");
const only = arg("only", "").split(",").filter(Boolean);
const clean = process.argv.includes("--clean") || mode === "levels";

if (clean) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await launch();

// ------------------------------------------------------------- levels mode
// Every level, twice: the board as the player first sees it, and the board once
// its own solution spec is seated and the completion flow has run. These are what
// a critique round is actually looking at, so they are rendered at both viewports
// and nothing about them is sampled or skipped.
if (mode === "levels") {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let made = 0;
  for (const vp of VIEWPORTS) {
    const page = await openPage(browser, { file, width: vp.width, height: vp.height });
    await page.addScriptTag({ content: levelKit });
    const n = await page.evaluate(() => window.__GW.LEVELS.length);
    for (let i = 0; i < n; i++) {
      const name = await page.evaluate((i) => window.__GW.LEVELS[i].name, i);
      const tag = String(i + 1).padStart(2, "0") + "-" + slug(name);

      await page.evaluate((i) => { window.__GW.game.start_level(i); }, i);
      await page.evaluate(() => window.__GW.step(30, 1 / 60));
      await page.waitForTimeout(820);   // the previous level's sheet must be fully gone
      await page.evaluate(() => window.__GW.step(2, 1 / 60));
      let out = path.join(outDir, `${tag}-start-${vp.name}.png`);
      await page.screenshot({ path: out });
      made++;

      // solved: seat the spec, then run long enough for the reveal beat, the
      // camera ease and the sheet's transition to have finished
      await page.evaluate((i) => window.__L.solve(i, { frames: 1 }), i);
      await page.evaluate(() => window.__GW.step(200, 1 / 60));
      await page.waitForTimeout(1400);   // the sheet's entrance must be finished, not caught mid-rise
      await page.evaluate(() => window.__GW.step(2, 1 / 60));
      out = path.join(outDir, `${tag}-solved-${vp.name}.png`);
      await page.screenshot({ path: out });
      made++;
      console.log(`  ${tag}  ${vp.name}`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n${made} shots -> ${path.relative(ROOT, outDir)}`);
  process.exit(0);
}
const names = Object.keys(SCENES).filter((n) => !only.length || only.includes(n));
let n = 0;

for (const vp of VIEWPORTS) {
  for (const name of names) {
    const scene = SCENES[name];
    const page = await openPage(browser, { file, width: vp.width, height: vp.height });
    await page.addScriptTag({ content: preamble });
    await page.evaluate(scene.build);
    await page.evaluate((f) => window.__GW.step(f, 1 / 60), scene.frames);
    // let CSS transitions on the chrome layer settle before we capture
    await page.waitForTimeout(600);
    await page.evaluate((f) => window.__GW.step(f, 1 / 60), 2);
    if (scene.after) { await scene.after(page); await page.waitForTimeout(320); }
    const out = path.join(outDir, `${name}-${vp.name}.png`);
    await page.screenshot({ path: out });
    await page.close();
    n++;
    console.log(`  ${path.relative(ROOT, out)}  (${scene.label})`);
  }
}

await browser.close();
console.log(`\n${n} shots -> ${path.relative(ROOT, outDir)}`);
