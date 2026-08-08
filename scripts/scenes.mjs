// Scene composition, shared by the screenshot harness and the regression suite.
// Every builder runs INSIDE the page and only uses public-ish Game APIs — it must
// never reach into the physics, only place parts the way a player would.

/** Helpers injected into the page by name (see `preamble`). */
export const preamble = `
  window.__S = {
    g() { return window.__GW.game; },
    // exact tangent placement, then let the game's own snapper seat it
    put(type, pos, opts) {
      const g = this.g();
      const t = g._add_gear(type, pos, !!(opts && opts.driver));
      t.pos = pos.slice();
      g._snap_gear(t, pos.slice());
      t.z = Math.max(0, ...g.tile_list.map(x => x.z)) + 1;
      if (opts && opts.driver) { t.is_driver = true; g.selected_driver = t; }
      g._mark_dirty();
      return t;
    },
    // centre-to-centre tangent distance for two pitch radii
    tangent(a, b) { return a + b; },
    rp(type) {
      const g = this.g();
      if (type === "U1") return g.Rp_small;
      const m = { U2: 1.0, U3: 1.5, U4: 2.0, U5: 2.5, SP: 1.5 }[type] || 1;
      const R = g.R2 * m, a = R * Math.sqrt(3) / 2;
      return 0.5 * (R + a);
    },
  };
`;

/** name -> { label, build (page fn), frames } */
export const SCENES = {
  menu: {
    label: "Main menu",
    frames: 4,
    build: () => {
      const g = window.__GW.game;
      g.enter_main_menu();
    },
  },

  free: {
    label: "Free play — driver, 3-gear train, compound stack, readout cluster",
    frames: 42,
    build: () => {
      const S = window.__S, g = S.g();
      g.start_free_play();
      const s = g.step, cx = g.origin[0], cy = g.origin[1];
      const drv = g.tile_list.find((t) => t.is_driver);
      // the U2 the starter motor drives — everything else hangs off this
      const idler = g.tile_list.find((t) => t.label === "U2" && !t.is_driver);
      // the starter board also drops a lone U3 out of reach; re-purpose it as the
      // hub of the readout cluster rather than leaving a dead part in frame
      const hub = g.tile_list.find((t) => t.label === "U3");

      // --- compound reduction: big + small on one shaft, driving an output gear ---
      const u5 = S.put("U5", [idler.pos[0] + S.tangent(idler.pitch_r(), S.rp("U5")), idler.pos[1]]);
      const topGear = S.put("U2", [u5.pos[0], u5.pos[1]]);
      g._stack_on(topGear, u5);
      S.put("U3", [topGear.pos[0] + S.tangent(topGear.pitch_r(), S.rp("U3")), topGear.pos[1]]);

      // --- readout-dense cluster: its own motor, six planets around a hub ---
      hub.pos = [cx - s * 1.0, cy - s * 5.6];
      hub.is_driver = true;
      const d = S.tangent(hub.pitch_r(), S.rp("U2"));
      for (const deg of [90, 150, 210, 270, 330, 30]) {
        const a = (deg * Math.PI) / 180;
        S.put("U2", [hub.pos[0] + d * Math.cos(a), hub.pos[1] + d * Math.sin(a)]);
      }

      // keep the starter motor selected so the selection ring is visible
      if (drv) g.selected_driver = drv;
      g._mark_dirty();
      g._ensure_rebuilt();
    },
  },

  puzzle: {
    label: "Puzzle level 2 — mid-solve",
    frames: 42,
    build: () => {
      const g = window.__GW.game;
      g.start_level(1); // "Straight Run": drive at -4, target at +4, three U2 to place
      const loose = g.tile_list.filter((t) => !t.anchored);
      const drive = g.tile_list.find((t) => t.role === "drive");
      // seat two of the three, leave the last one in the staging area
      [-2, 0].forEach((u, i) => {
        const t = loose[i];
        const p = [g.origin[0] + g.Rp2 * u, drive.pos[1]];
        t.pos = p.slice();
        g._snap_gear(t, p.slice());
      });
      g._mark_dirty();
      g._ensure_rebuilt();
    },
  },

  planetary: {
    label: "Ring / planetary set",
    frames: 42,
    build: () => {
      const S = window.__S, g = S.g();
      g.start_free_play();
      g._clear_board();
      const cx = g.origin[0], cy = g.origin[1];

      const ring = g._add_ring([cx, cy]);
      ring.z = -1;
      // sun rp = inner - 2*planet  ->  U4 sun with U2 planets closes the set
      const sun = S.put("U4", [cx, cy], { driver: true });
      sun.z = 1;
      const orbit = ring.inner_r() - S.rp("U2");
      for (const deg of [90, 210, 330]) {
        const a = (deg * Math.PI) / 180;
        S.put("U2", [cx + orbit * Math.cos(a), cy + orbit * Math.sin(a)]).z = 2;
      }
      // one external gear riding the ring's outer teeth
      S.put("U3", [cx + ring.pitch_r() + S.rp("U3"), cy]);
      g.selected_driver = sun;
      g._mark_dirty();
      g._ensure_rebuilt();
    },
  },
};

SCENES.win = {
  label: "Level complete overlay",
  frames: 60,
  build: () => {
    const g = window.__GW.game;
    g.start_level(0); // "First Link" — one gear bridges the gap
    const loose = g.tile_list.filter((t) => !t.anchored)[0];
    const p = [g.origin[0], g.origin[1]];
    loose.pos = p.slice();
    g._snap_gear(loose, p.slice());
    g._mark_dirty();
    g._ensure_rebuilt();
  },
};

SCENES.states = {
  label: "Control states — hover, pressed, focus, latched",
  frames: 20,
  build: () => {
    const g = window.__GW.game;
    g.start_free_play();
    g.paused = true;              // latched Pause + PAUSED status lamp
    g._sync_pause_label();
    g._handle_menu("damp");       // latched Damping (non-default preset)
  },
  after: async (page) => {
    await page.hover('#rail .tile:nth-child(5)');
    await page.evaluate(() => {
      const b = document.querySelectorAll("#rail .btn");
      b[b.length - 1].focus();     // focus-visible ring on Main Menu
    });
    await page.evaluate(() => {
      document.querySelector("#rail .tile:nth-child(2)")
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
  },
};

export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];
