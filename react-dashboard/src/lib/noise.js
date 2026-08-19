// Lightweight value-noise implementation (3D) so we can build a flow-field
// without external dependencies.

function fract(x) {
  return x - Math.floor(x)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

// Hash a 3D lattice point to [0, 1).
function hash3(ix, iy, iz, seed) {
  // A mix of large primes; Math.sin is fine here for aesthetic noise.
  const v =
    Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + seed * 0.1337) * 43758.5453123
  return fract(v)
}

// 3D value noise in [-1, 1].
export function noise3(x, y, z, seed = 0) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)

  const xf = x - x0
  const yf = y - y0
  const zf = z - z0

  const u = smoothstep(xf)
  const v = smoothstep(yf)
  const w = smoothstep(zf)

  const n000 = hash3(x0, y0, z0, seed)
  const n100 = hash3(x0 + 1, y0, z0, seed)
  const n010 = hash3(x0, y0 + 1, z0, seed)
  const n110 = hash3(x0 + 1, y0 + 1, z0, seed)
  const n001 = hash3(x0, y0, z0 + 1, seed)
  const n101 = hash3(x0 + 1, y0, z0 + 1, seed)
  const n011 = hash3(x0, y0 + 1, z0 + 1, seed)
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed)

  const x00 = lerp(n000, n100, u)
  const x10 = lerp(n010, n110, u)
  const x01 = lerp(n001, n101, u)
  const x11 = lerp(n011, n111, u)

  const y0z0 = lerp(x00, x10, v)
  const y1z0 = lerp(x01, x11, v)

  // Map [0, 1] -> [-1, 1]
  return lerp(y0z0, y1z0, w) * 2 - 1
}

// Fractional Brownian Motion over noise3.
export function fbm3(
  x,
  y,
  z,
  seed = 0,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
) {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0

  for (let i = 0; i < octaves; i += 1) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 101.3)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }

  return sum / norm
}

