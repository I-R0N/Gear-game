// Objective checks for the rubric dimensions that can actually be measured:
// frame cost, WCAG text contrast, and touch-target size.  `npm run audit`
import { launch, openPage } from "./browser.mjs";
import { SCENES, preamble } from "./scenes.mjs";

const FRAME_BUDGET = 16.7;
let fails = 0;

const browser = await launch();

// ---------------------------------------------------------------- performance
console.log("frame cost — densest scene, dpr 2");
for (const [w, h] of [[1280, 800], [390, 844]]) {
  const page = await openPage(browser, { file: "gear_works.html", width: w, height: h, dpr: 2 });
  await page.addScriptTag({ content: preamble });
  await page.evaluate(SCENES.free.build);
  const r = await page.evaluate(() => {
    const g = window.__GW.game;
    for (let i = 0; i < 60; i++) { g.update(1 / 60); window.__GW.render(); }   // warm up
    const t = [];
    for (let i = 0; i < 300; i++) {
      const a = performance.now(); g.update(1 / 60); window.__GW.render();
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    return { median: +t[150].toFixed(2), p95: +t[285].toFixed(2), p99: +t[297].toFixed(2), parts: g.tile_list.length };
  });
  const ok = r.p95 < FRAME_BUDGET;
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${w}x${h}  ${r.parts} parts  median ${r.median}ms  p95 ${r.p95}ms  (budget ${FRAME_BUDGET}ms)`);
  // p99 is reported but not gated: this headless container periodically stalls the
  // renderer for seconds regardless of what the page draws (it reproduces with the
  // draw calls stubbed out), so it measures the sandbox, not the game.
  console.log(`      p99 ${r.p99}ms — environment noise, see comment`);
  await page.close();
}

// ------------------------------------------------------- contrast + targets
for (const [w, h, name] of [[1280, 800, "desktop"], [390, 844, "mobile"]]) {
  for (const scene of ["menu", "free", "puzzle", "win"]) {
    const page = await openPage(browser, { file: "gear_works.html", width: w, height: h, dpr: 2 });
    await page.addScriptTag({ content: preamble });
    await page.evaluate(SCENES[scene].build);
    await page.evaluate((f) => window.__GW.step(f, 1 / 60), SCENES[scene].frames);
    await page.waitForTimeout(450);
    const a = await page.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      const ratio = (x, y) => { const A = lum(x), B = lum(y); const [hi, lo] = A > B ? [A, B] : [B, A]; return (hi + 0.05) / (lo + 0.05); };
      // Walk up for an opaque backdrop. Gradients report a transparent
      // backgroundColor, so fall back to the mean of the gradient's stops —
      // otherwise dark-ink-on-amber reads as a false failure.
      const bgOf = (el) => {
        let n = el;
        while (n) {
          const cs = getComputedStyle(n);
          const c = cs.backgroundColor, m = c.match(/[\d.]+/g);
          if (m && (m.length < 4 || Number(m[3]) > 0.6)) return parse(c);
          const gi = cs.backgroundImage;
          if (gi && gi.includes("gradient")) {
            const cols = gi.match(/rgba?\([^)]+\)/g) || [];
            const solid = cols.map(parse).filter((_, i) => {
              const a = (cols[i].match(/[\d.]+/g) || [])[3];
              return a === undefined || Number(a) > 0.6;
            });
            if (solid.length) {
              return [0, 1, 2].map((k) => solid.reduce((s2, v) => s2 + v[k], 0) / solid.length);
            }
          }
          n = n.parentElement;
        }
        return [6, 8, 11];
      };
      const text = [];
      for (const el of document.querySelectorAll("#ui *")) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || !el.offsetParent) continue;
        const r = ratio(parse(cs.color), bgOf(el));
        const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 600;
        const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
        text.push({ t: el.textContent.trim().slice(0, 24), px, ratio: +r.toFixed(2), need, pass: r >= need });
      }
      const touch = [...document.querySelectorAll("#ui button")].filter((b) => b.offsetParent).map((b) => {
        const r = b.getBoundingClientRect();
        return { t: (b.textContent || b.ariaLabel || "").trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) };
      });
      return { text, touch };
    });
    const bad = a.text.filter((x) => !x.pass);
    const small = name === "mobile" ? a.touch.filter((t) => t.h < 44 || t.w < 44) : [];
    if (bad.length || small.length) fails++;
    console.log(`${bad.length || small.length ? "✗" : "✓"} ${name}/${scene}: contrast ${a.text.length - bad.length}/${a.text.length}` +
      (name === "mobile" ? `, touch ${a.touch.length - small.length}/${a.touch.length} >= 44px` : ""));
    bad.forEach((f) => console.log(`    contrast "${f.t}" ${f.px}px ${f.ratio}:1 (need ${f.need})`));
    small.forEach((t) => console.log(`    target "${t.t}" ${t.w}x${t.h}`));
    await page.close();
  }
}

await browser.close();
console.log(fails ? `\n${fails} audit group(s) failed` : "\nall audits pass");
if (fails) process.exit(1);
