#!/usr/bin/env python3
"""
Vorlage-Korrekturen am Inselhaus-glTF:
- Wurzeln → herabhängende Leitern
- Lanzen auf dem Ausleger → spitze Bäume
- Propeller größer + rot/weiß gestreift
"""
from __future__ import annotations

import base64
import json
import math
from pathlib import Path

import numpy as np

PATH = Path(__file__).resolve().parent / "inselhaus.json"

data = json.loads(PATH.read_text())
nodes = data["nodes"]
meshes = data["meshes"]
accessors = data["accessors"]
buffer_views = data["bufferViews"]
materials = data["materials"]
raw = bytearray(base64.b64decode(data["buffers"][0]["uri"].split(",", 1)[1]))


def find_mat(*needles: str, default: int = 0) -> int:
    for i, m in enumerate(materials):
        name = (m.get("name") or "").lower()
        if any(n in name for n in needles):
            return i
    return default


def ensure_mat(name: str, rgba: list[float], metal=0.05, rough=0.7) -> int:
    for i, m in enumerate(materials):
        if m.get("name") == name:
            return i
    materials.append(
        {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": rgba,
                "metallicFactor": metal,
                "roughnessFactor": rough,
            },
        }
    )
    return len(materials) - 1


MAT_WOOD = find_mat("holz")
MAT_ROPE = find_mat("seil", default=MAT_WOOD)
MAT_GREEN = ensure_mat("Nadelgruen", [0.22, 0.42, 0.18, 1.0], 0.0, 0.85)
MAT_TRUNK = ensure_mat("Baumstamm", [0.35, 0.22, 0.12, 1.0], 0.0, 0.9)
MAT_RED = ensure_mat("Propeller_rot", [0.78, 0.12, 0.10, 1.0], 0.15, 0.45)
MAT_WHITE = ensure_mat("Propeller_weiss", [0.95, 0.93, 0.90, 1.0], 0.15, 0.45)
MAT_HUB = find_mat("eisen", "kupfer", default=13)


def add_view(arr: np.ndarray, target: int) -> int:
    global raw
    while len(raw) % 4:
        raw.append(0)
    offset = len(raw)
    raw.extend(arr.tobytes())
    bv_i = len(buffer_views)
    buffer_views.append(
        {"buffer": 0, "byteOffset": offset, "byteLength": arr.nbytes, "target": target}
    )
    return bv_i


def append_mesh(name: str, positions, indices, material: int) -> int:
    positions = np.asarray(positions, dtype=np.float32)
    indices = np.asarray(indices, dtype=np.uint32)
    normals = np.zeros_like(positions)
    for tri in indices.reshape(-1, 3):
        a, b, c = positions[tri]
        n = np.cross(b - a, c - a)
        ln = np.linalg.norm(n)
        if ln > 1e-12:
            n /= ln
        normals[tri] += n
    lens = np.linalg.norm(normals, axis=1, keepdims=True)
    lens[lens < 1e-12] = 1
    normals = (normals / lens).astype(np.float32)

    pos_bv = add_view(positions, 34962)
    nrm_bv = add_view(normals, 34962)
    idx_bv = add_view(indices, 34963)
    pos_acc = len(accessors)
    accessors.append(
        {
            "bufferView": pos_bv,
            "componentType": 5126,
            "count": len(positions),
            "type": "VEC3",
            "max": positions.max(0).tolist(),
            "min": positions.min(0).tolist(),
        }
    )
    nrm_acc = len(accessors)
    accessors.append(
        {"bufferView": nrm_bv, "componentType": 5126, "count": len(normals), "type": "VEC3"}
    )
    idx_acc = len(accessors)
    accessors.append(
        {"bufferView": idx_bv, "componentType": 5125, "count": len(indices), "type": "SCALAR"}
    )
    mesh_i = len(meshes)
    meshes.append(
        {
            "name": name,
            "primitives": [
                {
                    "attributes": {"POSITION": pos_acc, "NORMAL": nrm_acc},
                    "indices": idx_acc,
                    "material": material,
                }
            ],
        }
    )
    return mesh_i


def add_node(name: str, mesh_i: int, bauteil: str, semantik: str) -> int:
    ni = len(nodes)
    nodes.append(
        {
            "name": name,
            "mesh": mesh_i,
            "extras": {"semantik": semantik, "bauteil": bauteil},
        }
    )
    return ni


def cylinder(p0, p1, r0, r1=None, segments=16):
    if r1 is None:
        r1 = r0
    p0 = np.asarray(p0, float)
    p1 = np.asarray(p1, float)
    axis = p1 - p0
    h = np.linalg.norm(axis)
    axis = axis / h if h > 1e-9 else np.array([0.0, 1.0, 0.0])
    tmp = np.array([1.0, 0.0, 0.0]) if abs(axis[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(axis, tmp)
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    pos, idx = [], []
    for i in range(segments):
        a0 = 2 * math.pi * i / segments
        a1 = 2 * math.pi * (i + 1) / segments
        rA0 = math.cos(a0) * u + math.sin(a0) * v
        rA1 = math.cos(a1) * u + math.sin(a1) * v
        b = len(pos)
        pos += [p0 + rA0 * r0, p0 + rA1 * r0, p1 + rA0 * r1, p1 + rA1 * r1]
        idx += [b, b + 1, b + 2, b + 1, b + 3, b + 2]
    c0 = len(pos)
    pos.append(p0)
    for i in range(segments):
        a = 2 * math.pi * i / segments
        pos.append(p0 + (math.cos(a) * u + math.sin(a) * v) * r0)
    for i in range(segments):
        idx += [c0, c0 + 1 + (i + 1) % segments, c0 + 1 + i]
    c1 = len(pos)
    pos.append(p1)
    for i in range(segments):
        a = 2 * math.pi * i / segments
        pos.append(p1 + (math.cos(a) * u + math.sin(a) * v) * r1)
    for i in range(segments):
        idx += [c1, c1 + 1 + i, c1 + 1 + (i + 1) % segments]
    return np.array(pos, np.float32), np.array(idx, np.uint32)


def cone(base, tip, radius, segments=16):
    return cylinder(base, tip, radius, 0.001, segments)


def box(center, sizes, ax, ay):
    c = np.asarray(center, float)
    ax = np.asarray(ax, float)
    ax /= np.linalg.norm(ax)
    ay = np.asarray(ay, float)
    ay = ay - ax * np.dot(ay, ax)
    ay /= np.linalg.norm(ay)
    az = np.cross(ax, ay)
    hx, hy, hz = [s / 2 for s in sizes]
    corners = []
    for ix in (-1, 1):
        for iy in (-1, 1):
            for iz in (-1, 1):
                corners.append(c + ax * (ix * hx) + ay * (iy * hy) + az * (iz * hz))

    def ci(ix, iy, iz):
        return (0 if ix < 0 else 4) + (0 if iy < 0 else 2) + (0 if iz < 0 else 1)

    faces = [
        [ci(-1, -1, -1), ci(-1, 1, -1), ci(1, 1, -1), ci(1, -1, -1)],
        [ci(-1, -1, 1), ci(1, -1, 1), ci(1, 1, 1), ci(-1, 1, 1)],
        [ci(-1, -1, -1), ci(1, -1, -1), ci(1, -1, 1), ci(-1, -1, 1)],
        [ci(-1, 1, -1), ci(-1, 1, 1), ci(1, 1, 1), ci(1, 1, -1)],
        [ci(-1, -1, -1), ci(-1, -1, 1), ci(-1, 1, 1), ci(-1, 1, -1)],
        [ci(1, -1, -1), ci(1, 1, -1), ci(1, 1, 1), ci(1, -1, 1)],
    ]
    idx = []
    for a, b, c_, d in faces:
        idx += [a, b, c_, a, c_, d]
    return np.array(corners, np.float32), np.array(idx, np.uint32)


def blade_striped(hub, spin_axis, tip_dir, length, width, thickness, stripes=8):
    """Return list of (pos, idx, material) stripe segments along the blade."""
    hub = np.asarray(hub, float)
    spin_axis = np.asarray(spin_axis, float)
    spin_axis /= np.linalg.norm(spin_axis)
    tip_dir = np.asarray(tip_dir, float)
    tip_dir /= np.linalg.norm(tip_dir)
    side = np.cross(spin_axis, tip_dir)
    side /= np.linalg.norm(side)
    root = hub + tip_dir * (length * 0.08)
    tip = hub + tip_dir * length
    out = []
    for s in range(stripes):
        t0 = s / stripes
        t1 = (s + 1) / stripes
        p0 = root + (tip - root) * t0
        p1 = root + (tip - root) * t1
        # width tapers toward tip
        w0 = width * (0.55 - 0.35 * t0)
        w1 = width * (0.55 - 0.35 * t1)
        pitch0 = math.radians(28 - 12 * t0)
        pitch1 = math.radians(28 - 12 * t1)

        def frame(pitch):
            c, s_ = math.cos(pitch), math.sin(pitch)
            sd = c * side + s_ * spin_axis
            od = -s_ * side + c * spin_axis
            return sd, od

        sd0, od0 = frame(pitch0)
        sd1, od1 = frame(pitch1)
        ht = thickness * 0.5
        corners = [
            p0 - sd0 * w0 - od0 * ht,
            p0 + sd0 * w0 - od0 * ht,
            p0 + sd0 * w0 + od0 * ht,
            p0 - sd0 * w0 + od0 * ht,
            p1 - sd1 * w1 - od1 * ht,
            p1 + sd1 * w1 - od1 * ht,
            p1 + sd1 * w1 + od1 * ht,
            p1 - sd1 * w1 + od1 * ht,
        ]
        pos = np.array(corners, np.float32)
        idx = np.array(
            [
                0, 1, 5, 0, 5, 4,
                1, 2, 6, 1, 6, 5,
                2, 3, 7, 2, 7, 6,
                3, 0, 4, 3, 4, 7,
                0, 2, 1, 0, 3, 2,
                4, 5, 6, 4, 6, 7,
            ],
            dtype=np.uint32,
        )
        mat = MAT_RED if s % 2 == 0 else MAT_WHITE
        out.append((pos, idx, mat))
    return out


def make_ladder(top_center, length=3.6, width=0.45, rung_step=0.32):
    """Two side rails + rungs hanging downward (-Y)."""
    top = np.asarray(top_center, float)
    bottom = top + np.array([0.0, -length, 0.0])
    right = np.array([1.0, 0.0, 0.0])
    # slight random yaw via xz offset already in top_center
    parts = []
    for side in (-1, 1):
        a = top + right * (width / 2 * side)
        b = bottom + right * (width / 2 * side)
        pos, idx = cylinder(a, b, 0.028, 0.028, 10)
        parts.append((pos, idx, MAT_ROPE))
    n_rungs = max(3, int(length / rung_step))
    for i in range(n_rungs):
        t = (i + 0.5) / n_rungs
        y = top[1] + (bottom[1] - top[1]) * t
        p0 = np.array([top[0] - width / 2, y, top[2]])
        p1 = np.array([top[0] + width / 2, y, top[2]])
        pos, idx = cylinder(p0, p1, 0.022, 0.022, 8)
        parts.append((pos, idx, MAT_WOOD))
    return parts


def make_pointy_tree(base, height=1.55):
    """Trunk + pointed conical crown (spitzer Baum)."""
    base = np.asarray(base, float)
    trunk_h = height * 0.28
    crown_h = height * 0.78
    parts = []
    pos, idx = cylinder(base, base + np.array([0, trunk_h, 0]), 0.05, 0.04, 10)
    parts.append((pos, idx, MAT_TRUNK))
    # three stacked cones for a fir-like pointed silhouette
    levels = [
        (0.00, 0.42, 0.38),
        (0.28, 0.38, 0.28),
        (0.52, 0.30, 0.18),
    ]
    for y0, h, r in levels:
        b = base + np.array([0, trunk_h * 0.7 + crown_h * y0, 0])
        t = b + np.array([0, crown_h * h, 0])
        pos, idx = cone(b, t, r, 14)
        parts.append((pos, idx, MAT_GREEN))
    return parts


def get_pos(acc_i):
    acc = accessors[acc_i]
    bv = buffer_views[acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    n = acc["count"]
    return np.frombuffer(raw, dtype=np.float32, count=n * 3, offset=off).reshape(n, 3).copy()


# ---------------------------------------------------------------------------
# 1) Wurzeln → Leitern
# ---------------------------------------------------------------------------
inselhaus = nodes[154]
wurzel_ids = [i for i in inselhaus["children"] if nodes[i]["name"].startswith("Wurzel_")]
leiter_children = []
for wi in wurzel_ids:
    mesh = meshes[nodes[wi]["mesh"]]
    pos = get_pos(mesh["primitives"][0]["attributes"]["POSITION"])
    top = np.array(
        [
            (pos[:, 0].min() + pos[:, 0].max()) / 2,
            pos[:, 1].max() - 0.05,
            (pos[:, 2].min() + pos[:, 2].max()) / 2,
        ]
    )
    length = float(pos[:, 1].max() - pos[:, 1].min())
    length = max(2.8, min(4.6, length * 1.05))
    parts = make_ladder(top, length=length, width=0.48, rung_step=0.34)
    group_kids = []
    for pi, (p, ix, mat) in enumerate(parts):
        kind = "Holm" if mat == MAT_ROPE else "Sprosse"
        name = f"Leiter_{nodes[wi]['name'][-1]}_{kind}_{pi+1}"
        mi = append_mesh(name, p, ix, mat)
        group_kids.append(add_node(name, mi, "Insel", "Leiter"))
    # replace single wurzel child with ladder part nodes
    leiter_children.extend(group_kids)

inselhaus["children"] = [c for c in inselhaus["children"] if c not in wurzel_ids] + leiter_children

# ---------------------------------------------------------------------------
# 2) Lanzen → spitze Bäume auf Ausleger
# ---------------------------------------------------------------------------
ausleger = nodes[82]
lanze_ids = [
    i
    for i in ausleger["children"]
    if nodes[i]["name"].startswith("Lanze_")
]
# unique tree bases from shaft centers
shafts = [i for i in lanze_ids if "Schaft" in nodes[i]["name"]]
baum_kids = []
for si, shaft_i in enumerate(shafts, start=1):
    mesh = meshes[nodes[shaft_i]["mesh"]]
    pos = get_pos(mesh["primitives"][0]["attributes"]["POSITION"])
    base = np.array(
        [
            (pos[:, 0].min() + pos[:, 0].max()) / 2,
            pos[:, 1].min(),
            (pos[:, 2].min() + pos[:, 2].max()) / 2,
        ]
    )
    height = float(pos[:, 1].max() - pos[:, 1].min()) + 0.45
    for pi, (p, ix, mat) in enumerate(make_pointy_tree(base, height=height)):
        name = f"Baum_{si}_{'Stamm' if pi==0 else f'Krone_{pi}'}"
        mi = append_mesh(name, p, ix, mat)
        baum_kids.append(add_node(name, mi, "Ausleger_West", "Baum"))

ausleger["children"] = [c for c in ausleger["children"] if c not in lanze_ids] + baum_kids

# ---------------------------------------------------------------------------
# 3) Propeller größer + rot/weiß gestreift
# ---------------------------------------------------------------------------
prop = nodes[140]
old_prop_kids = list(prop["children"])

hub = np.array([0.0, 5.60, 3.70])  # centered on south facade
spin = np.array([0.0, 0.0, 1.0])
up = np.array([0.0, 1.0, 0.0])
right = np.array([1.0, 0.0, 0.0])
wall_anchor = np.array([0.0, 5.60, 2.78])
blade_len = 3.15  # ~6.3 m diameter ≈ Fassadenbreite

new_prop = []

pos, idx = cylinder(wall_anchor, hub + spin * 0.18, 0.14, 0.14, 22)
mi = append_mesh("Propeller_Welle", pos, idx, MAT_HUB)
new_prop.append(add_node("Propeller_Welle", mi, "Propeller", "Propeller"))

pos, idx = cylinder(hub - spin * 0.1, hub + spin * 0.28, 0.42, 0.42, 28)
mi = append_mesh("Propeller_Nabe", pos, idx, MAT_HUB)
new_prop.append(add_node("Propeller_Nabe", mi, "Propeller", "Propeller"))

pos, idx = cylinder(hub + spin * 0.28, hub + spin * 0.72, 0.28, 0.05, 24)
mi = append_mesh("Propeller_Spinner", pos, idx, MAT_HUB)
new_prop.append(add_node("Propeller_Spinner", mi, "Propeller", "Propeller"))

for i in range(4):
    ang = 2 * math.pi * i / 4 + math.radians(8)
    tip_dir = math.cos(ang) * right + math.sin(ang) * up
    for si, (p, ix, mat) in enumerate(
        blade_striped(hub, spin, tip_dir, blade_len, 0.78, 0.09, stripes=10)
    ):
        name = f"Propeller_Blatt_{i+1}_Streifen_{si+1}"
        mi = append_mesh(name, p, ix, mat)
        new_prop.append(add_node(name, mi, "Propeller", "Propeller"))

for name, xoff in (("Propeller_Halter_links", -0.7), ("Propeller_Halter_rechts", 0.7)):
    c = np.array([xoff, 5.60, 2.95])
    pos, idx = box(c, (0.4, 0.2, 0.5), right, up)
    mi = append_mesh(name, pos, idx, MAT_WOOD)
    new_prop.append(add_node(name, mi, "Propeller", "Propeller"))

pos, idx = cylinder(np.array([0.0, 5.60, 2.55]), wall_anchor, 0.26, 0.16, 18)
mi = append_mesh("Propeller_Lager", pos, idx, MAT_HUB)
new_prop.append(add_node("Propeller_Lager", mi, "Propeller", "Propeller"))

prop["children"] = new_prop
prop["name"] = "Propeller"
prop["extras"] = {"semantik": "Propeller"}
prop.pop("translation", None)

# write
b64 = base64.b64encode(bytes(raw)).decode("ascii")
data["buffers"][0]["uri"] = "data:application/octet-stream;base64," + b64
data["buffers"][0]["byteLength"] = len(raw)
PATH.write_text(json.dumps(data, separators=(",", ":")))

print(f"Wrote {PATH} ({PATH.stat().st_size} bytes)")
print(f"Leitern parts: {len(leiter_children)} (replaced {len(wurzel_ids)} Wurzeln)")
print(f"Bäume parts: {len(baum_kids)} (replaced {len(lanze_ids)} Lanzen)")
print(f"Propeller parts: {len(new_prop)} (old {len(old_prop_kids)} detached)")
print(f"Hub at {hub.tolist()}, blade_len={blade_len} → diameter≈{blade_len*2:.2f}m")
