/**
 * Steampunk-Schiff — Three.js Geometrie
 * Maße 1:1 aus dem GDL Master-Script (Figur ≈ 1,70 m).
 * GDL: +X Bug, +Y Backbord, +Z oben  →  Three: +X Bug, +Y oben, +Z Steuerbord
 */
import * as THREE from "three";

export const DIM = {
  A: 4.2,
  B: 2.4,
  ZZYZX: 3.2,
};

DIM.hullLen = DIM.A * 0.92;
DIM.hullRad = DIM.B * 0.48;
DIM.hullDepth = DIM.ZZYZX * 0.42;
DIM.cabinW = DIM.B * 0.42;
DIM.cabinL = DIM.A * 0.28;
DIM.cabinH = DIM.ZZYZX * 0.22;
DIM.cabinX = -DIM.A * 0.05;
DIM.mastH = DIM.ZZYZX * 0.72;
DIM.mastX = DIM.A * 0.28;
DIM.megaLen = DIM.A * 0.12;
DIM.megaX = DIM.A * 0.46;
DIM.finH = DIM.hullDepth * 0.35;
DIM.finL = DIM.A * 0.12;

const COL = {
  ink: 0x5a6570,
  plate: 0x8a939a,
  cabin: 0x6e7a82,
  glass: 0x9eb8c6,
  detail: 0x4f5b66,
  flag: 0x3f6a80,
  figure: 0x7a848c,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.28,
    flatShading: false,
    ...opts,
  });
}

function edge(mesh, color = COL.ink) {
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 28),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  mesh.add(e);
  return mesh;
}

function cyl(h, r, color = COL.detail) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat(color));
  return edge(m);
}

function sphere(r, color = COL.detail) {
  return edge(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color)));
}

function box(w, h, d, color = COL.plate) {
  return edge(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)));
}

function cone(h, r1, r2, color = COL.detail) {
  return edge(
    new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, h, 20), mat(color))
  );
}

/** Lathe-Schüssel: Profil wie GDL REVOLVE */
function makeHull() {
  const g = new THREE.Group();
  const { hullRad: R, hullDepth: D, hullLen: L } = DIM;

  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(R * 0.15, 0),
    new THREE.Vector2(R * 0.55, -D * 0.35),
    new THREE.Vector2(R * 0.95, -D * 0.7),
    new THREE.Vector2(R * 1.0, -D * 0.92),
    new THREE.Vector2(R * 0.7, -D * 1.0),
    new THREE.Vector2(0, -D * 1.0),
  ];
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.scale(L / (2 * R), 1, 1);
  const hull = new THREE.Mesh(geo, mat(COL.ink, { metalness: 0.45, roughness: 0.55 }));
  edge(hull);
  g.add(hull);

  const deck = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat(COL.plate, { metalness: 0.4 })
  );
  deck.scale.set(L * 0.48, 0.04, R * 0.98);
  deck.position.y = -0.01;
  edge(deck);
  g.add(deck);

  return g;
}

function plate(w, h, d = 0.025) {
  return box(w, h, d, COL.plate);
}

function makeArmor() {
  const g = new THREE.Group();
  const { hullRad: R, hullDepth: D, A } = DIM;

  for (const side of [-1, 1]) {
    // Platte 15
    const p15 = plate(0.6, 0.48, 0.025);
    p15.position.set(A * 0.18, -D * 0.18, side * R * 0.72);
    p15.rotation.x = side * 0.14;
    p15.rotation.y = side * -0.21;
    g.add(p15);
    g.add(makeLabel("15", A * 0.18, -D * 0.1, side * (R * 0.72 + 0.04), side));

    // Platte 6
    const p6 = plate(0.74, 0.34, 0.022);
    p6.position.set(A * 0.02, -D * 0.48, side * R * 0.85);
    p6.rotation.x = side * 0.31;
    g.add(p6);
    g.add(makeLabel("6", A * 0.02, -D * 0.42, side * (R * 0.85 + 0.04), side));

    // Bugplatte
    const bow = plate(0.4, 0.26, 0.018);
    bow.position.set(A * 0.32, -D * 0.35, side * R * 0.55);
    bow.rotation.x = side * 0.44;
    bow.rotation.y = side * 0.35;
    g.add(bow);

    // Heckschild
    const aft = plate(0.48, 0.5, 0.02);
    aft.position.set(-A * 0.18, DIM.cabinH * 0.25, side * DIM.cabinW * 0.62);
    aft.rotation.x = side * 0.07;
    g.add(aft);
  }

  const belly = plate(0.9, 0.4, 0.02);
  belly.position.set(0, -D * 0.78, 0);
  belly.rotation.x = Math.PI / 2;
  g.add(belly);

  return g;
}

function makeLabel(text, x, y, z, side) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#1c2226";
  ctx.font = "bold 72px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true })
  );
  sprite.scale.set(0.28, 0.28, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

function makeFin() {
  const g = new THREE.Group();
  const { finH: H, finL: L, hullDepth: D } = DIM;
  const shape = new THREE.Shape();
  shape.moveTo(-L * 0.35, 0);
  shape.lineTo(L * 0.55, 0);
  shape.lineTo(L * 0.45, -H);
  shape.lineTo(-L * 0.25, -H);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  geo.translate(0, 0, -0.02);
  const fin = new THREE.Mesh(geo, mat(COL.detail));
  edge(fin);
  fin.position.y = -D - H * 0.15;
  g.add(fin);

  const hub = cyl(0.06, 0.05);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(L * 0.15, -D - H * 0.15 + H * 0.55, 0);
  g.add(hub);

  return g;
}

function makeSideFins() {
  const g = new THREE.Group();
  const { hullRad: R, hullDepth: D, A } = DIM;
  for (const side of [-1, 1]) {
    const f = box(0.4, 0.03, 0.28);
    f.position.set(A * 0.05, -D * 0.55, side * R * 0.95);
    f.rotation.x = side * -0.21;
    g.add(f);
  }
  return g;
}

function makeThrusters() {
  const g = new THREE.Group();
  const { hullRad: R, hullDepth: D, A } = DIM;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const t = cyl(0.1, 0.045);
      t.rotation.z = (55 * Math.PI) / 180;
      t.position.set(-A * 0.08 - i * 0.12, -D * 0.72, side * R * 0.35);
      g.add(t);
    }
    const port = box(0.12, 0.1, 0.04);
    port.position.set(A * 0.28, -D * 0.62, side * 0.18);
    port.rotation.z = 0.35;
    g.add(port);
  }
  return g;
}

function makeCabin() {
  const g = new THREE.Group();
  const { cabinL: L, cabinW: W, cabinH: H, cabinX: X } = DIM;

  const body = edge(
    new THREE.Mesh(
      new THREE.BoxGeometry(L, H, W),
      mat(COL.cabin, { metalness: 0.2, roughness: 0.65 })
    )
  );
  body.position.set(X, H / 2, 0);
  g.add(body);

  const roof = box(L + 0.08, 0.04, W + 0.08, COL.plate);
  roof.position.set(X, H + 0.02, 0);
  g.add(roof);

  const glassMat = mat(COL.glass, { metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.55 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.02, H * 0.45, W * 0.64), glassMat);
  front.position.set(X + L / 2 - 0.01, H * 0.45, 0);
  front.rotation.z = -0.08;
  g.add(front);

  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.22, H * 0.32, 0.015), glassMat);
    win.position.set(X + L * 0.05, H * 0.5, side * (W / 2 - 0.01));
    g.add(win);
  }

  const door = box(0.04, H * 0.85, 0.36, COL.cabin);
  door.position.set(X - L / 2 + 0.02, H * 0.45, 0);
  g.add(door);
  const doorWin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.16), glassMat);
  doorWin.position.set(X - L / 2 + 0.04, H * 0.65, 0);
  g.add(doorWin);

  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const slat = cyl(L * 0.35, 0.012, COL.plate);
      slat.rotation.z = Math.PI / 2;
      slat.position.set(X - L * 0.05, 0.08 + i * 0.07, side * (W / 2 + 0.01));
      g.add(slat);
    }
  }

  return g;
}

function makeRoofGear() {
  const g = new THREE.Group();
  const { cabinL: L, cabinH: H, cabinX: X } = DIM;
  const y0 = H + 0.04;

  const stalk = cyl(0.12, 0.025);
  stalk.position.set(X + L * 0.15, y0 + 0.06, 0);
  g.add(stalk);
  const head = cyl(0.16, 0.015);
  head.rotation.z = Math.PI / 2;
  head.position.set(X + L * 0.15, y0 + 0.14, 0);
  g.add(head);

  const chimney = cyl(0.28, 0.04, COL.ink);
  chimney.position.set(X - L * 0.2, y0 + 0.14, 0.12);
  g.add(chimney);
  const cap = cone(0.04, 0.04, 0.055, COL.ink);
  cap.position.set(X - L * 0.2, y0 + 0.3, 0.12);
  g.add(cap);

  for (let i = 0; i < 3; i++) {
    const ant = cyl(0.35 + i * 0.08, 0.008);
    ant.position.set(X - L * 0.05 + i * 0.08, y0 + 0.2 + i * 0.04, -0.15 + i * 0.05);
    g.add(ant);
  }
  return g;
}

function makeMast() {
  const g = new THREE.Group();
  const { mastH: H, mastX: X } = DIM;
  const rake = (-4 * Math.PI) / 180;

  const mast = new THREE.Group();
  mast.rotation.z = rake;

  const s1 = cyl(H * 0.55, 0.035);
  s1.position.y = H * 0.275;
  mast.add(s1);
  const s2 = cyl(H * 0.3, 0.025);
  s2.position.y = H * 0.55 + H * 0.15;
  mast.add(s2);
  const s3 = cyl(H * 0.15, 0.015);
  s3.position.y = H * 0.85 + H * 0.075;
  mast.add(s3);
  const ball = sphere(0.03);
  ball.position.y = H;
  mast.add(ball);

  // Wimpel
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(-0.55, 0.04);
  flagShape.lineTo(0, 0.1);
  flagShape.closePath();
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(flagShape),
    mat(COL.flag, { side: THREE.DoubleSide, metalness: 0, roughness: 0.55 })
  );
  flag.position.set(-0.02, H, 0);
  mast.add(flag);

  mast.position.x = X;
  g.add(mast);

  const whip = cyl(H * 0.4, 0.008);
  whip.position.set(X - 0.08, H * 0.2, 0.06);
  g.add(whip);

  // Stagen
  const stays = [
    [X, H * 0.75, 0, DIM.cabinX, DIM.cabinH + 0.05, 0],
    [X, H * 0.65, 0, DIM.A * 0.45, 0.15, 0],
    [X, H * 0.55, 0, -DIM.A * 0.35, 0.55, 0],
  ];
  for (const [x1, y1, z1, x2, y2, z2] of stays) {
    g.add(cable(x1, y1, z1, x2, y2, z2));
  }
  return g;
}

function cable(x1, y1, z1, x2, y2, z2) {
  const a = new THREE.Vector3(x1, y1, z1);
  const b = new THREE.Vector3(x2, y2, z2);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = cyl(len, 0.005, COL.ink);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

function makeMegaphone() {
  const g = new THREE.Group();
  const horn = cone(DIM.megaLen, 0.04, 0.16);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(DIM.megaX - DIM.megaLen / 2, 0.35, 0);
  g.add(horn);

  const base = cyl(0.12, 0.04);
  base.position.set(DIM.megaX - 0.08, 0.06, 0);
  g.add(base);

  for (const ang of [0.4, -0.4]) {
    const leg = cyl(0.25, 0.015);
    leg.position.set(DIM.megaX - 0.1, 0.2, 0);
    leg.rotation.z = ang;
    g.add(leg);
  }
  return g;
}

function makeRailings() {
  const g = new THREE.Group();
  const rH = 0.45;
  const rR = 0.012;

  for (const side of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const px = DIM.A * 0.22 + t * DIM.A * 0.22;
      const pz = side * (0.15 + t * DIM.hullRad * 0.55);
      const post = cyl(rH, rR);
      post.position.set(px, rH / 2, pz);
      g.add(post);
    }
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const px = -DIM.A * 0.18 - t * DIM.A * 0.22;
      const pz = side * (DIM.cabinW * 0.35 + t * 0.15);
      const post = cyl(rH * 0.9, rR);
      post.position.set(px, (rH * 0.9) / 2, pz);
      g.add(post);
    }
  }

  const cross = cyl(DIM.B * 0.35, rR);
  cross.rotation.x = Math.PI / 2;
  cross.position.set(-DIM.A * 0.4, rH * 0.9, 0);
  g.add(cross);

  return g;
}

function makeCanisters(x0, count, rows = 2) {
  const g = new THREE.Group();
  let n = 0;
  for (let row = 0; row < rows && n < count; row++) {
    for (let col = 0; col < 2 && n < count; col++, n++) {
      const tank = cyl(0.55, 0.055, COL.detail);
      tank.position.set(x0 + col * 0.1, 0.275, -0.22 + row * 0.18);
      g.add(tank);
      const cap = sphere(0.055);
      cap.position.set(x0 + col * 0.1, 0.55, -0.22 + row * 0.18);
      g.add(cap);
    }
  }
  return g;
}

function makeBowTanks() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const t = cyl(0.42, 0.045);
    t.position.set(DIM.A * 0.3 - i * 0.02, 0.21, -0.12 + i * 0.12);
    g.add(t);
    const cap = sphere(0.045);
    cap.position.set(DIM.A * 0.3 - i * 0.02, 0.42, -0.12 + i * 0.12);
    g.add(cap);
  }
  return g;
}

function makeAnchor() {
  const g = new THREE.Group();
  const rope = cyl(0.55, 0.008);
  rope.position.set(-DIM.A * 0.42, 0.55 - 0.275, 0.28);
  g.add(rope);

  const shank = cyl(0.18, 0.02);
  shank.position.set(-DIM.A * 0.42, 0.0, 0.28);
  g.add(shank);

  const stock = cyl(0.16, 0.015);
  stock.rotation.x = Math.PI / 2;
  stock.position.set(-DIM.A * 0.42, -0.02, 0.28);
  g.add(stock);

  for (const s of [-1, 1]) {
    const fluke = box(0.12, 0.02, 0.08);
    fluke.position.set(-DIM.A * 0.42 + s * 0.06, -0.08, 0.28);
    fluke.rotation.z = s * 0.6;
    g.add(fluke);
  }
  return g;
}

function makeSteering() {
  const g = new THREE.Group();
  const ped = cyl(0.55, 0.04);
  ped.position.set(DIM.A * 0.12, 0.275, 0);
  g.add(ped);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.012, 8, 24),
    mat(COL.detail)
  );
  rim.position.set(DIM.A * 0.12, 0.55, 0);
  rim.rotation.y = Math.PI / 2;
  edge(rim);
  g.add(rim);

  for (let a = 0; a < 180; a += 45) {
    const spoke = cyl(0.12, 0.008);
    spoke.position.set(DIM.A * 0.12, 0.55, 0);
    spoke.rotation.z = (a * Math.PI) / 180;
    spoke.rotation.y = Math.PI / 2;
    g.add(spoke);
  }
  return g;
}

function makeFigure() {
  const g = new THREE.Group();
  g.position.set(DIM.A * 0.22, 0, 0.08);

  for (const z of [-0.06, 0.06]) {
    const leg = cyl(0.75, 0.04, COL.figure);
    leg.position.set(0, 0.375, z);
    g.add(leg);
  }
  const torso = cyl(0.55, 0.1, COL.figure);
  torso.position.set(0, 1.025, 0);
  g.add(torso);

  const arm = cyl(0.35, 0.03, COL.figure);
  arm.position.set(0.05, 1.2, 0.12);
  arm.rotation.x = -0.7;
  g.add(arm);

  const head = sphere(0.11, COL.figure);
  head.position.set(0, 1.4, 0);
  g.add(head);
  const hood = sphere(0.13, COL.figure);
  hood.position.set(0, 1.48, 0);
  g.add(hood);

  return g;
}

function makeRivets() {
  const g = new THREE.Group();
  const { hullRad: R, hullDepth: D, A, hullLen: L } = DIM;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 6; i++) {
      const r = sphere(0.012, COL.detail);
      r.position.set(A * 0.08 + i * 0.07, -D * 0.05, side * R * 0.78);
      g.add(r);
    }
    for (let i = 0; i <= 5; i++) {
      const r = sphere(0.012, COL.detail);
      r.position.set(A * 0.05 + i * 0.08, -D * 0.4, side * R * 0.9);
      g.add(r);
    }
  }
  return g;
}

export function createShip({ detail = "Hoch" } = {}) {
  const root = new THREE.Group();
  root.name = "SteampunkSchiff";

  root.add(makeHull());
  root.add(makeArmor());
  root.add(makeFin());
  root.add(makeSideFins());
  root.add(makeThrusters());
  root.add(makeCabin());
  root.add(makeRoofGear());
  root.add(makeMast());
  root.add(makeMegaphone());
  root.add(makeRailings());
  root.add(makeCanisters(-DIM.A * 0.38, 4));
  root.add(makeBowTanks());
  root.add(makeAnchor());
  root.add(makeSteering());

  if (detail !== "Einfach") root.add(makeFigure());
  if (detail === "Hoch") root.add(makeRivets());

  // GDL Z-up already mapped to Y-up during construction
  return root;
}
