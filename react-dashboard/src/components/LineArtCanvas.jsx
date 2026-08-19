import { useEffect, useMemo, useRef } from 'react'
import { fbm3 } from '../lib/noise'

function mulberry32(a) {
  // Deterministic RNG for repeatable line art.
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export default function LineArtCanvas({
  params,
  seed,
  paused,
  regenId,
  clearSignal,
  downloadSignal,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  const rafRef = useRef(0)
  const startedAtRef = useRef(0)

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const ctxRef = useRef(null)

  const paramsRef = useRef(params)
  const particlesRef = useRef([])
  const reinitRef = useRef(true)

  useEffect(() => {
    paramsRef.current = params
  }, [params])

  const palette = useMemo(() => {
    const paper = '#ffffff'
    const night = '#0b0d10'
    const inkPaper = '#1c2226'
    const inkNight = '#e7e2da'
    return params.bgMode === 'night'
      ? { bg: night, ink: inkNight }
      : { bg: paper, ink: inkPaper }
  }, [params.bgMode])

  function resizeCanvas() {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return false

    const rect = container.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1))

    const prev = sizeRef.current
    const changed = prev.w !== w || prev.h !== h || prev.dpr !== dpr
    if (!changed) return true

    sizeRef.current = { w, h, dpr }
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return false

    ctxRef.current = ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'

    // When size changes we want fresh particle placement.
    reinitRef.current = true
    clearCanvasFully()
    return true
  }

  function clearCanvasFully() {
    const ctx = ctxRef.current
    const { w, h } = sizeRef.current
    if (!ctx || w <= 0 || h <= 0) return
    ctx.globalAlpha = 1
    ctx.fillStyle = palette.bg
    ctx.fillRect(0, 0, w, h)
  }

  function initParticles() {
    const { w, h } = sizeRef.current
    const count = paramsRef.current.particles
    if (w <= 0 || h <= 0) return

    const rng = mulberry32((seed ^ (regenId * 1_000_003)) >>> 0)

    const particles = new Array(count)
    for (let i = 0; i < count; i += 1) {
      particles[i] = {
        x: rng() * w,
        y: rng() * h,
      }
    }

    particlesRef.current = particles
  }

  function downloadPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    a.download = `lineart-seed-${seed}-regen-${regenId}-${ts}.png`
    a.href = dataUrl
    a.click()
  }

  // Resize observer
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      resizeCanvas()
      return
    }
    resizeCanvas()
    const ro = new ResizeObserver(() => resizeCanvas())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [palette.bg])

  // Re-initialize particles after regen/seed changes.
  useEffect(() => {
    reinitRef.current = true
  }, [regenId, seed])

  // Clear signal (full clear).
  useEffect(() => {
    clearCanvasFully()
  }, [clearSignal, palette.bg])

  // Download signal.
  useEffect(() => {
    downloadPng()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadSignal])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    startedAtRef.current = performance.now()

    const loop = () => {
      const ctx = ctxRef.current
      const { w, h } = sizeRef.current
      if (!ctx || w <= 0 || h <= 0) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      if (reinitRef.current) {
        reinitRef.current = false
        initParticles()
      }

      const p = paramsRef.current
      const iters = clamp(Math.round(p.quality), 1, 6)

      // Keep trails "alive" by blending a bit of background each frame.
      // trail=0 => full clear. trail ~ 1 => long persistence.
      const fade = clamp(1 - p.trail, 0.01, 1)
      if (!paused) {
        ctx.globalAlpha = fade
        ctx.fillStyle = palette.bg
        ctx.fillRect(0, 0, w, h)
      }

      // In paused mode we still keep the current frame as-is.
      if (paused) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      ctx.strokeStyle = palette.ink
      ctx.globalAlpha = clamp(p.inkAlpha, 0.01, 1)
      ctx.lineWidth = clamp(p.thickness, 0.1, 5)

      const particles = particlesRef.current

      const elapsedMs = performance.now() - startedAtRef.current
      const tCoord = elapsedMs * 0.001 * p.timeScale

      const step = p.speed / iters

      for (let sub = 0; sub < iters; sub += 1) {
        const t = tCoord + sub * 0.01

        ctx.beginPath()
        for (let i = 0; i < particles.length; i += 1) {
          const pt = particles[i]
          const ox = pt.x
          const oy = pt.y

          const nx = ox * p.flowScale
          const ny = oy * p.flowScale
          const n = fbm3(nx, ny, t, seed, p.octaves) * p.noiseStrength
          const angle = n * p.turns * Math.PI * 2

          let x = ox + Math.cos(angle) * step
          let y = oy + Math.sin(angle) * step

          let wrapped = false
          if (x < 0) {
            x += w
            wrapped = true
          } else if (x >= w) {
            x -= w
            wrapped = true
          }
          if (y < 0) {
            y += h
            wrapped = true
          } else if (y >= h) {
            y -= h
            wrapped = true
          }

          pt.x = x
          pt.y = y

          if (wrapped) continue

          ctx.moveTo(ox, oy)
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(rafRef.current)
  }, [palette.bg, paused])

  return (
    <div ref={containerRef} className="lineArtContainer">
      <canvas ref={canvasRef} className="lineArtCanvas" />
    </div>
  )
}

