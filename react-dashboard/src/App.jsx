import './App.css'

import { useMemo, useState } from 'react'
import LineArtCanvas from './components/LineArtCanvas'

export default function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))
  const [regenId, setRegenId] = useState(0)
  const [clearSignal, setClearSignal] = useState(0)
  const [downloadSignal, setDownloadSignal] = useState(0)
  const [paused, setPaused] = useState(false)

  const [params, setParams] = useState({
    particles: 1800,
    speed: 1.15,
    flowScale: 0.006,
    turns: 1.25,
    timeScale: 0.9,
    noiseStrength: 1.0,
    octaves: 4,
    thickness: 0.9,
    inkAlpha: 0.22,
    trail: 0.78,
    bgMode: 'paper', // paper | night
    quality: 2,
  })

  const bg = params.bgMode === 'night' ? '#0b0d10' : '#ffffff'

  const inkColor = useMemo(() => {
    return params.bgMode === 'night' ? '#e7e2da' : '#1c2226'
  }, [params.bgMode])

  function setParam(key, value) {
    setParams((p) => {
      const next = { ...p, [key]: value }
      return next
    })
    if (key === 'particles') setRegenId((id) => id + 1)
  }

  function regenerate({ reseed } = { reseed: false }) {
    if (reseed) setSeed(Math.floor(Math.random() * 1_000_000_000))
    setRegenId((id) => id + 1)
    setPaused(false)
  }

  return (
    <div className="dashRoot" style={{ background: bg }}>
      <header className="dashTopbar">
        <div className="dashTitle">
          <div className="kicker">Line-Art Dashboard</div>
          <div className="titleRow">
            <h1>Organische Linie</h1>
            <div className="seedPill">
              Seed: <code>{seed}</code>
            </div>
          </div>
          <p className="subtitle">
            Canvas + Flow-Field. Stell Regler ein, dann “Neu” drücken und
            entspannen.
          </p>
        </div>
        <div className="dashActions">
          <button
            className="btn"
            onClick={() => setPaused((v) => !v)}
            type="button"
          >
            {paused ? 'Play' : 'Pause'}
          </button>
          <button className="btn" onClick={() => regenerate()} type="button">
            Neu
          </button>
          <button
            className="btn"
            onClick={() => regenerate({ reseed: true })}
            type="button"
          >
            Neu (Seed)
          </button>
          <button
            className="btn"
            onClick={() => setClearSignal((x) => x + 1)}
            type="button"
          >
            Clear
          </button>
          <button
            className="btn primary"
            onClick={() => setDownloadSignal((x) => x + 1)}
            type="button"
          >
            PNG speichern
          </button>
        </div>
      </header>

      <main className="dashLayout">
        <aside className="controls">
          <div className="panel">
            <div className="panelTitle">Dichte / Bewegung</div>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Partikel</span>
                <span className="ctrlVal">{params.particles}</span>
              </div>
              <input
                type="range"
                min={300}
                max={4200}
                step={50}
                value={params.particles}
                onChange={(e) => setParam('particles', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Speed</span>
                <span className="ctrlVal">{params.speed.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3.0}
                step={0.01}
                value={params.speed}
                onChange={(e) => setParam('speed', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Flow-Scale</span>
                <span className="ctrlVal">{params.flowScale.toFixed(4)}</span>
              </div>
              <input
                type="range"
                min={0.002}
                max={0.02}
                step={0.0001}
                value={params.flowScale}
                onChange={(e) => setParam('flowScale', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Turns</span>
                <span className="ctrlVal">{params.turns.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3.5}
                step={0.01}
                value={params.turns}
                onChange={(e) => setParam('turns', Number(e.target.value))}
              />
            </label>
          </div>

          <div className="panel">
            <div className="panelTitle">Noise / Optik</div>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Time-Scale</span>
                <span className="ctrlVal">{params.timeScale.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.01}
                value={params.timeScale}
                onChange={(e) => setParam('timeScale', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Noise-Strength</span>
                <span className="ctrlVal">{params.noiseStrength.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={2.5}
                step={0.01}
                value={params.noiseStrength}
                onChange={(e) =>
                  setParam('noiseStrength', Number(e.target.value))
                }
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Octaves</span>
                <span className="ctrlVal">{params.octaves}</span>
              </div>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={params.octaves}
                onChange={(e) => setParam('octaves', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Qualität</span>
                <span className="ctrlVal">{params.quality}</span>
              </div>
              <input
                type="range"
                min={1}
                max={4}
                step={1}
                value={params.quality}
                onChange={(e) => setParam('quality', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Thickness</span>
                <span className="ctrlVal">{params.thickness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={2.5}
                step={0.01}
                value={params.thickness}
                onChange={(e) =>
                  setParam('thickness', Number(e.target.value))
                }
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Ink Alpha</span>
                <span className="ctrlVal">{params.inkAlpha.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.55}
                step={0.01}
                value={params.inkAlpha}
                onChange={(e) =>
                  setParam('inkAlpha', Number(e.target.value))
                }
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Trail</span>
                <span className="ctrlVal">{params.trail.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.0}
                max={0.98}
                step={0.01}
                value={params.trail}
                onChange={(e) => setParam('trail', Number(e.target.value))}
              />
            </label>

            <label className="ctrl">
              <div className="ctrlRow">
                <span>Modus</span>
                <span className="ctrlVal">{params.bgMode}</span>
              </div>
              <select
                className="select"
                value={params.bgMode}
                onChange={(e) => setParam('bgMode', e.target.value)}
              >
                <option value="paper">paper</option>
                <option value="night">night</option>
              </select>
            </label>
          </div>

          <div className="panel panelHint">
            <div className="panelTitle">Tipp</div>
            <p className="hintText">
              Für “fineliner”-Feeling: <strong>Trail ~ 0.7–0.9</strong>, Ink
              Alpha moderat, und Speed nicht zu hoch. Danach “Neu” zum
              Wiederholen.
            </p>
            <div className="inkPreview">
              Ink: <span className="inkDot" style={{ background: inkColor }} />{' '}
              <span className="muted">{inkColor}</span>
            </div>
          </div>
        </aside>

        <section className="canvasArea">
          <LineArtCanvas
            params={params}
            seed={seed}
            paused={paused}
            regenId={regenId}
            clearSignal={clearSignal}
            downloadSignal={downloadSignal}
          />
        </section>
      </main>
    </div>
  )
}
