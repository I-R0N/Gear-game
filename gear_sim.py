"""
Gear Mesh Sandbox  -  a Pythonista (scene module) toy.

Drop hexagonal and triangular "gear" tiles onto a triangular lattice and
watch a torque-driven gear train spin up. Gears that touch mesh together and
turn in opposite directions; the train picks up viscous load as it grows.

Controls
--------
  * Drag a gear        : move it (it snaps to the nearest free lattice slot)
  * Tap a gear         : make it the sole driver (orange dot)
  * Drop a gear on menu : delete it
  * Add U1/U2/U3        : spawn a new gear
  * Pause / Run         : freeze / resume motion
  * Reset               : clear and respawn the starting layout
"""

import scene
import math
from collections import deque

# ============================================================
# USER TUNABLES
# ============================================================

GRID_SCALE = 1.00
PAD_RADIUS_MULT = 0.55

# --- Dynamics (velocity-servo drivers) ---
# Each driver gear is a "motor" that pushes its gear toward a target speed.
# Drive torque = DRIVE_SERVO_GAIN * (target_speed - current_speed). Higher gain
# tracks the set speed more tightly; lower gain lets heavy trains sag under load.
DRIVE_SERVO_GAIN = 14.0
DEFAULT_DRIVE_RPM = 120.0     # speed a gear gets when first made a driver
SPEED_STEP_RPM = 15.0         # how much the Speed -/+ buttons change the target
OMEGA_DAMP = 0.4              # baseline viscous damping (stability)
MAX_ABS_OMEGA = 30.0          # rad/s clamp (~286 rpm)
# Inertia is dimensionless: I = INERTIA_K * (pitch_r / Rp2)^2, so a reference
# U2 gear has I = INERTIA_K. This keeps spin-up time independent of screen size.
# (Larger -> heavier, slower to spin up; smaller -> snappier.)
INERTIA_K = 2.5

# Per-gear rotational friction (load), modeled as viscous torque tau = B * omega.
# More gears -> more reflected load on the driver -> lower top speed.
FRICTION_B_PER_GEAR = 0.020   # base B per gear (torque per rad/s)
FRICTION_B_SCALE_R = 1.0      # multiply B by (pitch_r / Rp2) ** this

TOOTH_OUTER_EXTRA_MULT = 0.10

# --- Interaction ---
TAP_MOVE_TOL_MULT = 0.25      # drag shorter than this * step counts as a "tap"

# --- Overlays ---
SHOW_GRID_POINTS = True
SHOW_MESH_LINES = True
SHOW_PITCH_CIRCLES = True

GRID_POINT_SPACING = 1
GRID_POINT_ALPHA = 0.16
GRID_POINT_R_MULT = 0.06
GRID_POINTS_RING = 28

TRI_SNAP_SEARCH_R = 6
UNIT3_RADIUS_MULT = 1.5

HEX_OVERLAP_MIN_CENTER_MULT = 0.55

# Vertex-based meshing parameters
VERTEX_MESH_TOL_MULT = 0.22
VERTEX_QUANT_PX = 2.0

# Pitch engagement band
MESH_ENGAGE_PAD_MULT = 0.32

# Tooth sizing model (consistent circular pitch)
CIRC_PITCH_PX_MULT = 0.28
MIN_TEETH = 8
MAX_TEETH = 120
FORCE_EVEN_TEETH = True
TEETH_ROUNDING = 1

# UI
MENU_W = 112
MENU_PAD = 10
BTN_H = 40
BTN_GAP = 8

# Text
FONT_NAME = 'Helvetica'
RPM_FONT_SIZE = 12

# ============================================================
# Game / puzzle content
# ============================================================

GAME_TITLE = "GEAR WORKS"
WIN_SPIN_EPS = 1e-2           # |omega| above this counts a driven gear as "turning"

# Each level: fixed drive gears (cell, target_rpm) and driven/goal gears (cell),
# plus a budget of gears the player may place. Win = every driven gear turning.
# All anchored gears are U2 hexes; the player places U2 hexes to connect them.
# (Coordinates and budgets below were validated to be solvable without jams.)
LEVELS = [
    {
        "name": "First Link",
        "hint": "Place 1 gear to connect the drive to the target.",
        "budget": 1,
        "drives": [((-2, 0), 120.0)],
        "driven": [(2, 0)],
    },
    {
        "name": "Straight Run",
        "hint": "Bridge the gap with a chain of 3 gears.",
        "budget": 3,
        "drives": [((-4, 0), 120.0)],
        "driven": [(4, 0)],
    },
    {
        "name": "Double Duty",
        "hint": "Two drives, two targets, 4 gears. Spend them wisely.",
        "budget": 4,
        "drives": [((-3, 3), 120.0), ((-3, -3), 150.0)],
        "driven": [(3, 3), (3, -3)],
    },
]

# ============================================================
# Triangular lattice
# ============================================================

SQRT3 = math.sqrt(3.0)
C30 = SQRT3 * 0.5
S30 = 0.5

DIRS = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)]


def tri_to_screen(i, j, step, origin):
    x = step * (C30 * i) + origin[0]
    y = step * (S30 * i + 1.0 * j) + origin[1]
    return (x, y)


def screen_to_tri(x, y, step, origin):
    px = x - origin[0]
    py = y - origin[1]
    i = px / (step * C30)
    j = (py / step) - (S30 * i)
    return (i, j)


def tri_round(i, j):
    """Round fractional cube/axial coords to the nearest lattice cell."""
    x = i
    z = j
    y = -x - z
    rx, ry, rz = round(x), round(y), round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return (int(rx), int(rz))


def tri_ring(center, radius):
    if radius == 0:
        return [center]
    ci, cj = center
    cur = (ci - radius, cj + radius)
    out = []
    for k in range(6):
        di, dj = DIRS[k]
        for _ in range(radius):
            out.append(cur)
            cur = (cur[0] + di, cur[1] + dj)
    return out


def dist2(a, b):
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def dist(a, b):
    return math.sqrt(dist2(a, b))


def clampf(x, lo, hi):
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x

# ============================================================
# Drawing helpers
# ============================================================


def hex_vertices(cx, cy, r):
    verts = []
    for k in range(6):
        ang = math.radians(60 * k + 30)
        verts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return verts


def draw_filled_hex(cx, cy, r, fill_rgb, outline_alpha=0.55, outline_w=2):
    verts = hex_vertices(cx, cy, r)
    strip = []
    for v in verts:
        strip.append(v)
        strip.append((cx, cy))
    strip.append(verts[0])
    strip.append((cx, cy))

    scene.fill(fill_rgb[0], fill_rgb[1], fill_rgb[2], 1.0)
    scene.triangle_strip(strip)

    scene.stroke(0.0, 0.0, 0.0, outline_alpha)
    scene.stroke_weight(outline_w)
    for i in range(6):
        x1, y1 = verts[i]
        x2, y2 = verts[(i + 1) % 6]
        scene.line(x1, y1, x2, y2)


def triangle_vertices_from_cell(i, j, up):
    if up:
        return [(i, j), (i + 1, j), (i, j + 1)]
    else:
        return [(i + 1, j + 1), (i + 1, j), (i, j + 1)]


def triangle_centroid_screen(i, j, up, step, origin):
    pts = triangle_vertices_from_cell(i, j, up)
    sx = sy = 0.0
    for pi, pj in pts:
        x, y = tri_to_screen(pi, pj, step, origin)
        sx += x
        sy += y
    return (sx / 3.0, sy / 3.0)


def draw_filled_triangle(tri_pts_xy, fill_rgb, outline_alpha=0.55, outline_w=2):
    cx = (tri_pts_xy[0][0] + tri_pts_xy[1][0] + tri_pts_xy[2][0]) / 3.0
    cy = (tri_pts_xy[0][1] + tri_pts_xy[1][1] + tri_pts_xy[2][1]) / 3.0
    strip = []
    for v in tri_pts_xy:
        strip.append(v)
        strip.append((cx, cy))
    strip.append(tri_pts_xy[0])
    strip.append((cx, cy))

    scene.fill(fill_rgb[0], fill_rgb[1], fill_rgb[2], 1.0)
    scene.triangle_strip(strip)

    scene.stroke(0.0, 0.0, 0.0, outline_alpha)
    scene.stroke_weight(outline_w)
    scene.line(tri_pts_xy[0][0], tri_pts_xy[0][1], tri_pts_xy[1][0], tri_pts_xy[1][1])
    scene.line(tri_pts_xy[1][0], tri_pts_xy[1][1], tri_pts_xy[2][0], tri_pts_xy[2][1])
    scene.line(tri_pts_xy[2][0], tri_pts_xy[2][1], tri_pts_xy[0][0], tri_pts_xy[0][1])


def draw_circle_poly(cx, cy, r, segs, rgba, w):
    scene.stroke(rgba[0], rgba[1], rgba[2], rgba[3])
    scene.stroke_weight(w)
    prev = None
    for k in range(segs + 1):
        a = (k / float(segs)) * math.tau
        x = cx + r * math.cos(a)
        y = cy + r * math.sin(a)
        if prev is not None:
            scene.line(prev[0], prev[1], x, y)
        prev = (x, y)


def draw_gear(cx, cy, pitch_r, angle, teeth, ring_w=3,
              tooth_inner_r=0.0, tooth_outer_r=0.0):
    draw_circle_poly(cx, cy, pitch_r, segs=40, rgba=(1.0, 1.0, 1.0, 0.55), w=ring_w)

    scene.stroke(1.0, 1.0, 1.0, 0.85)
    scene.stroke_weight(2)
    for t in range(teeth):
        a = angle + (t / float(teeth)) * math.tau
        x1 = cx + tooth_inner_r * math.cos(a)
        y1 = cy + tooth_inner_r * math.sin(a)
        x2 = cx + tooth_outer_r * math.cos(a)
        y2 = cy + tooth_outer_r * math.sin(a)
        scene.line(x1, y1, x2, y2)

    draw_circle_poly(cx, cy, pitch_r * 0.18, segs=20, rgba=(1.0, 1.0, 1.0, 0.7), w=2)
    spoke_r = pitch_r * 0.78
    sx = cx + spoke_r * math.cos(angle)
    sy = cy + spoke_r * math.sin(angle)
    scene.stroke(1.0, 1.0, 1.0, 0.9)
    scene.stroke_weight(3)
    scene.line(cx, cy, sx, sy)


def draw_lock_x(cx, cy, r):
    scene.stroke(1.0, 0.2, 0.2, 0.95)
    scene.stroke_weight(5)
    d = r * 0.55
    scene.line(cx - d, cy - d, cx + d, cy + d)
    scene.line(cx - d, cy + d, cx + d, cy - d)


def omega_to_rpm(omega):
    return omega * 60.0 / math.tau


def rpm_to_omega(rpm):
    return rpm * math.tau / 60.0

# ============================================================
# Tooth count computation
# ============================================================


def snap_multiple(n, m):
    if m <= 1:
        return n
    return int(round(n / float(m))) * m


def compute_teeth_from_pitch_radius(pitch_r, circular_pitch_px):
    if circular_pitch_px <= 1e-6:
        circular_pitch_px = 1.0
    z = int(round((math.tau * pitch_r) / circular_pitch_px))
    z = int(clampf(z, MIN_TEETH, MAX_TEETH))
    z = snap_multiple(z, TEETH_ROUNDING)
    if FORCE_EVEN_TEETH and (z % 2) == 1:
        z = int(clampf(z + 1, MIN_TEETH, MAX_TEETH))
    return z

# ============================================================
# Tiles
# ============================================================


class TileBase:
    __slots__ = ("pos", "z", "is_driver", "angle", "omega",
                 "locked", "drag_offset", "teeth", "drive_speed",
                 "anchored", "role")

    def __init__(self, pos, is_driver=False):
        self.pos = pos
        self.z = 0
        self.is_driver = is_driver
        self.angle = 0.0
        self.omega = 0.0
        self.locked = False
        self.drag_offset = (0.0, 0.0)
        self.teeth = 14
        self.drive_speed = rpm_to_omega(DEFAULT_DRIVE_RPM)  # target when a driver
        self.anchored = False   # puzzle: fixed, can't be moved/deleted
        self.role = None        # None | "drive" | "driven"

    def pitch_r(self):
        raise NotImplementedError

    def vertex_points_world(self):
        raise NotImplementedError

    def hit_radius(self):
        raise NotImplementedError

    def contains(self, p):
        return dist2(self.pos, p) <= (self.hit_radius() ** 2)

    def inertia(self, rp_ref):
        """Dimensionless inertia relative to a reference gear (so spin-up time
        does not depend on screen pixels)."""
        pr = self.pitch_r()
        if rp_ref <= 1e-9:
            s = 1.0
        else:
            s = pr / rp_ref
        return float(INERTIA_K) * s * s

    def friction_b(self, rp_ref):
        """Viscous friction coefficient, scaled by gear size."""
        pr = self.pitch_r()
        if rp_ref <= 1e-9:
            s = 1.0
        else:
            s = (pr / rp_ref) ** float(FRICTION_B_SCALE_R)
        return float(FRICTION_B_PER_GEAR) * s

    def draw_rpm_text(self, y_offset):
        rpm = omega_to_rpm(self.omega)
        s = "%6.1f rpm" % rpm
        scene.fill(1.0, 1.0, 1.0, 0.88)
        scene.text(s, x=self.pos[0] - 34, y=self.pos[1] + y_offset,
                   font_size=RPM_FONT_SIZE, font_name=FONT_NAME)


class HexGearTile(TileBase):
    __slots__ = ("cell", "home_cell", "R", "Rp",
                 "tooth_inner_r", "tooth_outer_r", "label")

    def __init__(self, cell, pos, R, is_driver=False, label="U2"):
        super().__init__(pos, is_driver=is_driver)
        self.cell = cell
        self.home_cell = cell
        self.label = label
        self.set_radius(R)

    def set_radius(self, R):
        """(Re)derive geometry from the hex outer radius R."""
        self.R = float(R)
        a = self.R * C30
        self.Rp = 0.5 * (self.R + a)
        self.tooth_inner_r = a
        self.tooth_outer_r = self.R * (1.0 + float(TOOTH_OUTER_EXTRA_MULT))

    def pitch_r(self):
        return self.Rp

    def vertex_points_world(self):
        return hex_vertices(self.pos[0], self.pos[1], self.R)

    def hit_radius(self):
        return self.R * 0.95

    def draw(self):
        x, y = self.pos
        fill = (0.22, 0.24, 0.30) if self.label == "U2" else (0.18, 0.22, 0.33)
        draw_filled_hex(x, y, self.R, fill_rgb=fill, outline_alpha=0.55, outline_w=2)
        draw_gear(x, y, self.Rp, self.angle, teeth=self.teeth, ring_w=3,
                  tooth_inner_r=self.tooth_inner_r, tooth_outer_r=self.tooth_outer_r)
        if self.is_driver:
            scene.fill(1.0, 0.6, 0.1, 0.95)
            scene.stroke(0.0, 0.0, 0.0, 0.35)
            scene.stroke_weight(1)
            rr = self.R * 0.18
            scene.ellipse(x - self.R * 0.55 - rr, y + self.R * 0.55 - rr, 2 * rr, 2 * rr)
        if self.locked:
            draw_lock_x(x, y, self.R)
        self.draw_rpm_text(y_offset=-self.R * 0.18)


class TriGearTile(TileBase):
    __slots__ = ("tri", "home_tri", "step", "origin",
                 "Rp_small", "tooth_inner_r", "tooth_outer_r")

    def __init__(self, tri_key, pos, step, origin, Rp_small, is_driver=False):
        super().__init__(pos, is_driver=is_driver)
        self.tri = tri_key
        self.home_tri = tri_key
        self.step = step
        self.origin = origin
        self.set_pitch(Rp_small)

    def set_pitch(self, Rp_small):
        self.Rp_small = float(Rp_small)
        self.tooth_inner_r = self.Rp_small * 0.82
        self.tooth_outer_r = self.Rp_small * 1.12

    def pitch_r(self):
        return self.Rp_small

    def hit_radius(self):
        return max(self.Rp_small * 1.4, self.step * 0.9)

    def triangle_vertices_world(self):
        i, j, up = self.tri
        pts = triangle_vertices_from_cell(i, j, up)
        return [tri_to_screen(pi, pj, self.step, self.origin) for (pi, pj) in pts]

    def vertex_points_world(self):
        return self.triangle_vertices_world()

    def draw(self):
        tri_xy = self.triangle_vertices_world()
        draw_filled_triangle(tri_xy, fill_rgb=(0.18, 0.20, 0.26),
                             outline_alpha=0.55, outline_w=2)
        x, y = self.pos
        draw_gear(x, y, self.Rp_small, self.angle, teeth=self.teeth, ring_w=3,
                  tooth_inner_r=self.tooth_inner_r, tooth_outer_r=self.tooth_outer_r)
        if self.is_driver:
            scene.fill(1.0, 0.6, 0.1, 0.95)
            scene.stroke(0.0, 0.0, 0.0, 0.35)
            scene.stroke_weight(1)
            rr = self.Rp_small * 0.28
            scene.ellipse(x - rr, y + self.step * 0.45 - rr, 2 * rr, 2 * rr)
        if self.locked:
            draw_lock_x(x, y, self.step * 0.9)
        self.draw_rpm_text(y_offset=-self.step * 0.18)

# ============================================================
# Simple UI menu
# ============================================================


class MenuButton:
    __slots__ = ("label", "id", "x", "y", "w", "h")

    def __init__(self, label, btn_id):
        self.label = label
        self.id = btn_id
        self.x = self.y = 0.0
        self.w = self.h = 0.0

    def set_frame(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h

    def hit(self, px, py):
        return (self.x <= px <= self.x + self.w) and (self.y <= py <= self.y + self.h)

    def draw(self):
        scene.fill(0.0, 0.0, 0.0, 0.25)
        scene.stroke(1.0, 1.0, 1.0, 0.18)
        scene.stroke_weight(2)
        scene.rect(self.x, self.y, self.w, self.h)
        scene.fill(1.0, 1.0, 1.0, 0.9)
        scene.text(self.label, x=self.x + 12, y=self.y + 12,
                   font_size=16, font_name=FONT_NAME)


class GearMenu:
    def __init__(self):
        self.buttons = []
        self.x = 0.0
        self.y = 0.0
        self.w = float(MENU_W)
        self.h = 0.0

    def set_buttons(self, labels_and_ids):
        self.buttons = [MenuButton(lbl, bid) for (lbl, bid) in labels_and_ids]

    def button(self, btn_id):
        for b in self.buttons:
            if b.id == btn_id:
                return b
        return None

    def layout(self, size):
        self.x = float(MENU_PAD)
        self.y = float(MENU_PAD)
        self.w = float(MENU_W)
        self.h = size.h - 2.0 * float(MENU_PAD)

        top = size.h - float(MENU_PAD) - float(BTN_H)
        for i, b in enumerate(self.buttons):
            by = top - i * (float(BTN_H) + float(BTN_GAP))
            b.set_frame(self.x, by, self.w, float(BTN_H))

    def contains(self, px, py):
        """True if a point falls anywhere on the menu panel (used as a trash zone)."""
        return (self.x <= px <= self.x + self.w) and (self.y <= py <= self.y + self.h)

    def draw(self):
        scene.fill(0.0, 0.0, 0.0, 0.10)
        scene.stroke(1.0, 1.0, 1.0, 0.08)
        scene.stroke_weight(2)
        scene.rect(self.x, self.y, self.w, self.h)
        for b in self.buttons:
            b.draw()

    def hit_test(self, px, py):
        for b in self.buttons:
            if b.hit(px, py):
                return b.id
        return None

# ============================================================
# Scene
# ============================================================


class GearMeshScene(scene.Scene):

    # ----------------------------
    # Lifecycle
    # ----------------------------

    def setup(self):
        self.bg = (0.10, 0.11, 0.14)
        self.origin = (self.size.w * 0.5, self.size.h * 0.5)

        self.hex_occ = {}
        self.tri_occ = {}
        self.tile_list = []

        self.dragging = False
        self.drag_tile = None
        self.touch_start = (0.0, 0.0)
        self.paused = False
        self.selected_driver = None

        self.mesh_edges = []
        self._graph = {}
        self._topology_dirty = True

        self._recompute_geometry()

        # Mode + puzzle state
        self.mode = "menu"          # "menu" | "free" | "puzzle"
        self.level_idx = 0
        self.win = False

        self.menu = GearMenu()      # left-side in-game controls
        self.screen_buttons = []    # centered buttons for menu / win screens

        self.enter_main_menu()

    def did_change_size(self):
        self.origin = (self.size.w * 0.5, self.size.h * 0.5)
        self._recompute_geometry()
        self.menu.layout(self.size)
        if self.mode == "menu":
            self._layout_screen_buttons(self._main_menu_items())
        elif self.win:
            self._layout_screen_buttons(self._win_items())

        # Rescale and reposition existing tiles so they stay consistent with the
        # new grid spacing (handles device rotation cleanly).
        for cell, t in list(self.hex_occ.items()):
            t.set_radius(self.R3 if t.label == "U3" else self.R2)
            t.pos = tri_to_screen(cell[0], cell[1], self.step, self.origin)
        for key, t in list(self.tri_occ.items()):
            t.step = self.step
            t.origin = self.origin
            t.set_pitch(self.Rp_small)
            t.pos = triangle_centroid_screen(key[0], key[1], key[2], self.step, self.origin)

        self._mark_dirty()

    # ----------------------------
    # Mode switching
    # ----------------------------

    def _clear_board(self):
        self.hex_occ.clear()
        self.tri_occ.clear()
        self.tile_list = []
        self.dragging = False
        self.drag_tile = None
        self.selected_driver = None
        self.paused = False
        self.win = False
        self._mark_dirty()

    def _main_menu_items(self):
        items = [("Free Play", "free")]
        for i, lv in enumerate(LEVELS):
            items.append(("Level %d:  %s" % (i + 1, lv["name"]), "lvl_%d" % i))
        return items

    def _win_items(self):
        if self.level_idx + 1 < len(LEVELS):
            return [("Next Level", "next"), ("Main Menu", "menu")]
        return [("Main Menu", "menu")]

    def _layout_screen_buttons(self, items):
        """Center a vertical stack of wide buttons for menu / win screens."""
        bw = min(360.0, self.size.w - 2 * MENU_PAD)
        bh = 52.0
        gap = 14.0
        n = len(items)
        total = n * bh + (n - 1) * gap
        x = (self.size.w - bw) * 0.5
        y0 = (self.size.h - total) * 0.5
        self.screen_buttons = []
        # Top item should be highest on screen (y-up coords).
        for k, (label, bid) in enumerate(items):
            y = y0 + (n - 1 - k) * (bh + gap)
            b = MenuButton(label, bid)
            b.set_frame(x, y, bw, bh)
            self.screen_buttons.append(b)

    def enter_main_menu(self):
        self.mode = "menu"
        self._clear_board()
        self._layout_screen_buttons(self._main_menu_items())

    def start_free_play(self):
        self.mode = "free"
        self._clear_board()
        self.menu.set_buttons([
            ("Add U1", "add_tri"),
            ("Add U2", "add_u2"),
            ("Add U3", "add_u3"),
            ("Speed -", "spd_dn"),
            ("Speed +", "spd_up"),
            ("Pause", "pause"),
            ("Reset", "reset"),
            ("Menu", "to_menu"),
        ])
        self.menu.layout(self.size)
        self._spawn_initial()
        self.selected_driver = next((t for t in self.tile_list if t.is_driver), None)
        self._mark_dirty()
        self._ensure_rebuilt()

    def start_level(self, idx):
        self.mode = "puzzle"
        self.level_idx = max(0, min(idx, len(LEVELS) - 1))
        self._clear_board()
        lv = LEVELS[self.level_idx]

        for (cell, rpm) in lv["drives"]:
            t = self._add_hex_tile(cell, R_new=self.R2, is_driver=True, label="U2")
            if t is not None:
                t.anchored = True
                t.role = "drive"
                t.drive_speed = rpm_to_omega(rpm)
        for cell in lv["driven"]:
            t = self._add_hex_tile(cell, R_new=self.R2, is_driver=False, label="U2")
            if t is not None:
                t.anchored = True
                t.role = "driven"

        self.menu.set_buttons([
            ("Place Gear", "add_u2"),
            ("Restart", "restart"),
            ("Menu", "to_menu"),
        ])
        self.menu.layout(self.size)
        self._mark_dirty()
        self._ensure_rebuilt()

    def _placed_count(self):
        return sum(1 for t in self.tile_list if not t.anchored)

    def _gears_left(self):
        if self.mode != "puzzle":
            return 0
        return LEVELS[self.level_idx]["budget"] - self._placed_count()

    def _check_win(self):
        driven = [t for t in self.tile_list if t.role == "driven"]
        if driven and all(abs(t.omega) > WIN_SPIN_EPS for t in driven):
            self.win = True
            self._layout_screen_buttons(self._win_items())

    def _recompute_geometry(self):
        legacy_base = min(self.size.w, self.size.h) * 0.085
        legacy_unit = legacy_base * float(GRID_SCALE)

        self.R2 = legacy_unit * float(PAD_RADIUS_MULT)
        self.step = self.R2

        a2 = self.R2 * C30
        self.Rp2 = 0.5 * (self.R2 + a2)
        self.Rp_small = 0.5 * self.Rp2
        self.R3 = self.R2 * float(UNIT3_RADIUS_MULT)

        self.safe_margin = self.R3 * 0.25
        self.grid_dot_r = max(1.0, self.step * GRID_POINT_R_MULT)

        self.vertex_quant = max(0.5, float(VERTEX_QUANT_PX))
        self.vtx_tol = float(VERTEX_MESH_TOL_MULT) * self.step
        self.vtx_tol2 = self.vtx_tol * self.vtx_tol

        self.engage_pad = float(MESH_ENGAGE_PAD_MULT) * self.step
        self.circular_pitch_px = float(CIRC_PITCH_PX_MULT) * self.step
        self.tap_move_tol = self.step * float(TAP_MOVE_TOL_MULT)

    def _refresh_teeth_all(self):
        for t in self.tile_list:
            t.teeth = compute_teeth_from_pitch_radius(t.pitch_r(), self.circular_pitch_px)

    def _mark_dirty(self):
        self._topology_dirty = True

    def _ensure_rebuilt(self):
        """Rebuild teeth, mesh edges and the ratio graph only when needed."""
        if not self._topology_dirty:
            return
        self._refresh_teeth_all()
        self._graph = self._build_ratio_graph()  # also refreshes self.mesh_edges
        self._topology_dirty = False

    # ----------------------------
    # Safety / occupancy
    # ----------------------------

    def is_pos_safe(self, x, y):
        m = self.safe_margin
        return (m <= x <= self.size.w - m) and (m <= y <= self.size.h - m)

    def _hex_center_clear(self, x, y, R_new, ignore=None):
        for other in self.hex_occ.values():
            if other is ignore:
                continue
            min_d = (R_new + other.R) * float(HEX_OVERLAP_MIN_CENTER_MULT)
            if dist2((x, y), other.pos) < (min_d * min_d):
                return False
        return True

    def can_place_hex(self, cell, R_new, ignore=None):
        x, y = tri_to_screen(cell[0], cell[1], self.step, self.origin)
        if not self.is_pos_safe(x, y):
            return False
        if cell in self.hex_occ and self.hex_occ[cell] is not ignore:
            return False
        if not self._hex_center_clear(x, y, R_new, ignore=ignore):
            return False
        return True

    def can_place_tri(self, tri_key, ignore=None):
        x, y = triangle_centroid_screen(tri_key[0], tri_key[1], tri_key[2],
                                        self.step, self.origin)
        if not self.is_pos_safe(x, y):
            return False
        if tri_key in self.tri_occ and self.tri_occ[tri_key] is not ignore:
            return False
        return True

    def nearest_free_hex(self, target, R_new):
        if self.can_place_hex(target, R_new):
            return target
        tx, ty = tri_to_screen(target[0], target[1], self.step, self.origin)
        for rad in range(1, 60):
            best = None
            best_d = 1e18
            for c in tri_ring(target, rad):
                if not self.can_place_hex(c, R_new):
                    continue
                x, y = tri_to_screen(c[0], c[1], self.step, self.origin)
                d = (x - tx) ** 2 + (y - ty) ** 2
                if d < best_d:
                    best_d = d
                    best = c
            if best is not None:
                return best
        return None

    def nearest_free_tri(self, fx, fy):
        i_f, j_f = screen_to_tri(fx, fy, self.step, self.origin)
        ci, cj = tri_round(i_f, j_f)
        best = None
        best_d = 1e18
        R = int(TRI_SNAP_SEARCH_R)
        for j in range(cj - R, cj + R + 1):
            for i in range(ci - R, ci + R + 1):
                for up in (True, False):
                    key = (i, j, up)
                    if not self.can_place_tri(key):
                        continue
                    cx, cy = triangle_centroid_screen(i, j, up, self.step, self.origin)
                    d = (cx - fx) ** 2 + (cy - fy) ** 2
                    if d < best_d:
                        best_d = d
                        best = key
        return best

    # ----------------------------
    # Spawning / removal
    # ----------------------------

    def _add_hex_tile(self, cell, R_new, is_driver=False, label="U2"):
        if not self.can_place_hex(cell, R_new):
            return None
        pos = tri_to_screen(cell[0], cell[1], self.step, self.origin)
        t = HexGearTile(cell, pos, R_new, is_driver=is_driver, label=label)
        self.hex_occ[cell] = t
        self.tile_list.append(t)
        return t

    def _add_tri_tile(self, tri_key):
        if not self.can_place_tri(tri_key):
            return None
        pos = triangle_centroid_screen(tri_key[0], tri_key[1], tri_key[2],
                                       self.step, self.origin)
        t = TriGearTile(tri_key, pos, self.step, self.origin, self.Rp_small, is_driver=False)
        self.tri_occ[tri_key] = t
        self.tile_list.append(t)
        return t

    def _spawn_initial(self):
        # A simple meshing chain that actually turns. (Closed loops of an odd
        # number of external gears jam, so the starting set is kept as a tree.)
        self._add_hex_tile((0, 0), R_new=self.R2, is_driver=True, label="U2")
        self._add_hex_tile((2, 0), R_new=self.R2, is_driver=False, label="U2")
        self._add_hex_tile((4, 0), R_new=self.R3, is_driver=False, label="U3")
        self._add_tri_tile((0, -1, True))

        for z, t in enumerate(self.tile_list):
            t.z = z
        # Keep triangle gears drawn on top.
        for t in self.tile_list:
            if isinstance(t, TriGearTile):
                t.z += 200

    def add_gear_from_menu(self, gear_id):
        spawn_px = (self.origin[0] + self.step * 2.2, self.origin[1])

        if gear_id == "add_u2":
            i_f, j_f = screen_to_tri(spawn_px[0], spawn_px[1], self.step, self.origin)
            cell = tri_round(i_f, j_f)
            dest = self.nearest_free_hex(cell, self.R2) or self.nearest_free_hex((0, 0), self.R2)
            if dest is not None:
                self._add_hex_tile(dest, R_new=self.R2, is_driver=False, label="U2")

        elif gear_id == "add_u3":
            i_f, j_f = screen_to_tri(spawn_px[0], spawn_px[1], self.step, self.origin)
            cell = tri_round(i_f, j_f)
            dest = self.nearest_free_hex(cell, self.R3) or self.nearest_free_hex((0, 0), self.R3)
            if dest is not None:
                self._add_hex_tile(dest, R_new=self.R3, is_driver=False, label="U3")

        elif gear_id == "add_tri":
            dest = self.nearest_free_tri(spawn_px[0], spawn_px[1])
            if dest is not None:
                self._add_tri_tile(dest)

    def _remove_from_occ(self, t):
        """Detach a tile from the lattice (used while dragging)."""
        if isinstance(t, HexGearTile):
            t.home_cell = t.cell
            if self.hex_occ.get(t.cell) is t:
                del self.hex_occ[t.cell]
        else:
            t.home_tri = t.tri
            if self.tri_occ.get(t.tri) is t:
                del self.tri_occ[t.tri]

    def _replace_tile(self, t):
        """Snap a dragged tile back onto the nearest free lattice slot."""
        if isinstance(t, HexGearTile):
            i_f, j_f = screen_to_tri(t.pos[0], t.pos[1], self.step, self.origin)
            target = tri_round(i_f, j_f)
            dest = (self.nearest_free_hex(target, t.R)
                    or self.nearest_free_hex((0, 0), t.R)
                    or t.home_cell)
            self.hex_occ[dest] = t
            t.cell = dest
            t.pos = tri_to_screen(dest[0], dest[1], self.step, self.origin)
        else:
            dest = self.nearest_free_tri(t.pos[0], t.pos[1]) or t.home_tri
            self.tri_occ[dest] = t
            t.tri = dest
            t.pos = triangle_centroid_screen(dest[0], dest[1], dest[2], self.step, self.origin)

    def _delete_tile(self, t):
        if t in self.tile_list:
            self.tile_list.remove(t)
        if t is self.selected_driver:
            self.selected_driver = None
        if isinstance(t, HexGearTile):
            if self.hex_occ.get(t.cell) is t:
                del self.hex_occ[t.cell]
        else:
            if self.tri_occ.get(t.tri) is t:
                del self.tri_occ[t.tri]

    def _cycle_driver(self, tile):
        """Tap behaviour: non-driver -> driver(selected) -> non-driver.
        Tapping a different driver just selects it (for speed adjustment)."""
        if not tile.is_driver:
            tile.is_driver = True
            self.selected_driver = tile
        elif tile is not self.selected_driver:
            self.selected_driver = tile
        else:
            tile.is_driver = False
            self.selected_driver = next(
                (t for t in self.tile_list if t.is_driver), None)

    def _adjust_selected_speed(self, delta_rpm):
        if self.selected_driver is None:
            self.selected_driver = next(
                (t for t in self.tile_list if t.is_driver), None)
        d = self.selected_driver
        if d is None:
            return
        rpm = omega_to_rpm(d.drive_speed) + delta_rpm
        max_rpm = omega_to_rpm(MAX_ABS_OMEGA)
        d.drive_speed = rpm_to_omega(clampf(rpm, -max_rpm, max_rpm))

    def _reset(self):
        self.hex_occ.clear()
        self.tri_occ.clear()
        self.tile_list = []
        self.dragging = False
        self.drag_tile = None
        self.paused = False
        self.selected_driver = None
        self._sync_pause_label()
        self._spawn_initial()
        self.selected_driver = next((t for t in self.tile_list if t.is_driver), None)
        self._mark_dirty()

    # ----------------------------
    # Meshing graph
    # ----------------------------

    def _vertex_key(self, x, y):
        q = self.vertex_quant
        return (int(round(x / q)), int(round(y / q)))

    def _build_mesh_edges(self):
        occ = list(self.hex_occ.values()) + list(self.tri_occ.values())
        idmap = {id(t): t for t in occ}

        # 1) Shared lattice vertices => touching tiles mesh.
        vertex_map = {}
        for t in occ:
            for vx, vy in t.vertex_points_world():
                k = self._vertex_key(vx, vy)
                vertex_map.setdefault(k, []).append(t)

        edges = set()
        for tiles in vertex_map.values():
            if len(tiles) < 2:
                continue
            for i in range(len(tiles)):
                for j in range(i + 1, len(tiles)):
                    a, b = tiles[i], tiles[j]
                    ia, ib = id(a), id(b)
                    edges.add((ia, ib) if ia < ib else (ib, ia))

        # 2) Pitch-circle proximity + near-coincident vertices.
        verts = {t: t.vertex_points_world() for t in occ}
        for i in range(len(occ)):
            a = occ[i]
            ra = a.pitch_r()
            for j in range(i + 1, len(occ)):
                b = occ[j]
                rb = b.pitch_r()
                ia, ib = id(a), id(b)
                key = (ia, ib) if ia < ib else (ib, ia)
                if key in edges:
                    continue

                if dist(a.pos, b.pos) <= (ra + rb + self.engage_pad):
                    edges.add(key)
                    continue

                close = False
                for p in verts[a]:
                    for q in verts[b]:
                        if dist2(p, q) <= self.vtx_tol2:
                            close = True
                            break
                    if close:
                        break
                if close:
                    edges.add(key)

        out = []
        for ia, ib in edges:
            ta = idmap.get(ia)
            tb = idmap.get(ib)
            if ta is not None and tb is not None:
                out.append((ta, tb))
        self.mesh_edges = out
        return out

    def _build_ratio_graph(self):
        edges = self._build_mesh_edges()
        graph = {}
        nodes = list(self.hex_occ.values()) + list(self.tri_occ.values())
        for t in nodes:
            graph[t] = []
        for a, b in edges:
            ra = a.pitch_r()
            rb = b.pitch_r()
            if rb <= 1e-9 or ra <= 1e-9:
                continue
            # Meshed gears turn in opposite directions; the smaller spins faster.
            graph[a].append((b, -(ra / rb)))
            graph[b].append((a, -(rb / ra)))
        return graph

    # ----------------------------
    # Torque simulation
    # ----------------------------

    def _solve_component_ratios(self, graph, driver):
        ratio_to_driver = {driver: 1.0}
        dq = deque([driver])
        eps = 1e-5
        while dq:
            cur = dq.popleft()
            cur_ratio = ratio_to_driver[cur]
            for nb, ratio_nb_cur in graph[cur]:
                implied = ratio_nb_cur * cur_ratio
                if nb in ratio_to_driver:
                    if abs(ratio_to_driver[nb] - implied) > eps:
                        return ratio_to_driver, False  # inconsistent loop -> jam
                else:
                    ratio_to_driver[nb] = implied
                    dq.append(nb)
        return ratio_to_driver, True

    def _collect_component_nodes(self, graph, start):
        out = set([start])
        dq = deque([start])
        while dq:
            cur = dq.popleft()
            for nb, _ in graph[cur]:
                if nb not in out:
                    out.add(nb)
                    dq.append(nb)
        return out

    def _apply_drive_dynamics(self, dt):
        """Velocity-servo dynamics supporting any number of drivers per train.

        For each connected component we pick an arbitrary reference gear and
        express every gear's speed as omega_i = k_i * omega_ref (k from the gear
        ratios). Each driver acts as a motor producing torque
            tau_d = GAIN * (target_d - omega_d)
        which, reflected to the reference, sums into a single 1-DOF equation:
            I_eff * d(omega_ref)/dt = T_drive - (B_fric + B_motor) * omega_ref
        Consistent drivers cooperate; conflicting ones fight to a compromise;
        an odd meshing loop (geometrically impossible) jams the whole train.
        """
        graph = self._graph
        nodes = list(graph.keys())
        for t in nodes:
            t.locked = False

        gain = float(DRIVE_SERVO_GAIN)
        visited = set()
        for start in nodes:
            if start in visited:
                continue

            comp = self._collect_component_nodes(graph, start)
            visited |= comp

            # Ratios relative to `start` (k_start = 1).
            ratios, ok = self._solve_component_ratios(graph, start)
            if (not ok) or (len(ratios) != len(comp)):
                for t in comp:
                    t.omega = 0.0
                    t.locked = True          # impossible loop -> jam (red X)
                continue

            drivers = [t for t in comp if t.is_driver]
            if not drivers:
                for t in comp:
                    t.omega = 0.0            # no motor -> idle
                continue

            # Reflect inertia and passive friction to the reference gear.
            I_eff = 0.0
            B_eff = float(OMEGA_DAMP)
            for t in comp:
                k = ratios[t]
                I_eff += t.inertia(self.Rp2) * k * k
                B_eff += t.friction_b(self.Rp2) * k * k
            if I_eff <= 1e-9:
                for t in comp:
                    t.omega = 0.0
                continue

            # Each motor: tau_d = gain*(target_d - k_d*omega_ref), reflected by k_d.
            #   T_drive = gain * Sum( k_d * target_d )
            #   B_motor = gain * Sum( k_d^2 )
            T_drive = 0.0
            B_motor = 0.0
            for d in drivers:
                kd = ratios[d]
                T_drive += gain * kd * d.drive_speed
                B_motor += gain * kd * kd

            # Recover current omega_ref from the tiles (robust to which gear is
            # the reference): least-squares of omega_i = k_i * omega_ref.
            num = 0.0
            den = 0.0
            for t in comp:
                k = ratios[t]
                num += t.omega * k
                den += k * k
            omega_ref = num / den if den > 1e-9 else 0.0

            alpha = (T_drive - (B_eff + B_motor) * omega_ref) / I_eff
            omega_ref = clampf(omega_ref + alpha * dt, -MAX_ABS_OMEGA, MAX_ABS_OMEGA)

            for t in comp:
                t.omega = ratios[t] * omega_ref
                t.locked = False

    # ----------------------------
    # Drawing
    # ----------------------------

    def draw_grid_points(self):
        if not SHOW_GRID_POINTS:
            return
        scene.fill(1.0, 1.0, 1.0, GRID_POINT_ALPHA)
        r = self.grid_dot_r
        R = int(GRID_POINTS_RING)
        stepN = max(1, int(GRID_POINT_SPACING))
        for j in range(-R, R + 1, stepN):
            for i in range(-R, R + 1, stepN):
                x, y = tri_to_screen(i, j, self.step, self.origin)
                if self.is_pos_safe(x, y):
                    scene.ellipse(x - r, y - r, 2 * r, 2 * r)

    def draw_mesh_lines(self):
        if not SHOW_MESH_LINES:
            return
        scene.stroke(0.2, 0.8, 1.0, 0.35)
        scene.stroke_weight(4)
        for a, b in self.mesh_edges:
            scene.line(a.pos[0], a.pos[1], b.pos[0], b.pos[1])

    def draw_pitch_circles(self):
        if not SHOW_PITCH_CIRCLES:
            return
        for t in self.tile_list:
            draw_circle_poly(t.pos[0], t.pos[1], t.pitch_r(), segs=36,
                             rgba=(1.0, 1.0, 1.0, 0.10), w=2)

    def update(self):
        if self.mode == "menu":
            return
        self._ensure_rebuilt()
        if self.paused:
            return
        dt = self.dt
        self._apply_drive_dynamics(dt)
        for t in self.tile_list:
            if (not t.locked) and (t.omega != 0.0):
                t.angle = (t.angle + t.omega * dt) % math.tau
        if self.mode == "puzzle" and not self.win:
            self._check_win()

    def draw(self):
        scene.background(self.bg[0], self.bg[1], self.bg[2])

        if self.mode == "menu":
            self._draw_main_menu()
            return

        scene.stroke(1.0, 1.0, 1.0, 0.08)
        scene.stroke_weight(2)
        scene.fill(1.0, 1.0, 1.0, 0.0)
        scene.rect(self.safe_margin, self.safe_margin,
                   self.size.w - 2 * self.safe_margin,
                   self.size.h - 2 * self.safe_margin)

        self.draw_grid_points()
        self.draw_pitch_circles()
        self.draw_mesh_lines()

        for t in sorted(self.tile_list, key=lambda tt: tt.z):
            t.draw()

        if self.mode == "puzzle":
            self._draw_roles()
        self._draw_selected_highlight()
        self.menu.draw()
        self._draw_hud()

        if self.win:
            self._draw_win_overlay()

    def _draw_main_menu(self):
        cx = self.size.w * 0.5
        scene.fill(1.0, 1.0, 1.0, 0.95)
        scene.text(GAME_TITLE, x=cx - 150, y=self.size.h - 80,
                   font_size=46, font_name=FONT_NAME)
        scene.fill(1.0, 1.0, 1.0, 0.45)
        scene.text("connect the drive gears to the targets",
                   x=cx - 150, y=self.size.h - 120,
                   font_size=15, font_name=FONT_NAME)
        for b in self.screen_buttons:
            b.draw()

    def _draw_roles(self):
        """Highlight the fixed drive (blue) and target (green/amber) gears."""
        for t in self.tile_list:
            if t.role == "drive":
                draw_circle_poly(t.pos[0], t.pos[1], t.pitch_r() * 1.32, segs=40,
                                 rgba=(0.25, 0.7, 1.0, 0.9), w=3)
                self._tag(t, "DRIVE")
            elif t.role == "driven":
                connected = abs(t.omega) > WIN_SPIN_EPS
                col = (0.25, 0.95, 0.45, 0.95) if connected else (1.0, 0.7, 0.2, 0.95)
                draw_circle_poly(t.pos[0], t.pos[1], t.pitch_r() * 1.32, segs=40,
                                 rgba=col, w=3)
                self._tag(t, "TARGET")

    def _tag(self, tile, text):
        scene.fill(1.0, 1.0, 1.0, 0.8)
        scene.text(text, x=tile.pos[0] - 22, y=tile.pos[1] + tile.pitch_r() * 1.5,
                   font_size=11, font_name=FONT_NAME)

    def _draw_win_overlay(self):
        scene.fill(0.0, 0.0, 0.0, 0.55)
        scene.rect(0, 0, self.size.w, self.size.h)
        cx = self.size.w * 0.5
        scene.fill(0.3, 0.95, 0.5, 0.95)
        scene.text("LEVEL COMPLETE", x=cx - 150, y=self.size.h * 0.5 + 120,
                   font_size=40, font_name=FONT_NAME)
        for b in self.screen_buttons:
            b.draw()

    def _draw_selected_highlight(self):
        d = self.selected_driver
        if d is None or d not in self.tile_list:
            return
        r = d.pitch_r() * 1.25
        draw_circle_poly(d.pos[0], d.pos[1], r, segs=40,
                         rgba=(1.0, 0.6, 0.1, 0.9), w=3)

    def _draw_hud(self):
        info_x = MENU_PAD + MENU_W + 12

        if self.mode == "puzzle":
            lv = LEVELS[self.level_idx]
            left = self._gears_left()
            scene.fill(1.0, 1.0, 1.0, 0.9)
            scene.text("Level %d: %s    gears left: %d / %d"
                       % (self.level_idx + 1, lv["name"], left, lv["budget"]),
                       x=info_x, y=14, font_size=14, font_name=FONT_NAME)
            scene.fill(1.0, 1.0, 1.0, 0.5)
            scene.text(lv["hint"] + "    (drag a gear onto the menu to remove it)",
                       x=info_x, y=self.size.h - 18, font_size=12, font_name=FONT_NAME)
            return

        n_drivers = sum(1 for t in self.tile_list if t.is_driver)
        status = "PAUSED" if self.paused else "RUN"
        if self.selected_driver is not None:
            sel = "%+.0f rpm" % omega_to_rpm(self.selected_driver.drive_speed)
        else:
            sel = "none"

        scene.fill(1.0, 1.0, 1.0, 0.86)
        scene.text(
            "%s   gears=%d   drivers=%d   selected target=%s   edges=%d"
            % (status, len(self.tile_list), n_drivers, sel, len(self.mesh_edges)),
            x=info_x, y=14, font_size=13, font_name=FONT_NAME)

        scene.fill(1.0, 1.0, 1.0, 0.45)
        scene.text("tap = driver on/off/select    Speed -/+ = set speed    "
                   "drag = move    drop on menu = delete",
                   x=info_x, y=self.size.h - 18, font_size=12, font_name=FONT_NAME)

    def _sync_pause_label(self):
        b = self.menu.button("pause")
        if b is not None:
            b.label = "Run" if self.paused else "Pause"

    # ----------------------------
    # Touch
    # ----------------------------

    def _pick_tile(self, p):
        for t in sorted(self.tile_list, key=lambda tt: tt.z, reverse=True):
            if t.contains(p):
                return t
        return None

    def _handle_menu(self, mid):
        if mid == "add_u2" and self.mode == "puzzle":
            if self._gears_left() > 0:
                self.add_gear_from_menu("add_u2")
                self._mark_dirty()
            return
        if mid in ("add_tri", "add_u2", "add_u3"):
            self.add_gear_from_menu(mid)
            self._mark_dirty()
        elif mid == "spd_up":
            self._adjust_selected_speed(SPEED_STEP_RPM)
        elif mid == "spd_dn":
            self._adjust_selected_speed(-SPEED_STEP_RPM)
        elif mid == "pause":
            self.paused = not self.paused
            self._sync_pause_label()
        elif mid == "reset":
            self._reset()
        elif mid == "restart":
            self.start_level(self.level_idx)
        elif mid == "to_menu":
            self.enter_main_menu()

    def _handle_screen_button(self, bid):
        if bid == "free":
            self.start_free_play()
        elif bid == "menu":
            self.enter_main_menu()
        elif bid == "next":
            self.start_level(self.level_idx + 1)
        elif bid.startswith("lvl_"):
            self.start_level(int(bid.split("_")[1]))

    def touch_began(self, touch):
        p = (touch.location.x, touch.location.y)
        self.touch_start = p

        # Menu / win screens: only the centered buttons are live.
        if self.mode == "menu" or self.win:
            for b in self.screen_buttons:
                if b.hit(p[0], p[1]):
                    self._handle_screen_button(b.id)
                    return
            return

        mid = self.menu.hit_test(p[0], p[1])
        if mid is not None:
            self._handle_menu(mid)
            return

        chosen = self._pick_tile(p)
        if chosen is None:
            return

        # Anchored puzzle gears (drives/targets) can't be picked up.
        if chosen.anchored:
            return

        self.dragging = True
        self.drag_tile = chosen
        chosen.omega = 0.0
        chosen.drag_offset = (chosen.pos[0] - p[0], chosen.pos[1] - p[1])
        chosen.z = max(tt.z for tt in self.tile_list) + 1

        # Disconnect from the mesh while it's in hand.
        self._remove_from_occ(chosen)
        self._mark_dirty()

    def touch_moved(self, touch):
        if not self.dragging or self.drag_tile is None:
            return
        t = self.drag_tile
        p = (touch.location.x, touch.location.y)
        t.pos = (p[0] + t.drag_offset[0], p[1] + t.drag_offset[1])
        t.omega = 0.0

    def touch_ended(self, touch):
        if not self.dragging or self.drag_tile is None:
            return
        t = self.drag_tile
        self.drag_tile = None
        self.dragging = False
        p = (touch.location.x, touch.location.y)

        # Dropped on the menu strip -> trash it (refunds the budget in puzzles).
        if self.menu.contains(p[0], p[1]):
            self._delete_tile(t)
            self._mark_dirty()
            return

        # Barely moved -> treat as a tap. Driver assignment is a free-play feature.
        if dist(p, self.touch_start) < self.tap_move_tol and self.mode == "free":
            self._cycle_driver(t)

        self._replace_tile(t)
        self._mark_dirty()


# ----------------------------
# Run
# ----------------------------

if __name__ == "__main__":
    scene.run(GearMeshScene(), show_fps=True)
