#!/usr/bin/env python3
"""Replace Rakete group in Inselhaus glTF with a large facade propeller."""
from __future__ import annotations

import base64
import json
import math
from pathlib import Path

import numpy as np

SRC = Path("/tmp/inselhaus/inselhaus.json")
OUT = Path("/agent/repos/art/gdl/fliegendes-inselhaus/inselhaus.json")

data = json.loads(SRC.read_text())
nodes = data["nodes"]
meshes = data["meshes"]
accessors = data["accessors"]
buffer_views = data["bufferViews"]
materials = data["materials"]
raw = bytearray(base64.b64decode(data["buffers"][0]["uri"].split(",", 1)[1]))

mat_id = 0
for i, m in enumerate(materials):
    name = (m.get("name") or "").lower()
    if "metall" in name or "metal" in name:
        mat_id = i
        break


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


def append_mesh(name: str, positions: np.ndarray, indices: np.ndarray, material: int) -> int:
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


def cylinder(p0, p1, r0, r1=None, segments=22):
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
    pos = []
    idx = []
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


def blade(hub, spin_axis, tip_dir, length, width, thickness):
    hub = np.asarray(hub, float)
    spin_axis = np.asarray(spin_axis, float)
    spin_axis /= np.linalg.norm(spin_axis)
    tip_dir = np.asarray(tip_dir, float)
    tip_dir /= np.linalg.norm(tip_dir)
    side = np.cross(spin_axis, tip_dir)
    side /= np.linalg.norm(side)
    root = hub + tip_dir * (length * 0.10)
    tip = hub + tip_dir * length
    stations = []
    widths = [width * 0.32, width * 0.58, width * 0.42, width * 0.16]
    ts = [0.0, 0.4, 0.75, 1.0]
    pts = [root, root + (tip - root) * 0.4, root + (tip - root) * 0.75, tip]
    for t, pt, hw in zip(ts, pts, widths):
        pitch = math.radians(28 - 12 * t)
        c, s = math.cos(pitch), math.sin(pitch)
        sd = c * side + s * spin_axis
        od = -s * side + c * spin_axis
        ht = thickness * 0.5
        stations.append(
            [
                pt - sd * hw - od * ht,
                pt + sd * hw - od * ht,
                pt + sd * hw + od * ht,
                pt - sd * hw + od * ht,
            ]
        )
    pos = []
    for st in stations:
        pos.extend(st)
    pos = np.array(pos, np.float32)
    idx = []
    for i in range(len(stations) - 1):
        a = i * 4
        b = (i + 1) * 4
        for j in range(4):
            j2 = (j + 1) % 4
            idx += [a + j, a + j2, b + j, a + j2, b + j2, b + j]
    t0 = (len(stations) - 1) * 4
    idx += [t0, t0 + 1, t0 + 2, t0, t0 + 2, t0 + 3, 0, 2, 1, 0, 3, 2]
    return pos, np.array(idx, np.uint32)


def box(center, axes_sizes, ax, ay):
    c = np.asarray(center, float)
    ax = np.asarray(ax, float)
    ax /= np.linalg.norm(ax)
    ay = np.asarray(ay, float)
    ay = ay - ax * np.dot(ay, ax)
    ay /= np.linalg.norm(ay)
    az = np.cross(ax, ay)
    hx, hy, hz = [s / 2 for s in axes_sizes]
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


def torus(center, normal, R, r, su=24, sv=10):
    center = np.asarray(center, float)
    normal = np.asarray(normal, float)
    normal /= np.linalg.norm(normal)
    tmp = np.array([1.0, 0.0, 0.0]) if abs(normal[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(normal, tmp)
    u /= np.linalg.norm(u)
    v = np.cross(normal, u)
    pos = []
    idx = []
    for i in range(su):
        a0 = 2 * math.pi * i / su
        a1 = 2 * math.pi * (i + 1) / su
        for j in range(sv):
            b0 = 2 * math.pi * j / sv
            b1 = 2 * math.pi * (j + 1) / sv

            def pt(a, b):
                radial = math.cos(a) * u + math.sin(a) * v
                return center + radial * R + (math.cos(b) * radial + math.sin(b) * normal) * r

            b = len(pos)
            pos += [pt(a0, b0), pt(a1, b0), pt(a0, b1), pt(a1, b1)]
            idx += [b, b + 1, b + 2, b + 1, b + 3, b + 2]
    return np.array(pos, np.float32), np.array(idx, np.uint32)


# Large frontal propeller on south facade (former rocket location)
hub = np.array([-0.85, 6.70, 3.55])
spin = np.array([0.0, 0.0, 1.0])
up = np.array([0.0, 1.0, 0.0])
right = np.array([1.0, 0.0, 0.0])
wall_anchor = np.array([-0.85, 6.70, 2.78])

parts = []
pos, idx = cylinder(wall_anchor, hub + spin * 0.15, 0.12, 0.12, 20)
parts.append(("Propeller_Welle", pos, idx))

pos, idx = cylinder(hub - spin * 0.08, hub + spin * 0.22, 0.32, 0.32, 28)
parts.append(("Propeller_Nabe", pos, idx))

pos, idx = cylinder(hub + spin * 0.22, hub + spin * 0.55, 0.22, 0.05, 24)
parts.append(("Propeller_Spinner", pos, idx))

blade_len = 2.45
for i in range(4):
    ang = 2 * math.pi * i / 4 + math.radians(10)
    tip_dir = math.cos(ang) * right + math.sin(ang) * up
    pos, idx = blade(hub, spin, tip_dir, blade_len, 0.62, 0.08)
    parts.append((f"Propeller_Blatt_{i+1}", pos, idx))

for name, xoff in (("Propeller_Halter_links", -0.55), ("Propeller_Halter_rechts", 0.55)):
    c = np.array([-0.85 + xoff, 6.70, 2.92])
    pos, idx = box(c, (0.35, 0.18, 0.45), right, up)
    parts.append((name, pos, idx))

pos, idx = torus(np.array([-0.85, 6.70, 2.82]), spin, 0.38, 0.05)
parts.append(("Propeller_Ring", pos, idx))

pos, idx = cylinder(np.array([-0.85, 6.70, 2.55]), wall_anchor, 0.22, 0.14, 18)
parts.append(("Propeller_Lager", pos, idx))

new_children = []
for name, pos, idx in parts:
    mi = append_mesh(name, pos, idx, mat_id)
    ni = len(nodes)
    nodes.append(
        {"name": name, "mesh": mi, "extras": {"semantik": "Propeller", "bauteil": "Propeller"}}
    )
    new_children.append(ni)

old = list(nodes[140]["children"])
nodes[140]["name"] = "Propeller"
nodes[140]["extras"] = {"semantik": "Propeller"}
nodes[140]["children"] = new_children
nodes[140].pop("translation", None)

# Also ensure Turm extras don't still say Rakete anywhere in UI mapping
# Fix index.html separately.

b64 = base64.b64encode(bytes(raw)).decode("ascii")
data["buffers"][0]["uri"] = "data:application/octet-stream;base64," + b64
data["buffers"][0]["byteLength"] = len(raw)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, separators=(",", ":")))
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
print("Propeller parts:", [p[0] for p in parts])
print("Detached old rocket children:", old)
