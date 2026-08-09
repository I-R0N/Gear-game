// Shared level-harness helpers: everything that needs to seat a level's solution
// spec inside the page, or reason about where its parts ended up.
//
// The suite, the curve report and the screenshot harness all drive levels through
// these, so "solved" means the same thing in all three.

/** Injected into the page. Adds window.__L. */
export const levelKit = `
window.__L = {
  g() { return window.__GW.game; },
  U() { return this.g().Rp2; },
  levels() { return window.__GW.LEVELS; },

  // world position <-> level units (Rp2 from the arena centre)
  toLevel(p) { const g = this.g(); return [(p[0]-g.origin[0])/g.Rp2, (p[1]-g.origin[1])/g.Rp2]; },
  toWorld(p) { const g = this.g(); return [g.origin[0]+g.Rp2*p[0], g.origin[1]+g.Rp2*p[1]]; },

  // Every loose part, in inventory order (the deterministic staging row).
  loose() { return this.g().tile_list.filter(t => !t.anchored); },

  // Seat a level's own solution spec, exactly the way a player would: position the
  // part, let the game's snapper seat it, and use the game's own stacking call for
  // shaft partners. Never touches physics.
  //   skip: index into the solution to leave in the staging row (minimality test)
  solve(idx, opts) {
    const o = opts || {}, g = this.g();
    g.start_level(idx);
    const lv = this.levels()[idx];
    const sol = lv.solution || [];
    const loose = this.loose();
    const placed = [];
    for (let i = 0; i < sol.length; i++) {
      const s = sol[i], t = loose[i];
      placed.push(t);
      if (o.skip === i) continue;
      const w = this.toWorld(s.pos);
      if (s.stack !== undefined) {
        const base = typeof s.stack === "number" ? placed[s.stack]
                                                 : g.tile_list.find(x => x.lvid === s.stack);
        if (!base) throw new Error("level " + idx + ": no stack base " + s.stack);
        if (o.skip === s.stack) continue;      // base was skipped; nothing to ride on
        t.pos = base.pos.slice();
        g._stack_on(t, base);
      } else {
        t.pos = w.slice();
        g._snap_gear(t, w.slice());
      }
    }
    g._mark_dirty();
    // A wind target genuinely takes time to fill — that is the mechanic, not a
    // slow test — so spring levels get a longer run.
    const spring = lv.driven.some(v => v.wind_turns !== undefined);
    for (let f = 0; f < (o.frames || (spring ? 1200 : 300)); f++) g.update(1/60);
    return this.report(idx);
  },

  // A spring that reaches its hard stop while the motor is still driving it holds
  // the whole train at zero for good. Any level whose barrel can reach the stop is
  // one dawdling player away from a soft-lock, so the suite proves it cannot.
  windCeiling(idx) {
    const g = this.g();
    this.solve(idx, { frames: 1 });
    const springs = g.tile_list.filter(t => t.is_spring());
    if (!springs.length) return null;
    let peak = 0;
    for (let f = 0; f < 60 * 90; f++) {
      g.update(1/60);
      for (const s of springs) peak = Math.max(peak, Math.abs(s.wind));
    }
    return { peakTurns: +(peak / (2*Math.PI)).toFixed(3),
             maxTurns: +(window.__GW.SPRING_MAX_WIND / (2*Math.PI)).toFixed(3) };
  },

  // Degenerate placement 1: chain the whole inventory off the first drive, straight
  // at the first target. This IS the intended answer on the earliest levels; on
  // every other level it must fail.
  naive(idx) {
    const g = this.g();
    g.start_level(idx);
    const loose = this.loose();
    const from0 = g.tile_list.find(t => t.role === "drive");
    const to = g.tile_list.find(t => t.role === "driven");
    let head = from0;
    for (const t of loose) {
      let dx = to.pos[0]-head.pos[0], dy = to.pos[1]-head.pos[1];
      const d = Math.hypot(dx, dy) || 1, R = head.pitch_r() + t.pitch_r();
      const p = [head.pos[0] + dx/d*R, head.pos[1] + dy/d*R];
      t.pos = p.slice();
      g._snap_gear(t, p.slice());
      head = t;
    }
    g._mark_dirty();
    for (let f = 0; f < 300; f++) g.update(1/60);
    return this.report(idx);
  },

  // Degenerate placement 2: dump the whole inventory around the motor in a rosette
  // -- the "hang everything off the drive and hope" move. Starts pointing away from
  // the board so it is a genuine dump rather than an accidental solution, and must
  // never win, on any level.
  heap(idx) {
    const g = this.g();
    g.start_level(idx);
    const drive = g.tile_list.find(t => t.role === "drive");
    this.loose().forEach((t, i) => {
      const a = Math.PI/2 + i * 2.399963;        // golden angle, first one straight up
      const R = drive.pitch_r() + t.pitch_r();
      const p = [drive.pos[0] + R*Math.cos(a), drive.pos[1] + R*Math.sin(a)];
      t.pos = p.slice();
      g._snap_gear(t, p.slice());
    });
    g._mark_dirty();
    const spring = this.levels()[idx].driven.some(v => v.wind_turns !== undefined);
    for (let f = 0; f < (spring ? 1200 : 300); f++) g.update(1/60);
    return this.report(idx);
  },


  // Direction is a thing several levels ask the player to READ, and a gear whose
  // teeth advance more than half a tooth pitch per frame is a gear whose direction
  // cannot be read — it strobes, exactly like a wagon wheel in a film. Returns the
  // worst offender's alias ratio: 1.0 is the ambiguity threshold, and anything
  // under ~0.5 is comfortable.
  //   alias = (deg advanced per 60fps frame) / (half a tooth pitch)
  //         = |rpm| * teeth / 1800
  strobe(idx) {
    const g = this.g();
    this.solve(idx, { frames: 1 });
    const alias = (t) => Math.abs(t.omega * 60 / (2*Math.PI)) * t.teeth / 1800;
    let peak = 0, worstT = null;
    for (let f = 0; f < 60 * 12; f++) {
      g.update(1/60);
      for (const t of g.tile_list) {
        if (t.is_rack()) continue;
        const a = alias(t);
        if (a > peak) { peak = a; worstT = t.label; }
      }
    }
    let steady = 0, steadyT = null;
    for (const t of g.tile_list) {
      if (t.is_rack()) continue;
      const a = alias(t);
      if (a > steady) { steady = a; steadyT = t.label; }
    }
    return { peak: +peak.toFixed(3), peakPart: worstT,
             steady: +steady.toFixed(3), steadyPart: steadyT };
  },

  // Do the floating readouts sit still on a board nobody is touching? They used to
  // wander, because the pill's width tracked its own text and a settling train
  // rewrites those digits every frame.
  pillDrift(idx) {
    const g = this.g();
    this.solve(idx);
    window.__GW.render();
    const snap = () => window.__GW.readouts.map(it => [it.t.uid, it.cx, it.cy]);
    const first = snap();
    let worst = 0;
    for (let f = 0; f < 240; f++) {
      g.update(1/60); window.__GW.render();
      const now = snap();
      if (now.length !== first.length) return { drift: 999, note: "pill count changed" };
      for (let i = 0; i < now.length; i++) {
        if (now[i][0] !== first[i][0]) return { drift: 999, note: "pill order changed" };
        worst = Math.max(worst, Math.hypot(now[i][1] - first[i][1], now[i][2] - first[i][2]));
      }
    }
    return { drift: +worst.toFixed(3), pills: first.length };
  },

  // Which mesh edges exist, as a sorted list of stable part keys.
  edgeKeys() {
    const g = this.g();
    const key = (t) => {
      if (t.role) return (t.lvid || t.role) + ":" + t.label;
      // +0 normalises -0, which would otherwise print as "-0.00" and never
      // match the spec's "0.00"
      const p = this.toLevel(t.pos).map(v => +v.toFixed(2) + 0);
      return t.label + "@" + p[0].toFixed(2) + "," + p[1].toFixed(2);
    };
    return g.mesh_edges.map(([a,b]) => [key(a), key(b)].sort().join(" ~ ")).sort();
  },

  report(idx) {
    const g = this.g(), lv = this.levels()[idx];
    const driven = g.tile_list.filter(t => t.role === "driven");
    const loose = this.loose();
    const rpm = (t) => t.omega * 60 / (2*Math.PI);
    return {
      idx, name: lv.name,
      win: g.win,
      stars: g._stars || 0, partsUsed: g.parts_used(), par: g.par(),
      locked: g.tile_list.filter(t => t.locked).length,
      edges: g.mesh_edges.length,
      edgeKeys: this.edgeKeys(),
      nan: g.tile_list.some(t => !Number.isFinite(t.omega) || !Number.isFinite(t.angle)
                                 || !Number.isFinite(t.pos[0]) || !Number.isFinite(t.pos[1])),
      targets: driven.map(t => ({
        goal: g.target_goal_text(t), ok: g.target_ok(t),
        rpm: +rpm(t).toFixed(4), turns: +((t.wind||0)/(2*Math.PI)).toFixed(3),
        ratio: (t.spec && t.spec.ratio && g._anchor(t.spec.ratio.of))
                 ? +(t.omega / g._anchor(t.spec.ratio.of).omega).toFixed(6) : null,
      })),
      parts: g.tile_list.map(t => {
        const p = this.toLevel(t.pos);
        return { label: t.label, x: +p[0].toFixed(3), y: +p[1].toFixed(3),
                 r: +(t.pitch_r()/g.Rp2).toFixed(3),
                 tip: +((t.tooth_outer_r || t.pitch_r())/g.Rp2).toFixed(3),
                 anchored: !!t.anchored, role: t.role || null,
                 stacked: !!t.partner, loose: loose.indexOf(t) >= 0 };
      }),
      // clearance = centre distance minus the sum of pitch radii, for every pair
      // that is NOT meshed and NOT a shaft pair. Anything near zero is an
      // accidental tangency waiting to close a ratio cycle.
      tightest: (() => {
        const ts = g.tile_list, U = g.Rp2;
        const meshed = new Set(g.mesh_edges.map(([a,b]) => a.uid+"_"+b.uid).concat(
                               g.mesh_edges.map(([a,b]) => b.uid+"_"+a.uid)));
        let worst = 99, pair = "";
        for (let i = 0; i < ts.length; i++) for (let j = i+1; j < ts.length; j++) {
          const a = ts[i], b = ts[j];
          if (a.partner === b || meshed.has(a.uid+"_"+b.uid)) continue;
          const d = Math.hypot(a.pos[0]-b.pos[0], a.pos[1]-b.pos[1])/U;
          const s = (a.pitch_r()+b.pitch_r())/U;
          const c = Math.abs(d - s);
          if (c < worst) { worst = c; pair = a.label+"/"+b.label; }
        }
        return { clearance: +worst.toFixed(3), pair };
      })(),
    };
  },

  // The live safe box for THIS viewport, in level units: the is_pos_safe box minus
  // whatever the chrome is covering. Intersecting the two viewports' answers is
  // what stops a level that only fits on desktop from shipping.
  safeBox() {
    const g = this.g(), U = g.Rp2;
    const lx = (x) => (x - g.origin[0])/U, ly = (y) => (y - g.origin[1])/U;
    let box = { x0: lx(g.safe_margin), x1: lx(g.W - g.safe_margin),
                y0: ly(g.safe_margin), y1: ly(g.H - g.safe_margin) };
    for (const id of ["topbar", "rail", "hintbar"]) {
      const el = document.getElementById(id);
      if (!el || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const bx0 = lx(r.left), bx1 = lx(r.right);
      const by0 = ly(g.H - r.bottom), by1 = ly(g.H - r.top);
      // Only trim from a side the bar actually hugs, so a full-width top bar takes
      // height off the top and nothing off the sides.
      const w = bx1-bx0, h = by1-by0;
      if (w >= h) { if (by1 >= box.y1 - 0.01) box.y1 = Math.min(box.y1, by0);
                    else if (by0 <= box.y0 + 0.01) box.y0 = Math.max(box.y0, by1); }
      else { if (bx0 <= box.x0 + 0.01) box.x0 = Math.max(box.x0, bx1);
             else if (bx1 >= box.x1 - 0.01) box.x1 = Math.min(box.x1, bx0); }
    }
    return box;
  },
};
`;

/** Intersect a list of per-viewport boxes. */
export function intersectBoxes(list) {
  return list.reduce((a, b) => ({
    x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1),
    y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1),
  }));
}
