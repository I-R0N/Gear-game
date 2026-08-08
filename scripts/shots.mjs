// Screenshot harness.
//   node scripts/shots.mjs                       -> shots/after/*.png from gear_works.html
//   node scripts/shots.mjs --out shots/before --file /tmp/original.html
//   node scripts/shots.mjs --only free,planetary
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { launch, openPage, ROOT } from "./browser.mjs";
import { SCENES, VIEWPORTS, preamble } from "./scenes.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = path.resolve(ROOT, arg("out", "shots/after"));
const file = arg("file", "gear_works.html");
const only = arg("only", "").split(",").filter(Boolean);
const clean = process.argv.includes("--clean");

if (clean) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await launch();
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
    await page.waitForTimeout(500);
    await page.evaluate((f) => window.__GW.step(f, 1 / 60), 2);
    const out = path.join(outDir, `${name}-${vp.name}.png`);
    await page.screenshot({ path: out });
    await page.close();
    n++;
    console.log(`  ${path.relative(ROOT, out)}  (${scene.label})`);
  }
}

await browser.close();
console.log(`\n${n} shots -> ${path.relative(ROOT, outDir)}`);
