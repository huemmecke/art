(function () {
  "use strict";

  const sim = window.HeizungSim.createSim({});
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const cycleCanvas = $("#cycle-canvas");
  const cycleCtx = cycleCanvas.getContext("2d");

  const brandSelect = $("#burner-brand");
  for (const [id, b] of Object.entries(window.HeizungSim.BRANDS)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = b.name;
    brandSelect.appendChild(opt);
  }
  brandSelect.value = "viessmann";

  let lastBurnerMode = null;
  let taktFlashTimer = 0;
  let activeScenarioId = "taktend";

  const SCENARIOS = {
    taktend: {
      title: "Takten provozieren",
      lead: "Kleine Heizlast trifft auf die Mindestleistung der Therme — sie kann nicht weiter drosseln und taktet.",
      what:
        "Außen relativ mild, Räume fast am Soll: der Wärmeabfluss ist kleiner als die kleinste sinnvolle Brennerleistung (Pmin). Die Therme fährt kurz an, das Kesselwasser läuft ins Hysterese-Band, dann sperrt sie wieder.",
      links: [
        "Heizlast < Pmin → überschüssige Energie bleibt im kleinen Kesselwasser (~7 L).",
        "Enges Hysterese-Band → Einschalt- und Ausschaltpunkt liegen nah beieinander → kurze Zyklen.",
        "Viele Starts/h belasten Zündung und Wärmetauscher — deshalb Band vergrößern, Kurve absenken oder Speichervolumen nutzen.",
      ],
      watch:
        "Brenner-Chip und Zyklusprotokoll: orange/gelb Balken sollten eng hintereinander liegen. Vergleiche Prognose Starts/h mit dem gemessenen Wert.",
    },
    "kalt-lang": {
      title: "Langer Strang kalt",
      lead: "Viel Rohrvolumen und hoher Widerstand — der entfernte Raum bekommt Wärme später und mit mehr Verlust.",
      what:
        "Schlechter Abgleich, dünnere Rohre und langer Weg: der Massenstrom zum Schlafzimmer bricht ein. VL kühlt unterwegs ab, ΔT und Leistung am Heizkörper sinken, Ist bleibt unter Soll.",
      links: [
        "Länge × Widerstand → weniger Liter/h am entfernten Strang.",
        "Rohrvolumen speichert Wärme unterwegs — kurze Stränge reagieren schneller.",
        "Wohnzimmer (kurz) kann „stehlen“, wenn Ventile dort weit offen sind.",
      ],
      watch:
        "Vergleiche Durchfluss und ΔT von Wohnzimmer vs. Schlafzimmer. Der lange Strang sollte kühleren RL und weniger L/h zeigen.",
    },
    abgleich: {
      title: "Abgleich retten",
      lead: "Ventile und Widerstände so setzen, dass jeder Strang seinen fairen Anteil am Volumenstrom bekommt.",
      what:
        "Mit hohem Abgleichwert werden kurze Stränge gedrosselt und lange freigegeben. Die Pumpe verteilt den Förderstrom nach den eingestellten Widerständen — nicht nach „wer zuerst kommt“.",
      links: [
        "Abgleich ≠ Thermostat: Thermostat regelt Raumtemperatur, Abgleich setzt den Basis-Durchfluss.",
        "Ohne Abgleich: kurze, dicke Wege bekommen zu viel, lange zu wenig.",
        "Ziel: alle Räume erreichen Soll bei ähnlicher Spreizung, ohne dass einer überversorgt wird.",
      ],
      watch:
        "Stell den Abgleich-Schieber und beobachte, wie sich L/h und Ist-Temperaturen angleichen.",
    },
    fussboden: {
      title: "Fußbodenheizung",
      lead: "Große Fläche, niedrige Vorlauftemperatur — die Heizkurve liegt flach, die Spreizung ist klein.",
      what:
        "FBH braucht viel mildes Wasser statt wenig heißes. Steigung und Parallelverschiebung der Kurve sind abgesenkt; die Heizkörperkennlinie (n ≈ 1,1) reagiert weicher auf ΔTm.",
      links: [
        "Niedrige VL → weniger Verluste in den Rohren, aber Trägheit der Estrichmasse.",
        "Kleine Spreizung (oft 5–8 K) bei hohem Massenstrom.",
        "Mischung mit Radiatoren: Bad oft weiterhin höherer VL-Bedarf.",
      ],
      watch:
        "VL-Temperatur und ΔT bleiben moderat. Räume brauchen länger, bis Ist den Soll erreicht — das ist physikalisch erwartet.",
    },
    reset: {
      title: "Standardanlage",
      lead: "Ausgeglichener Startpunkt: typische Radiatoren, mittlere Kurve, offener Abgleich als Lernbasis.",
      what:
        "Drei Räume mit unterschiedlichen Stranglängen. Du siehst den Grundkreislauf Therme → Pumpe → VL → HK → RL und kannst von hier gezielt Störungen einbauen.",
      links: [
        "Kesselwasser ist nur ~7 L — die Trägheit steckt vor allem in Rohren und Räumen.",
        "Modulieren heißt: Flamme an, aber Gasanteil unter 100 %.",
        "Jedes Szenario ändert genau die Hebel, die in der Praxis den Fehler verursachen.",
      ],
      watch:
        "Nutze Bedienen/Revision, um einzelne Hebel zu drehen, und lies parallel die Live-Hinweise.",
    },
  };

  function showScenario(id) {
    const meta = SCENARIOS[id] || SCENARIOS.reset;
    activeScenarioId = id in SCENARIOS ? id : "reset";
    const title = $("#scenario-title");
    const lead = $("#scenario-lead");
    const what = $("#scenario-what");
    const watch = $("#scenario-watch");
    const links = $("#scenario-links");
    if (title) title.textContent = meta.title;
    if (lead) lead.textContent = meta.lead;
    if (what) what.textContent = meta.what;
    if (watch) watch.textContent = meta.watch;
    if (links) {
      links.innerHTML = meta.links.map((t) => `<li>${t}</li>`).join("");
    }
    $$(".scenario-pick").forEach((btn) => {
      const on = btn.dataset.scenario === activeScenarioId;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });
  }

  // Heizkörper-Typen in jede Raum-Select füllen
  $$(".room-ctrl .rad-type").forEach((sel) => {
    sel.innerHTML = "";
    for (const [id, t] of Object.entries(window.HeizungSim.RADIATOR_TYPES)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    }
  });

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function spectrumColor(t, lo = 20, hi = 75) {
    const x = clamp((t - lo) / (hi - lo), 0, 1);
    const stops = [
      [0.0, [59, 28, 140]],
      [0.18, [29, 78, 216]],
      [0.36, [6, 182, 212]],
      [0.52, [34, 197, 94]],
      [0.7, [234, 179, 8]],
      [0.85, [249, 115, 22]],
      [1.0, [239, 68, 68]],
    ];
    let i = 0;
    while (i < stops.length - 2 && x > stops[i + 1][0]) i += 1;
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    const u = (x - x0) / Math.max(x1 - x0, 1e-6);
    return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * u)},${Math.round(c0[1] + (c1[1] - c0[1]) * u)},${Math.round(c0[2] + (c1[2] - c0[2]) * u)})`;
  }

  function roomBlocks(roomId) {
    return $$(`.room-ctrl[data-room="${roomId}"]`);
  }

  function readRoom(roomId) {
    // Revisions-Modal hat die vollen Parameter; Hauptbedienung nur Thermostat
    const hatch =
      $(`#modal-revision .room-ctrl[data-room="${roomId}"]`) ||
      $(`.room-ctrl[data-room="${roomId}"]`);
    const main = $(`.main-ops .room-ctrl[data-room="${roomId}"]`);
    const tSetEl = (main && $(".tset", main)) || (hatch && $(".tset", hatch));
    const num = (el, fallback) => (el && el.value !== "" ? Number(el.value) : fallback);
    return {
      tSet: num(tSetEl, 20),
      loadW: num(hatch && $(".load", hatch), 1000),
      radType: (hatch && $(".rad-type", hatch)?.value) || "panel22",
      qn: num(hatch && $(".qn", hatch), 1200),
      n: num(hatch && $(".nexp", hatch), 1.3),
    };
  }

  function refreshRoomLabels() {
    $$(".room-ctrl").forEach((block) => {
      const tset = $(".tset", block);
      const load = $(".load", block);
      const qn = $(".qn", block);
      const nexp = $(".nexp", block);
      if (tset && $(".tset-val", block)) $(".tset-val", block).textContent = `${Number(tset.value)} °C`;
      if (load && $(".load-val", block)) $(".load-val", block).textContent = `${Number(load.value)} W`;
      if (qn && $(".qn-val", block)) $(".qn-val", block).textContent = `${Number(qn.value)} W`;
      if (nexp && $(".nexp-val", block)) $(".nexp-val", block).textContent = Number(nexp.value).toFixed(2);
    });
  }

  function syncThermostats(fromEl) {
    const block = fromEl.closest(".room-ctrl");
    if (!block) return;
    const roomId = block.dataset.room;
    const val = fromEl.value;
    roomBlocks(roomId).forEach((b) => {
      const t = $(".tset", b);
      if (t && t !== fromEl) t.value = val;
    });
  }

  function inputNum(id, fallback) {
    const el = $(id);
    if (!el || el.value === "") return fallback;
    const n = Number(el.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function readControlsIntoSim() {
    const st = sim.getState();
    sim.setControls({
      brandId: brandSelect?.value || st.brandId,
      hystOverride: inputNum("#hysteresis", st.hystOverride ?? 2),
      burnerPowerKw: inputNum("#burner-power", st.burnerPowerKw),
      outdoor: inputNum("#outdoor", st.outdoor),
      slope: inputNum("#slope", st.slope),
      shift: inputNum("#shift", st.shift),
      diameterMm: inputNum("#diameter", st.diameterMm),
      lengthMul: inputNum("#length", st.lengthMul),
      balance: inputNum("#balance", st.balance),
      pumpHeadM: inputNum("#pump-head", st.pumpHeadM),
      rooms: {
        living: readRoom("living"),
        bath: readRoom("bath"),
        bed: readRoom("bed"),
      },
    });
  }

  function pushControlsFromSim() {
    const st = sim.getState();
    const b = window.HeizungSim.BRANDS[st.brandId];
    brandSelect.value = st.brandId;
    $("#hysteresis").value = String(st.hystOverride != null ? st.hystOverride : b.hysteresis);
    $("#burner-power").value = String(st.burnerPowerKw);
    $("#outdoor").value = String(st.outdoor);
    $("#slope").value = String(st.slope);
    $("#shift").value = String(st.shift);
    $("#diameter").value = String(st.diameterMm);
    $("#length").value = String(st.lengthMul);
    $("#balance").value = String(st.balance);
    $("#pump-head").value = String(st.pumpHeadM);
    for (const id of ["living", "bath", "bed"]) {
      const r = st.rooms[id];
      roomBlocks(id).forEach((block) => {
        const tset = $(".tset", block);
        if (tset) tset.value = String(r.tSet);
        const load = $(".load", block);
        if (load) load.value = String(r.loadW);
        const qn = $(".qn", block);
        if (qn) qn.value = String(r.qn);
        const nexp = $(".nexp", block);
        if (nexp) nexp.value = String(r.n);
        const type = $(".rad-type", block);
        if (type) type.value = r.radType;
      });
    }
    refreshRoomLabels();
    $("#brand-hint").textContent = b.hint;
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function syncLabelsFromState(s) {
    setText("#val-power", `${s.burnerPowerKw} kW`);
    setText("#val-outdoor", `${s.outdoor} °C`);
    setText("#val-slope", s.slope.toFixed(1));
    setText("#val-shift", `${s.shift > 0 ? "+" : ""}${s.shift} K`);
    setText("#val-diameter", `${s.diameterMm} mm`);
    setText("#val-length", `${s.lengthMul.toFixed(1)}×`);
    setText("#val-pump", `${Number(s.pumpHeadM || 0).toFixed(1)} mWS`);
    const bal = s.balance;
    setText(
      "#val-balance",
      bal < 35 ? `${bal}% offen (schlecht)` : bal < 75 ? `${bal}% teilweise` : `${bal}% ausgeglichen`
    );
    setText("#val-hyst", `${s.hysteresis.toFixed(1)} K`);
    setText("#hyst-readout", `Band ${s.onAt.toFixed(1)}–${s.offAt.toFixed(1)} °C`);
    setText("#brand-hint", s.brand.hint);
    const badge = $("#physics-badge");
    if (badge) {
      badge.textContent = `${s.physicsNote} · Δp≈${((s.systemDeltaP || 0) / 1000).toFixed(1)} kPa`;
    }
  }

  function onRadTypeChange(sel) {
    const block = sel.closest(".room-ctrl");
    const type = window.HeizungSim.RADIATOR_TYPES[sel.value];
    if (!type || !block) return;
    const qn = $(".qn", block);
    const nexp = $(".nexp", block);
    if (qn) qn.value = String(type.defaultQn);
    if (nexp) nexp.value = String(type.n);
    refreshRoomLabels();
    readControlsIntoSim();
  }

  function bindControls() {
    [
      "burner-power",
      "hysteresis",
      "outdoor",
      "slope",
      "shift",
      "diameter",
      "length",
      "balance",
      "pump-head",
    ].forEach((id) => {
      $(`#${id}`).addEventListener("input", () => {
        readControlsIntoSim();
        refreshRoomLabels();
      });
    });

    brandSelect.addEventListener("change", () => {
      const b = window.HeizungSim.BRANDS[brandSelect.value];
      $("#hysteresis").value = String(b.hysteresis);
      readControlsIntoSim();
    });

    $$(".room-ctrl input").forEach((el) => {
      el.addEventListener("input", () => {
        if (el.classList.contains("tset")) syncThermostats(el);
        refreshRoomLabels();
        readControlsIntoSim();
      });
    });

    $$(".rad-type").forEach((sel) => {
      sel.addEventListener("change", () => onRadTypeChange(sel));
    });

    $$("[data-scenario]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.scenario;
        sim.applyScenario(id);
        showScenario(id);
        pushControlsFromSim();
        readControlsIntoSim();
      });
    });
  }

  function setGradStops(id, tTop, tBottom) {
    const grad = document.getElementById(id);
    if (!grad) return;
    const stops = grad.querySelectorAll("stop");
    if (stops[0]) stops[0].setAttribute("stop-color", spectrumColor(tTop));
    if (stops[1]) stops[1].setAttribute("stop-color", spectrumColor(tBottom));
  }

  function burnerPlain(s) {
    const pct = Math.round(s.burnerFrac * 100);
    if (s.burnerMode === "ZÜNDET") {
      return {
        state: "ZÜNDET",
        title: s.minPowerCycling ? "Brenner ZÜNDET — Takten" : "Brenner ZÜNDET",
        explain: s.minPowerCycling
          ? "Wiederzündung nach Sperre — typisches Takten unter Mindestleistung."
          : "Zündung läuft — gleich kommt die Flamme. Noch keine Nutzleistung.",
        short: "ZÜNDET",
        flame: "ZÜND",
      };
    }
    if (s.burnerMode === "BRENNT") {
      return {
        state: "BRENNT",
        title: "Brenner FEUERT — fast Vollast",
        explain: `Gasventil weitgehend offen (~${pct} %). Der kleine Kesselinhalt wird schnell heiß.`,
        short: "FEUERT",
        flame: "FEUERT",
      };
    }
    if (s.burnerMode === "MODULIERT") {
      if (s.minPowerCycling) {
        return {
          state: "MODULIERT",
          title: `Brenner auf Pmin (${pct} %) — taktet gleich`,
          explain: `Last ${s.lastLoadKw.toFixed(1)} kW < Mindestleistung ${s.lastMinKw.toFixed(1)} kW. Die Vitodens kann nicht weiter drosseln → Kessel läuft zum Ausschaltpunkt und schaltet ab (Takten).`,
          short: "Pmin · taktet",
          flame: "Pmin→AUS",
        };
      }
      return {
        state: "MODULIERT",
        title: "Brenner FEUERT — moduliert (gedrosselt)",
        explain: `„Moduliert“ heißt: Flamme ist an, aber nur mit ${pct} % Gasleistung — nicht Vollast. So hält er die Solltemperatur, ohne ständig aus/an zu schalten.`,
        short: "FEUERT · moduliert",
        flame: `${pct}%`,
      };
    }
    return {
      state: "AUS",
      title: s.minPowerCycling ? "Brenner AUS — taktet" : "Brenner AUS",
      explain: s.minPowerCycling
        ? `Kein Gas. Warte auf Einschaltpunkt ${s.onAt.toFixed(1)} °C — dann wieder Zündung. Das ist Takten unter Pmin.`
        : "Kein Gas, keine Flamme. Warte auf Unterschreiten der Einschaltschwelle (Hysterese).",
      short: s.minPowerCycling ? "AUS · Takten" : "AUS",
      flame: "AUS",
    };
  }

  function fmtSimSpan(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "—";
    if (sec < 90) return `${Math.round(sec)} s Sim`;
    if (sec < 3600) return `${(sec / 60).toFixed(1)} min Sim`;
    return `${(sec / 3600).toFixed(1)} h Sim`;
  }

  function drawCycles(s) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = cycleCanvas.clientWidth || 900;
    const cssH = 100;
    if (cycleCanvas.width !== Math.floor(cssW * dpr) || cycleCanvas.height !== Math.floor(cssH * dpr)) {
      cycleCanvas.width = Math.floor(cssW * dpr);
      cycleCanvas.height = Math.floor(cssH * dpr);
    }
    const ctx = cycleCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const tNow = s.simTime;
    const log = s.cycleLog || [];
    const marks = s.cycleMarks || [];
    // Gesamtes behaltenes Protokoll zeigen (nicht nur 15 Min), damit Hyst-Wechsel sichtbar bleibt
    const earliestLog = log.length ? log[0].t : tNow;
    const earliestMark = marks.length ? marks[0].t : tNow;
    const earliest = Math.min(earliestLog, earliestMark);
    const t0 = Math.max(0, Math.min(earliest, tNow - 60));
    const windowSec = Math.max(tNow - t0, 60);
    const plotLeft = 36;
    const plotW = cssW - 40;
    const baseY = cssH * 0.82;
    const xAt = (t) => plotLeft + ((t - t0) / windowSec) * plotW;

    ctx.fillStyle = "#0a1016";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = "rgba(143,163,181,0.55)";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.fillText("100%", 4, 14);
    ctx.fillText("0%", 4, baseY - 2);

    ctx.strokeStyle = "rgba(143,163,181,0.12)";
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const x = (i / 6) * cssW;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
    }
    ctx.moveTo(plotLeft, baseY);
    ctx.lineTo(cssW, baseY);
    ctx.stroke();

    const events = log.length
      ? log.slice()
      : [{ t: t0, tEnd: tNow, mode: "off", on: false, power: 0 }];
    let firePhases = 0;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const mode = ev.mode || (ev.on ? "on" : "off");
      const tStart = Math.max(ev.t, t0);
      const tEndRaw = i + 1 < events.length ? events[i + 1].t : Math.max(ev.tEnd || tNow, tNow);
      const tEnd = Math.min(tEndRaw, tNow);
      if (tEnd <= t0) continue;
      const x1 = xAt(tStart);
      const x2 = xAt(tEnd);
      const w = Math.max(x2 - x1, 2);

      if (mode === "on") {
        if (i === 0 || !(events[i - 1].mode === "on" || events[i - 1].on)) firePhases += 1;
        const power = clamp(ev.power || 0.2, 0.05, 1);
        const h = 8 + power * (baseY - 22);
        const y = baseY - h;
        const grad = ctx.createLinearGradient(0, y, 0, baseY);
        if (power > 0.9) {
          grad.addColorStop(0, "#ef4444");
          grad.addColorStop(1, "#f97316");
        } else {
          grad.addColorStop(0, "#f97316");
          grad.addColorStop(1, "#eab308");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x1, y, w, h);
      } else if (mode === "igniting") {
        ctx.fillStyle = "#f0b429";
        ctx.fillRect(x1, baseY - 10, w, 10);
      } else {
        ctx.fillStyle = "#5b6f82";
        ctx.fillRect(x1, baseY - 3, w, 3);
      }
    }

    // Marker (Hysterese / Szenario) — senkrechte Linie + Label
    for (const m of marks) {
      if (m.t < t0 || m.t > tNow) continue;
      const x = xAt(m.t);
      ctx.strokeStyle = m.kind === "hyst" ? "#7dd3fc" : "#c4b5fd";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.kind === "hyst" ? "#7dd3fc" : "#c4b5fd";
      ctx.font = "9px IBM Plex Mono, monospace";
      const label = m.label || m.kind;
      ctx.fillText(label, Math.min(x + 3, cssW - 70), 12);
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cssW - 3, 4);
    ctx.lineTo(cssW - 3, cssH - 4);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "11px Outfit, sans-serif";
    ctx.fillText("jetzt", cssW - 36, 26);

    const plain = burnerPlain(s);
    const last = log[log.length - 1];
    const lastMode = last?.mode || (last?.on ? "on" : "off") || "—";
    const match =
      (plain.state === "AUS" && lastMode === "off") ||
      (plain.state === "ZÜNDET" && lastMode === "igniting") ||
      ((plain.state === "MODULIERT" || plain.state === "BRENNT") && lastMode === "on");
    $("#cycle-caption").textContent = match
      ? `Jetzt ${plain.short} · ${firePhases} Feuerphasen · Fenster ${fmtSimSpan(windowSec)}`
      : `⚠ Jetzt ${plain.short} ≠ Log ${lastMode} · Fenster ${fmtSimSpan(windowSec)}`;

    const axis = document.querySelector(".cycle-axis");
    if (axis && axis.children.length >= 2) {
      axis.children[0].textContent = `← ${fmtSimSpan(windowSec)}`;
      axis.children[1].textContent = "jetzt →";
    }

    const metricsEl = $("#cycle-metrics");
    const d = s.diagnostics;
    if (metricsEl && d) {
      metricsEl.dataset.ok = d.ok ? "1" : "0";
      metricsEl.textContent = [
        `ok=${d.ok ? "ja" : "NEIN"}`,
        d.mismatches?.length ? `err=${d.mismatches.join(",")}` : null,
        `mode=${d.mode}/${d.modeLabel}`,
        `P=${(d.powerFrac * 100).toFixed(0)}%`,
        `T=${d.boilerT.toFixed(1)}`,
        `Band=${d.onAt.toFixed(1)}–${d.offAt.toFixed(1)} (${d.bandK.toFixed(1)}K)`,
        `Last=${d.loadKw.toFixed(2)}/Pmin=${d.minKw.toFixed(2)}`,
        `Starts/h=${d.startsHour}`,
        `Log=${d.logLen} über ${fmtSimSpan(d.logSpanSec || 0)} (max ${fmtSimSpan(d.logKeepSec || 0)})`,
        `Marker=${d.marks ?? marks.length}`,
        `Feuerphasen=${d.firePhases}`,
        `Pred=${d.predKind}/${d.predSource}/${d.predLabel || "—"}`,
        d.predStarts != null ? `PredStarts=${d.predStarts.toFixed(1)}` : null,
        `dt×=${d.dtScale}×${d.dtScaleBoost}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }

  function radShortName(typeId) {
    const t = window.HeizungSim.RADIATOR_TYPES[typeId];
    if (!t) return typeId;
    if (typeId === "underfloor") return "FBH";
    if (typeId === "bath") return "Bad-HK";
    if (typeId.startsWith("panel")) return typeId.replace("panel", "Typ ");
    return t.name.split(" ")[0];
  }

  function renderFull(s) {
    syncLabelsFromState(s);

    const plain = burnerPlain(s);
    const pctGas = Math.round(s.burnerFrac * 100);

    const banner = $("#fire-banner");
    banner.dataset.state = plain.state;
    banner.classList.toggle("taktend", !!s.minPowerCycling);
    $("#fire-title").textContent = plain.title;
    const explainEl = $("#fire-explain");
    if (explainEl) explainEl.textContent = plain.explain;
    const statusExplain = $("#status-explain");
    if (statusExplain) statusExplain.textContent = plain.explain;
    $("#fire-power-val").textContent = `${pctGas} %`;

    // Sichtbarer Moduswechsel: Banner flashen + Toast beim Takten
    if (lastBurnerMode && lastBurnerMode !== plain.state) {
      banner.classList.remove("mode-flash");
      void banner.offsetWidth;
      banner.classList.add("mode-flash");
      const switchedOff = plain.state === "AUS" && (lastBurnerMode === "MODULIERT" || lastBurnerMode === "BRENNT");
      const switchedOn = (plain.state === "ZÜNDET" || plain.state === "MODULIERT" || plain.state === "BRENNT") && lastBurnerMode === "AUS";
      if (s.minPowerCycling && (switchedOff || switchedOn)) {
        const toast = $("#takt-toast");
        if (toast) {
          toast.hidden = false;
          toast.textContent = switchedOff
            ? "Jetzt: Brenner AUS — Takten unter Pmin"
            : "Jetzt: Brenner wieder AN — Takten";
          toast.dataset.phase = switchedOff ? "off" : "on";
          taktFlashTimer = performance.now() + 2800;
        }
      }
    }
    lastBurnerMode = plain.state;
    const toast = $("#takt-toast");
    if (toast && !toast.hidden && performance.now() > taktFlashTimer) {
      toast.hidden = true;
    }

    const pred = s.cyclingPred;
    function fmtSec(sec) {
      if (sec == null || !Number.isFinite(sec)) return "—";
      if (sec < 90) return `${Math.round(sec)} s`;
      return `${(sec / 60).toFixed(1)} min`;
    }
    function applyPred(prefix) {
      if (!pred) return;
      const card = $(prefix === "" ? "#takt-pred-card" : "#takt-pred-card-cycles");
      if (card) card.dataset.level = pred.level || "ok";
      const src = pred.source === "measured" ? "gemessen" : "Prognose";
      setText(
        prefix === "" ? "#takt-pred-label" : "#takt-pred-label-cycles",
        pred.label ? `${pred.label} · ${src}` : "—"
      );
      setText(
        prefix === "" ? "#takt-pred-starts" : "#takt-pred-starts-cycles",
        pred.kind === "cycling" ? pred.startsPerHour.toFixed(1) : "≈ 0"
      );
      setText(prefix === "" ? "#takt-pred-ton" : "#takt-pred-ton-cycles", fmtSec(pred.tonSec));
      setText(prefix === "" ? "#takt-pred-toff" : "#takt-pred-toff-cycles", fmtSec(pred.toffSec));
      setText(prefix === "" ? "#takt-pred-period" : "#takt-pred-period-cycles", fmtSec(pred.periodSec));
      setText(prefix === "" ? "#takt-pred-detail" : "#takt-pred-detail-cycles", pred.detail || "—");
    }
    applyPred("");
    applyPred("-cycles");

    const chipPred = $("#takt-pred-chip");
    if (chipPred && pred) {
      banner.dataset.takt = pred.level || "ok";
      const bandK = pred.bandK != null ? pred.bandK : s.hysteresis;
      if (pred.kind === "cycling") {
        const src = pred.source === "measured" ? "gemessen" : "Prognose";
        chipPred.textContent = `${src} ≈ ${pred.startsPerHour.toFixed(1)} Starts/h · Band ${bandK.toFixed(1)} K`;
      } else if (s.minPowerCycling) {
        chipPred.textContent = `Pmin ${s.lastMinKw.toFixed(1)} kW > Last ${s.lastLoadKw.toFixed(1)} kW → taktet`;
      } else {
        chipPred.textContent = `${pred.label} · Band ${bandK.toFixed(1)} K`;
      }
    }

    $("#burner-state").textContent = plain.short;
    $("#hud-burner").dataset.state = plain.state;
    $("#burner-power-hud").textContent = `${pctGas} % Gas`;
    $("#boiler-temp").textContent = s.boilerT.toFixed(1);
    $("#boiler-set").textContent = s.flowSet.toFixed(1);
    $("#starts-hour").textContent = String(s.startsHour);
    $("#vol-boiler").textContent = String(Math.round(s.boilerVolumeL));
    $("#vol-circuit").textContent = String(Math.round(s.circuitVolumeL));
    $("#return-temp").textContent = s.returnHeaderT.toFixed(0);

    const boilerBody = $("#boiler-body");
    if (boilerBody) boilerBody.style.fill = spectrumColor(s.boilerT);

    $("#boiler-svg-temp").textContent = `${s.boilerT.toFixed(1)} °C`;
    $("#pump-temp").textContent = `${s.boilerT.toFixed(1)} °C`;
    $("#boiler-return-temp").textContent = `${s.returnHeaderT.toFixed(1)} °C`;
    setText("#manifold-temp", `${s.boilerT.toFixed(0)}°`);
    setText("#manifold-return-temp", `${s.returnHeaderT.toFixed(0)}°`);

    const pumpChip = $("#pump-chip");
    const returnChip = $("#return-chip");
    if (pumpChip) pumpChip.style.stroke = spectrumColor(s.boilerT);
    if (returnChip) returnChip.style.stroke = spectrumColor(s.returnHeaderT);
    const pumpTemp = $("#pump-temp");
    const boilerRet = $("#boiler-return-temp");
    const boilerSvg = $("#boiler-svg-temp");
    const manRet = $("#manifold-return-temp");
    if (pumpTemp) pumpTemp.style.fill = spectrumColor(s.boilerT);
    if (boilerRet) boilerRet.style.fill = spectrumColor(s.returnHeaderT);
    if (boilerSvg) boilerSvg.style.fill = spectrumColor(Math.min(s.boilerT + 5, 75));
    if (manRet) manRet.style.fill = spectrumColor(s.returnHeaderT);

    const lo = 20;
    const hi = 80;
    const pct = (v) => ((clamp(v, lo, hi) - lo) / (hi - lo)) * 100;
    $("#hyst-fill").style.left = `${pct(s.onAt)}%`;
    $("#hyst-fill").style.width = `${Math.max(pct(s.offAt) - pct(s.onAt), 1)}%`;
    $("#hyst-on").style.left = `${pct(s.onAt)}%`;
    $("#hyst-off").style.left = `${pct(s.offAt)}%`;
    $("#hyst-needle").style.left = `${pct(s.boilerT)}%`;

    const flame = $("#boiler-flame");
    const flameGroup = $("#flame-group");
    const boilerGroup = $("#boiler-group");
    const firing = plain.state === "BRENNT" || plain.state === "MODULIERT";
    const igniting = plain.state === "ZÜNDET";
    flame.classList.toggle("on", firing || igniting);
    flameGroup.classList.toggle("firing", firing);
    flameGroup.classList.toggle("igniting", igniting);
    flameGroup.classList.toggle("taktend", !!s.minPowerCycling);
    if (boilerGroup) boilerGroup.classList.toggle("taktend", !!s.minPowerCycling);
    $("#flame-label").textContent = plain.flame;
    const taktBadge = $("#takt-badge");
    if (taktBadge) {
      taktBadge.setAttribute("visibility", s.minPowerCycling ? "visible" : "hidden");
      const taktBadgeText = $("#takt-badge-text");
      if (taktBadgeText) {
        taktBadgeText.textContent =
          plain.state === "AUS" ? "TAKTET · AUS" : plain.state === "ZÜNDET" ? "TAKTET · ZÜND" : "TAKTET · Pmin";
      }
    }

    const pumpGroup = $("#pump-group");
    const pump = $("#pump-disc");
    if (pump) pump.classList.toggle("spinning", s.totalLh > 40);
    if (pumpGroup) pumpGroup.classList.toggle("spinning", s.totalLh > 40);
    if (pump) pump.style.fill = spectrumColor(s.boilerT - 2, 20, 70);

    $("#pipe-supply-main").style.stroke = spectrumColor(s.boilerT);
    const pipeBoilerPump = $("#pipe-boiler-to-pump");
    const pipePumpManifold = $("#pipe-pump-to-manifold");
    if (pipeBoilerPump) pipeBoilerPump.style.stroke = spectrumColor(s.boilerT);
    if (pipePumpManifold) pipePumpManifold.style.stroke = spectrumColor(s.boilerT);
    $("#pipe-return-main").style.stroke = spectrumColor(s.returnHeaderT);
    const manifold = $("#manifold-body");
    const manifoldRl = $("#manifold-return-body");
    if (manifold) manifold.style.fill = spectrumColor(s.boilerT, 20, 70);
    if (manifoldRl) manifoldRl.style.fill = spectrumColor(s.returnHeaderT, 20, 70);

    for (const id of ["living", "bath", "bed"]) {
      const room = s.rooms[id];
      const flow = s.flows[id] || 0;
      const running = flow > 20;
      $(`#pipe-${id}-s`).classList.toggle("running", running);
      $(`#pipe-${id}-r`).classList.toggle("running", running);
      const speed = clamp(1.8 - flow / 500, 0.45, 1.8);
      $(`#pipe-${id}-s`).style.animationDuration = `${speed}s`;
      $(`#pipe-${id}-r`).style.animationDuration = `${speed * 1.1}s`;
      $(`#pipe-${id}-s`).style.stroke = spectrumColor(room.tIn || room.pipeSupplyT || s.boilerT);
      $(`#pipe-${id}-r`).style.stroke = spectrumColor(room.tOut || room.pipeReturnT || s.returnHeaderT);

      setGradStops(`radGrad-${id}`, room.tIn, room.tOut);
      $(`#rad-${id}`).classList.toggle("hot", (room.emitterW || 0) > 80);

      $(`#vl-${id}`).textContent = `VL ${room.tIn.toFixed(0)}°`;
      $(`#rl-${id}`).textContent = `RL ${room.tOut.toFixed(0)}°`;

      const valvePct = Math.round((room.valveOpen ?? room.thermoOpen ?? 0) * 100);
      const thermoPct = Math.round((room.thermoOpen ?? 0) * 100);
      $(`#temp-${id}`).textContent = `Ist ${room.tRoom.toFixed(1)} · Soll ${room.tSet.toFixed(1)}`;
      const valveEl = $(`#valve-${id}`);
      if (valveEl) {
        valveEl.textContent = `Ventil ${valvePct}% · Thermostat ${thermoPct}%`;
        const valveColor = valvePct > 70 ? "#f0b429" : valvePct > 35 ? "#9fe7c4" : "#8fa3b5";
        valveEl.style.color = valveColor;
        valveEl.style.fill = valveColor;
      }
      const lossW = Math.round(room.lossW || 0);
      $(`#flow-${id}`).textContent = `${radShortName(room.radType)} · ΔT ${room.spread.toFixed(1)} K · ${Math.round(flow)} L/h`;
      const powerEl = $(`#power-${id}`);
      if (powerEl) {
        powerEl.textContent = `HK ${Math.round(room.emitterW || 0)} W · Verlust ${lossW} W`;
      }

      const heat = $(`#heat-${id}`);
      heat.style.opacity = String(clamp((room.tRoom - 16) / 10, 0, 0.38));
      heat.style.fill = spectrumColor(room.tRoom, 16, 28);
      // Rohranimation / HK „aktiv“ wenn Ventil klar offen und Durchfluss da
      $(`#rad-${id}`).classList.toggle("valve-open", valvePct >= 40);
    }

    drawCycles(s);

    const list = $("#tips-list");
    const key = s.tips.map((t) => t.text).join("|");
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = s.tips.map((t) => `<li class="${t.level}">${t.text}</li>`).join("");
    }
  }

  const modalRoot = $("#modal-root");
  let activeModal = null;

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal || !modalRoot) return;
    closeModal();
    modalRoot.hidden = false;
    modal.hidden = false;
    activeModal = modal;
    document.body.style.overflow = "hidden";
    if (id === "modal-cycles") {
      requestAnimationFrame(() => {
        // force canvas resize on open
        const s = sim.snapshot();
        if (s) drawCycles(renderFull.lastSnap || s);
      });
    }
  }

  function closeModal() {
    if (!modalRoot) return;
    $$(".modal").forEach((m) => {
      m.hidden = true;
    });
    modalRoot.hidden = true;
    activeModal = null;
    document.body.style.overflow = "";
  }

  $$("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(btn.getAttribute("data-open-modal"));
    });
  });
  $$("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => closeModal());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeModal) closeModal();
  });

  // Szenario aus Modal (falls vorhanden) → schließen
  $$("[data-scenario]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (activeModal) setTimeout(() => closeModal(), 80);
    });
  });

  bindControls();
  showScenario(activeScenarioId);
  sim.applyScenario(activeScenarioId);
  pushControlsFromSim();
  readControlsIntoSim();
  refreshRoomLabels();

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    readControlsIntoSim();
    const snap = sim.step(dt);
    renderFull.lastSnap = snap;
    // Messwerte für Agent/Konsole: window.__heizungDiag
    window.__heizungDiag = snap.diagnostics;
    window.__heizungSnap = {
      burnerMode: snap.burnerMode,
      burnerRawMode: snap.burnerRawMode,
      burnerFrac: snap.burnerFrac,
      boilerT: snap.boilerT,
      onAt: snap.onAt,
      offAt: snap.offAt,
      cycleLog: snap.cycleLog,
      cyclingPred: snap.cyclingPred,
      diagnostics: snap.diagnostics,
      simTime: snap.simTime,
    };
    renderFull(snap);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
