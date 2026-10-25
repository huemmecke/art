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
    // Hatch-Block hat die vollen Parameter; Main nur Thermostat
    const hatch = $$(`.hatch .room-ctrl[data-room="${roomId}"]`)[0] || $(`.room-ctrl[data-room="${roomId}"]`);
    const main = $(`.main-ops .room-ctrl[data-room="${roomId}"]`);
    const tSetEl = main ? $(".tset", main) : $(".tset", hatch);
    const typeEl = $(".rad-type", hatch);
    return {
      tSet: Number(tSetEl.value),
      loadW: Number($(".load", hatch).value),
      radType: typeEl ? typeEl.value : "panel22",
      qn: Number($(".qn", hatch).value),
      n: Number($(".nexp", hatch).value),
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

  function readControlsIntoSim() {
    sim.setControls({
      brandId: brandSelect.value,
      hystOverride: Number($("#hysteresis").value),
      burnerPowerKw: Number($("#burner-power").value),
      outdoor: Number($("#outdoor").value),
      slope: Number($("#slope").value),
      shift: Number($("#shift").value),
      diameterMm: Number($("#diameter").value),
      lengthMul: Number($("#length").value),
      balance: Number($("#balance").value),
      pumpHeadM: Number($("#pump-head").value),
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

  function syncLabelsFromState(s) {
    $("#val-power").textContent = `${s.burnerPowerKw} kW`;
    $("#val-outdoor").textContent = `${s.outdoor} °C`;
    $("#val-slope").textContent = s.slope.toFixed(1);
    $("#val-shift").textContent = `${s.shift > 0 ? "+" : ""}${s.shift} K`;
    $("#val-diameter").textContent = `${s.diameterMm} mm`;
    $("#val-length").textContent = `${s.lengthMul.toFixed(1)}×`;
    $("#val-pump").textContent = `${s.pumpHeadM.toFixed(1)} mWS`;
    const bal = s.balance;
    $("#val-balance").textContent =
      bal < 35 ? `${bal}% offen (schlecht)` : bal < 75 ? `${bal}% teilweise` : `${bal}% ausgeglichen`;
    $("#val-hyst").textContent = `${s.hysteresis.toFixed(1)} K`;
    $("#hyst-readout").textContent = `Band ${s.onAt.toFixed(1)}–${s.offAt.toFixed(1)} °C`;
    $("#brand-hint").textContent = s.brand.hint;
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
        sim.applyScenario(btn.dataset.scenario);
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
        title: "Brenner ZÜNDET",
        explain: "Zündung läuft — gleich kommt die Flamme. Noch keine Nutzleistung.",
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
      title: "Brenner AUS",
      explain: "Kein Gas, keine Flamme. Warte auf Unterschreiten der Einschaltschwelle (Hysterese).",
      short: "AUS",
      flame: "AUS",
    };
  }

  function drawCycles(s) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = cycleCanvas.clientWidth || 900;
    const cssH = 72;
    if (cycleCanvas.width !== Math.floor(cssW * dpr) || cycleCanvas.height !== Math.floor(cssH * dpr)) {
      cycleCanvas.width = Math.floor(cssW * dpr);
      cycleCanvas.height = Math.floor(cssH * dpr);
    }
    const ctx = cycleCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const windowSec = 900;
    const tNow = s.simTime;
    const t0 = Math.max(0, tNow - windowSec);
    const log = s.cycleLog || [];
    const baseY = cssH * 0.78;

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
    ctx.moveTo(36, baseY);
    ctx.lineTo(cssW, baseY);
    ctx.stroke();

    const events = log.length ? log.slice() : [{ t: t0, on: false, power: 0 }];
    let onCount = 0;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const tStart = Math.max(ev.t, t0);
      const tEnd = i + 1 < events.length ? events[i + 1].t : tNow;
      if (tEnd <= t0) continue;
      const x1 = 36 + ((tStart - t0) / windowSec) * (cssW - 40);
      const x2 = 36 + ((Math.min(tEnd, tNow) - t0) / windowSec) * (cssW - 40);
      const w = Math.max(x2 - x1, 2);
      if (ev.on) {
        onCount += 1;
        const power = clamp(ev.power || 1, 0.05, 1);
        const h = 8 + power * (baseY - 16);
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
      } else {
        ctx.fillStyle = "#5b6f82";
        ctx.fillRect(x1, baseY - 3, w, 3);
      }
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cssW - 3, 4);
    ctx.lineTo(cssW - 3, cssH - 4);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "11px Outfit, sans-serif";
    ctx.fillText("jetzt", cssW - 36, 14);

    const plain = burnerPlain(s);
    $("#cycle-caption").textContent =
      plain.state === "AUS"
        ? `Gerade AUS · ${onCount} Feuerphase(n) im Fenster`
        : `Gerade ${plain.short} · ${Math.round(s.burnerFrac * 100)} % Gas`;
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
    $("#fire-title").textContent = plain.title;
    $("#fire-explain").textContent = plain.explain;
    $("#fire-power-val").textContent = `${pctGas} %`;

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
    $("#manifold-temp").textContent = `${s.boilerT.toFixed(0)} °C`;

    const pumpChip = $("#pump-chip");
    const returnChip = $("#return-chip");
    if (pumpChip) pumpChip.style.stroke = spectrumColor(s.boilerT);
    if (returnChip) returnChip.style.stroke = spectrumColor(s.returnHeaderT);
    $("#pump-temp").style.fill = spectrumColor(s.boilerT);
    $("#boiler-return-temp").style.fill = spectrumColor(s.returnHeaderT);
    $("#boiler-svg-temp").style.fill = spectrumColor(Math.min(s.boilerT + 5, 75));

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
    const firing = plain.state === "BRENNT" || plain.state === "MODULIERT";
    const igniting = plain.state === "ZÜNDET";
    flame.classList.toggle("on", firing || igniting);
    flameGroup.classList.toggle("firing", firing);
    flameGroup.classList.toggle("igniting", igniting);
    $("#flame-label").textContent = plain.flame;

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
    if (manifold) manifold.style.fill = spectrumColor(s.boilerT, 20, 70);

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

      $(`#temp-${id}`).textContent = `${room.tRoom.toFixed(1)} °C`;
      const dpKpa = ((room.deltaP || 0) / 1000).toFixed(1);
      $(`#flow-${id}`).textContent = `${radShortName(room.radType)} Qn ${room.qn} · ΔT ${room.spread.toFixed(1)} K · ${Math.round(flow)} L/h · ${Math.round(room.emitterW || 0)} W · ${dpKpa} kPa`;

      const heat = $(`#heat-${id}`);
      heat.style.opacity = String(clamp((room.tRoom - 16) / 10, 0, 0.38));
      heat.style.fill = spectrumColor(room.tRoom, 16, 28);
    }

    drawCycles(s);

    const list = $("#tips-list");
    const key = s.tips.map((t) => t.text).join("|");
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = s.tips.map((t) => `<li class="${t.level}">${t.text}</li>`).join("");
    }
  }

  const hatch = $("#revision-hatch");
  const hatchBtn = $("#hatch-toggle");
  const hatchBody = $("#hatch-body");
  if (hatchBtn && hatchBody) {
    hatchBtn.addEventListener("click", () => {
      const open = hatch.classList.toggle("is-open");
      hatchBtn.setAttribute("aria-expanded", open ? "true" : "false");
      hatchBody.hidden = !open;
      hatchBtn.querySelector(".hatch-title").textContent = open
        ? "Revisionsklappe schließen"
        : "Revisionsklappe öffnen";
    });
  }

  bindControls();
  pushControlsFromSim();
  readControlsIntoSim();
  refreshRoomLabels();

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    readControlsIntoSim();
    renderFull(sim.step(dt));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
