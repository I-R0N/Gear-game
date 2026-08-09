// Shared browser bootstrap for the screenshot harness and the regression suite.
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// This container ships a pre-installed Chromium whose build number may not match
// the npm playwright package; prefer whatever is actually on disk.
function resolveChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "";
  if (base && existsSync(base)) {
    const dirs = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const d of dirs) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
        const p = path.join(base, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined; // fall back to playwright's own download
}

export async function launch() {
  const executablePath = resolveChromium();
  return chromium.launch({ executablePath, args: ["--force-device-scale-factor=1"] });
}

// A page with a seeded Math.random (level inventory scatter uses it) so both
// screenshots and behavioural baselines are reproducible.
export async function openPage(browser, { file, width, height, dpr = 2, seed = 1337 }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  });
  await page.addInitScript(`(() => {
    let s = ${seed} >>> 0;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();`);
  await page.goto(pathToFileURL(path.resolve(ROOT, file)).href);
  await page.waitForFunction("window.__GW && window.__GW.game");
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.evaluate(() => { window.__GW.auto = false; });
  return page;
}
