/**
 * Didaktisches Heizkreislauf-Modell — näher an Praxisformeln, keine DIN-Auslegung.
 *
 * Physik-Schicht:
 * - Heizkörper: Q = Qn · ((ΔTm/ΔTn)^n)  (EN-442-ähnlich)
 * - Rohr: Darcy-Weisbach Δp = λ·(L/d)·(ρ v² / 2)
 * - Spreizung: Q = ṁ · cp · ΔT
 * - Kessel: nur kleiner Wasservolumen, Mischung mit Rücklauf
 */
(function () {
  "use strict";

  const CP = 4180; // J/(kg·K)
  const RHO = 980; // kg/m³ heißes Heizwasser grob
  const MU = 0.0004; // Pa·s dynamische Viskosität ~60 °C
  const BOILER_VOLUME_L = 7;
  const RETURN_HEADER_L = 12;
  const G = 9.81;

  const BRANDS = {
    viessmann: {
      name: "Viessmann Vitodens 100",
      hint: "Moduliert ca. 1:5 — unter der Mindestleistung kann sie Wärme nicht „klein genug“ machen und taktet.",
      hysteresis: 2.0,
      modulating: true,
      /** Vitodens 100 typ. ~1:5 (z. B. ~4 kW bei 19–20 kW) */
      minMod: 0.2,
      modRatioLabel: "1:5",
      ramp: 0.55,
      minRun: 45,
      lockout: 25,
      ignition: 2.5,
    },
    buderus: {
      name: "Buderus / Bosch (modulierend)",
      hint: "Moduliert, Mindestleistung beachten — darunter ebenfalls Takten.",
      hysteresis: 2.5,
      modulating: true,
      minMod: 0.2,
      modRatioLabel: "1:5",
      ramp: 0.48,
      minRun: 50,
      lockout: 30,
      ignition: 2.8,
    },
    vaillant: {
      name: "Vaillant (modulierend)",
      hint: "Breitere Modulation (~1:6) — etwas seltener Takten bei Teillast.",
      hysteresis: 1.8,
      modulating: true,
      minMod: 0.17,
      modRatioLabel: "1:6",
      ramp: 0.62,
      minRun: 40,
      lockout: 20,
      ignition: 2.2,
    },
    weishaupt: {
      name: "Weishaupt (klassisch)",
      hint: "Eher Ein/Aus-Charakter — Hysterese entscheidet über Takten.",
      hysteresis: 5.0,
      modulating: false,
      minMod: 1,
      ramp: 1,
      minRun: 90,
      lockout: 60,
      ignition: 3.5,
    },
    einaus: {
      name: "Generisch Ein/Aus (Lehrgerät)",
      hint: "Reines Ein/Aus — ideal für Hysterese und Starts/h.",
      hysteresis: 6.0,
      modulating: false,
      minMod: 1,
      ramp: 1,
      minRun: 60,
      lockout: 45,
      ignition: 3.0,
    },
  };

  /**
   * Heizkörper-Typen: Qn bei Norm 75/65/20 (ΔTn = 50 K log. Mittel ≈ 49.8 → wir nutzen 50).
   * n = Heizkörperexponent (Platten ~1.3, Badheizkörper ~1.25, FB ~1.1)
   */
  const RADIATOR_TYPES = {
    panel22: {
      name: "Plattenheizkörper Typ 22",
      hint: "Standard Wohnraum — Exponent n≈1.30",
      n: 1.3,
      defaultQn: 1800,
      waterLPerKw: 4.5,
    },
    panel11: {
      name: "Plattenheizkörper Typ 11",
      hint: "Flacher, weniger Leistung — n≈1.30",
      n: 1.3,
      defaultQn: 1100,
      waterLPerKw: 3.2,
    },
    panel33: {
      name: "Plattenheizkörper Typ 33",
      hint: "Hohe Leistung kompakt — n≈1.33",
      n: 1.33,
      defaultQn: 2600,
      waterLPerKw: 6.0,
    },
    bath: {
      name: "Badheizkörper (Röhre)",
      hint: "Oft unterdimensioniert sichtbar — n≈1.25",
      n: 1.25,
      defaultQn: 700,
      waterLPerKw: 5.5,
    },
    cast: {
      name: "Glieder-/Rippenheizkörper",
      hint: "Trägheit höher (mehr Wasser) — n≈1.28",
      n: 1.28,
      defaultQn: 1600,
      waterLPerKw: 8.0,
    },
    underfloor: {
      name: "Fußbodenheizung",
      hint: "Niedrige VL, flacher Exponent n≈1.1, große Wassermasse",
      n: 1.1,
      defaultQn: 2000,
      waterLPerKw: 18,
      preferLowFlow: true,
    },
  };

  const ROOMS = {
    living: { id: "living", label: "Wohnzimmer", lengthFactor: 0.55, pipeVolL: 4, lengthM: 6 },
    bath: { id: "bath", label: "Bad", lengthFactor: 1.0, pipeVolL: 8, lengthM: 12 },
    bed: { id: "bed", label: "Schlafzimmer", lengthFactor: 1.85, pipeVolL: 14, lengthM: 22 },
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function heatingCurveFlowSet(outdoor, slope, shift) {
    const designOutdoor = -12;
    const designFlow = 20 + slope * (20 - designOutdoor) * 1.55;
    const t = (20 - outdoor) / (20 - designOutdoor);
    const raw = 20 + t * (designFlow - 20);
    return clamp(raw + shift, 25, 75);
  }

  /** Logarithmisches Temperaturmittel (EN 442) */
  function deltaTm(tIn, tOut, tRoom) {
    const d1 = tIn - tRoom;
    const d2 = tOut - tRoom;
    if (d1 <= 0.5 || d2 <= 0.5) return Math.max(0, (d1 + d2) / 2);
    if (Math.abs(d1 - d2) < 0.3) return (d1 + d2) / 2;
    return (d1 - d2) / Math.log(d1 / d2);
  }

  /**
   * Darcy-Weisbach: Δp = λ · (L/d) · (ρ v² / 2)
   * λ aus Blasius grob für turbulente Strömung, sonst Hagen-Poiseuille.
   */
  function darcyPressurePa(lengthM, diameterMm, flowLh) {
    const d = Math.max(diameterMm, 8) / 1000;
    const A = Math.PI * (d / 2) ** 2;
    const q = flowLh / 3600 / 1000; // m³/s
    const v = q / A;
    if (v < 1e-6) return 0;
    const Re = (RHO * v * d) / MU;
    let lambda;
    if (Re < 2300) {
      lambda = 64 / Math.max(Re, 1);
    } else {
      // Blasius
      lambda = 0.3164 / Math.pow(Re, 0.25);
    }
    return lambda * (lengthM / d) * (RHO * v * v) / 2;
  }

  function createRoomState(overrides) {
    const typeId = overrides.radType || "panel22";
    const type = RADIATOR_TYPES[typeId] || RADIATOR_TYPES.panel22;
    const tSet = overrides.tSet ?? 21;
    const loadW = overrides.loadW ?? 1800;
    const tRoom = overrides.tRoom ?? tSet - 1.5;
    const qn = overrides.qn ?? type.defaultQn;
    return {
      tSet,
      loadW,
      tRoom,
      radType: typeId,
      qn,
      n: overrides.n ?? type.n,
      flowLh: 0,
      emitterW: 0,
      tIn: tRoom + 8,
      tOut: tRoom + 4,
      spread: 4,
      pipeSupplyT: tRoom + 6,
      pipeReturnT: tRoom + 3,
      deltaP: 0,
      kvPreset: 1,
    };
  }

  function createSim(initial) {
    const state = {
      outdoor: initial.outdoor ?? 0,
      slope: initial.slope ?? 1.4,
      shift: initial.shift ?? 0,
      diameterMm: initial.diameterMm ?? 15,
      lengthMul: initial.lengthMul ?? 1,
      balance: initial.balance ?? 20,
      burnerPowerKw: initial.burnerPowerKw ?? 18,
      brandId: initial.brandId ?? "viessmann",
      hystOverride: initial.hystOverride ?? null,
      pumpHeadM: initial.pumpHeadM ?? 5.5, // Förderhöhe mWS
      rooms: {
        living: createRoomState({ tSet: 21, loadW: 1800, radType: "panel22", qn: 1800 }),
        bath: createRoomState({ tSet: 24, loadW: 900, radType: "bath", qn: 800, tRoom: 21 }),
        bed: createRoomState({ tSet: 18, loadW: 1400, radType: "panel11", qn: 1200, tRoom: 17.5 }),
      },
      boilerT: 42,
      returnHeaderT: 36,
      boilerVolumeL: BOILER_VOLUME_L,
      circuitVolumeL: 0,
      systemDeltaP: 0,
      burner: {
        mode: "off",
        powerFrac: 0,
        igniteLeft: 0,
        runTime: 0,
        lockLeft: 0,
        starts: [],
        cycleLog: [],
      },
      tips: [],
      simTime: 0,
      dtScale: 18,
      /** wird bei Takten erhöht, damit AN/AUS in Echtzeit sichtbar ist */
      dtScaleBoost: 1,
      physicsNote: "EN-442-Exponent + Darcy-Weisbach (Lernmodell)",
      /** true wenn Last < Brenner-Mindestleistung → muss takten */
      minPowerCycling: false,
      lastLoadKw: 0,
      lastMinKw: 0,
    };

    function brand() {
      return BRANDS[state.brandId] || BRANDS.viessmann;
    }

    function radType(room) {
      return RADIATOR_TYPES[room.radType] || RADIATOR_TYPES.panel22;
    }

    function hysteresisK() {
      if (state.hystOverride != null) return state.hystOverride;
      return brand().hysteresis;
    }

    function flowSetpoint() {
      return heatingCurveFlowSet(state.outdoor, state.slope, state.shift);
    }

    function circuitVolumeLiters() {
      const d = state.diameterMm / 1000;
      const area = Math.PI * (d / 2) ** 2;
      let vol = RETURN_HEADER_L;
      for (const [key, meta] of Object.entries(ROOMS)) {
        const room = state.rooms[key];
        const lengthM = meta.lengthM * state.lengthMul;
        vol += area * lengthM * 1000;
        vol += meta.pipeVolL * state.lengthMul;
        vol += (room.qn / 1000) * radType(room).waterLPerKw;
      }
      return vol;
    }

    /** Ventil-Leitwert aus Abgleich + Thermostat (Kv-ähnlich) */
    function valveConductance(roomKey) {
      const room = state.rooms[roomKey];
      const meta = ROOMS[roomKey];
      const bal = state.balance / 100;

      // Natürlicher Durchflussanteil ohne Abgleich ~ 1/√Δp bzw. 1/Länge
      const natural = 1 / Math.sqrt(Math.max(meta.lengthFactor * state.lengthMul, 0.2));
      const sumNat = Object.keys(ROOMS).reduce(
        (s, k) => s + 1 / Math.sqrt(Math.max(ROOMS[k].lengthFactor * state.lengthMul, 0.2)),
        0
      );
      const naturalShare = natural / sumNat;
      const targetShare = 1 / 3;
      // Abgleich drosselt kurze Stränge
      const preset = lerp(1, targetShare / Math.max(naturalShare, 0.05), bal);
      room.kvPreset = preset;

      const err = room.tSet - room.tRoom;
      const thermoOpen = clamp(err / 2.0 + 0.3, 0.02, 1);
      return preset * thermoOpen;
    }

    /**
     * Hydraulik-Netz: Darcy Δp je Strang, Pumpe als konstante Förderhöhe,
     * Volumenströme iterativ über Leitwerte.
     */
    function hydraulics(dt) {
      state.circuitVolumeL = circuitVolumeLiters();
      const pumpPa = state.pumpHeadM * RHO * G;

      // Startwerte / Iteration: flow ~ conductance / sqrt(resistance)
      const flows = {};
      let totalLh = 0;

      for (let iter = 0; iter < 4; iter++) {
        totalLh = 0;
        let sumCond = 0;
        const cond = {};
        for (const k of Object.keys(ROOMS)) {
          const meta = ROOMS[k];
          const room = state.rooms[k];
          const lengthM = meta.lengthM * state.lengthMul;
          const guess = flows[k] || 200;
          const dpPipe = darcyPressurePa(lengthM, state.diameterMm, guess);
          // Ventilwiderstand grob proportional 1/kv²
          const kv = Math.max(valveConductance(k), 0.02);
          const dpValve = (80000 / (kv * kv)) * Math.pow(guess / 300, 2);
          const dp = dpPipe + dpValve;
          room.deltaP = dp;
          // Effektive Leitfähigkeit
          cond[k] = kv / Math.sqrt(Math.max(dpPipe / 1000 + 1 / (kv * kv), 0.2));
          sumCond += cond[k];
        }

        // Gesamtdurchfluss: Pumpe gegen mittleres Δp
        const avgDp =
          Object.keys(ROOMS).reduce((s, k) => s + (state.rooms[k].deltaP || 0), 0) / 3;
        const pumpFactor = clamp(1 - avgDp / (pumpPa * 1.35), 0.08, 1);
        const qMax = 1100 * pumpFactor * Math.pow(state.diameterMm / 15, 1.6);
        totalLh = qMax;
        for (const k of Object.keys(ROOMS)) {
          flows[k] = sumCond > 0 ? (cond[k] / sumCond) * totalLh : 0;
        }
      }

      state.systemDeltaP = Object.keys(ROOMS).reduce((s, k) => s + (state.rooms[k].deltaP || 0), 0) / 3;

      const outdoor = state.outdoor;
      let returnMix = 0;
      let flowWeight = 0;
      let heatExtractKw = 0;

      for (const k of Object.keys(ROOMS)) {
        const meta = ROOMS[k];
        const room = state.rooms[k];
        const type = radType(room);
        const flowLh = flows[k];
        const mDot = flowLh / 3600; // kg/s

        // Transportverzögerung Vorlauf
        const supplyVol = meta.pipeVolL * state.lengthMul * (15 / Math.max(state.diameterMm, 10));
        const tauSupply = clamp((supplyVol / Math.max(flowLh, 15)) * 3600, 6, 200);
        room.pipeSupplyT = lerp(room.pipeSupplyT, state.boilerT, 1 - Math.exp(-dt / tauSupply));
        room.tIn = room.pipeSupplyT;

        // Vorabschätzung tOut für ΔTm; dann Q nach EN-442-ähnlich
        let tOutGuess = room.tOut;
        let emitterW = 0;
        for (let j = 0; j < 3; j++) {
          const dtm = deltaTm(room.tIn, tOutGuess, room.tRoom);
          const dtn = 50; // Norm 75/65/20
          const ratio = clamp(dtm / dtn, 0, 1.4);
          emitterW = room.qn * Math.pow(ratio, room.n || type.n);
          // Durchfluss begrenzt: ohne Masse keine Leistung
          if (mDot < 1e-5) emitterW = 0;
          else {
            const maxQ = mDot * CP * Math.max(room.tIn - room.tRoom - 0.5, 0.5);
            emitterW = Math.min(emitterW, maxQ);
          }
          const spread = mDot > 1e-5 ? emitterW / (mDot * CP) : 0;
          tOutGuess = room.tIn - clamp(spread, 0, Math.max(room.tIn - room.tRoom - 0.5, 0));
        }

        room.tOut = tOutGuess;
        room.spread = room.tIn - room.tOut;
        room.emitterW = emitterW;

        const tauRet = tauSupply * 0.85;
        room.pipeReturnT = lerp(room.pipeReturnT, room.tOut, 1 - Math.exp(-dt / tauRet));

        const lossFactor = Math.max((room.tRoom - outdoor) / Math.max(room.tSet - outdoor, 4), 0.2);
        // FB träger
        const capacity = type.preferLowFlow ? 0.02 : 0.035;
        const netW = emitterW - room.loadW * lossFactor;
        room.tRoom = clamp(room.tRoom + (netW / 100) * capacity * (dt / 60), outdoor + 0.5, 34);

        returnMix += room.pipeReturnT * flowLh;
        flowWeight += flowLh;
        heatExtractKw += emitterW / 1000;
        room.flowLh = flowLh;
      }

      const tReturnMix = flowWeight > 0 ? returnMix / flowWeight : state.returnHeaderT;
      const tauHeader = clamp((RETURN_HEADER_L / Math.max(totalLh, 40)) * 3600, 5, 90);
      state.returnHeaderT = lerp(state.returnHeaderT, tReturnMix, 1 - Math.exp(-dt / tauHeader));

      return { totalLh, flows, tReturn: state.returnHeaderT, heatExtractKw };
    }

    function logCycle(on, power) {
      const log = state.burner.cycleLog;
      const last = log[log.length - 1];
      if (!last || last.on !== on || Math.abs((last.power || 0) - power) > 0.08) {
        log.push({ t: state.simTime, on, power });
      } else {
        last.power = power;
        last.tEnd = state.simTime;
      }
      while (log.length > 2 && state.simTime - log[0].t > 900) log.shift();
    }

    function updateBurner(dt, flowSet, heatExtractKw) {
      const b = brand();
      const hyst = hysteresisK();
      const onAt = flowSet - hyst / 2;
      const offAt = flowSet + hyst / 2;
      const br = state.burner;
      const lossKw = Math.max(0, (state.boilerT - state.outdoor) * 0.01);
      const loadKw = Math.max((heatExtractKw || 0) + lossKw, 0.02);
      const minKw = b.modulating ? state.burnerPowerKw * b.minMod : state.burnerPowerKw;
      const maxKw = state.burnerPowerKw;
      // Vitodens-Logik: unter Pmin kann Leistung nicht weiter abgesenkt werden → Takten
      const cannotShed = b.modulating && loadKw < minKw * 0.95;
      state.minPowerCycling = cannotShed;
      state.lastLoadKw = loadKw;
      state.lastMinKw = minKw;

      br.starts = br.starts.filter((t) => state.simTime - t < 3600);
      if (br.lockLeft > 0) br.lockLeft = Math.max(0, br.lockLeft - dt);

      if (br.mode === "igniting") {
        br.igniteLeft -= dt;
        br.powerFrac = 0;
        logCycle(false, 0);
        if (br.igniteLeft <= 0) {
          br.mode = "on";
          br.runTime = 0;
          // Start: bei Unterlast sofort auf Mindestleistung (nicht „sanft darunter“)
          br.powerFrac = b.modulating ? (cannotShed ? b.minMod : Math.max(b.minMod, loadKw / maxKw)) : 1;
        }
        return { onAt, offAt };
      }

      if (br.mode === "on") {
        br.runTime += dt;
        let want = 1;
        if (b.modulating) {
          if (cannotShed) {
            // Leistung lässt sich nicht loswerden → hart auf Pmin, bis Hysterese abschaltet
            want = b.minMod;
          } else {
            // Last im Modulationsfenster: Leistung der Abnahme nachführen
            want = clamp(loadKw / maxKw, b.minMod, 1);
            // leichte Korrektur anhand Kesseltemperatur
            const band = Math.max(hyst, 1);
            const trim = clamp((flowSet - state.boilerT) / (band * 4), -0.08, 0.12);
            want = clamp(want + trim, b.minMod, 1);
          }
        }
        br.powerFrac = lerp(br.powerFrac, want, clamp(b.ramp * (dt / 10), 0.05, 1));
        // Nie unter Mindestmodulation (außer Aus)
        if (b.modulating) br.powerFrac = Math.max(br.powerFrac, b.minMod);
        logCycle(true, br.powerFrac);

        // Abschalten: Soll+Hysterese — bei Pmin-Überschuss typisches Vitodens-Takten
        if (br.runTime >= b.minRun && state.boilerT >= offAt) {
          br.mode = "off";
          br.powerFrac = 0;
          br.lockLeft = b.lockout;
          logCycle(false, 0);
        }
        return { onAt, offAt };
      }

      br.powerFrac = 0;
      logCycle(false, 0);
      if (state.boilerT <= onAt && br.lockLeft <= 0) {
        br.mode = "igniting";
        br.igniteLeft = b.ignition;
        br.starts.push(state.simTime);
      }
      return { onAt, offAt };
    }

    function updateBoiler(dt, totalLh, heatExtractKw) {
      const inputKw = state.burner.powerFrac * state.burnerPowerKw;
      const lossKw = Math.max(0, (state.boilerT - state.outdoor) * 0.01);
      const extractKw = Math.max(heatExtractKw || 0, 0);
      const massKg = BOILER_VOLUME_L;
      const mDot = Math.max(totalLh, 1) / 3600; // kg/s

      // Energiebilanz am Kesselwasser:
      // m·cp·dT = P_brenner·dt + ṁ·cp·(T_rl − T_kessel)·dt − P_verlust·dt
      // Zusätzlich begrenzen wir den „Rohr-Aufheiz-Effekt“, damit nah am Soll
      // die Vitodens-Pmin-Überschusswärme sichtbar taktet (nicht ewig verdünnt wird).
      const flowSet = flowSetpoint();
      const nearSet = state.boilerT > flowSet - 12;
      const mixGain = nearSet || state.minPowerCycling ? 0.35 : 1.0;
      const dTFlow =
        ((mDot * (state.returnHeaderT - state.boilerT)) / massKg) * dt * mixGain;
      const dTBurn = (inputKw * 1000 * dt) / (massKg * CP);
      const dTLoss = (lossKw * 1000 * dt) / (massKg * CP);
      // Abgabe an Kreislauf grob über Extract, aber nicht doppelt so stark wie Flow-Term
      const dTExtract = nearSet
        ? (extractKw * 1000 * dt) / (massKg * CP) * 0.25
        : 0;

      let next = state.boilerT + dTBurn + dTFlow - dTLoss - dTExtract;

      // Unter Pmin und nah am Soll: Mindestleistung muss den Fühler klar nach oben treiben
      if (state.minPowerCycling && inputKw > 0 && nearSet) {
        const surplusKw = Math.max(inputKw - extractKw - lossKw, inputKw * 0.35);
        const dTSurplus = (surplusKw * 1000 * dt) / (massKg * CP);
        next = Math.max(next, state.boilerT + dTSurplus * 0.85);
      }

      state.boilerT = clamp(next, state.outdoor + 1, 88);
    }

    /**
     * Prognose der Taktung aus aktueller Last, Hysterese und Kesselmasse.
     * ton/toff ≈ (m·cp·Band) / P_netto  — Lernmodell, keine Herstellerkurve.
     */
    function predictCycling(hyd, onAt, offAt, flowSet) {
      const b = brand();
      const hyst = hysteresisK();
      const band = Math.max(offAt - onAt, 0.5);
      const extractKw = Math.max(hyd.heatExtractKw || 0, 0.05);
      const lossKw = Math.max(0, (flowSet - state.outdoor) * 0.01);
      const loadKw = extractKw + lossKw;
      const capJperK = BOILER_VOLUME_L * CP; // J/K
      const energyBandJ = capJperK * band;

      const minKw = b.modulating ? state.burnerPowerKw * b.minMod : state.burnerPowerKw;
      const maxKw = state.burnerPowerKw;

      // Überlast: auch Vollast reicht nicht → läuft durch
      if (loadKw > maxKw * 1.08) {
        return {
          kind: "overload",
          level: "warn",
          startsPerHour: 0,
          tonSec: null,
          toffSec: null,
          periodSec: null,
          loadKw,
          bandK: band,
          minKw,
          label: "Dauerfeuer",
          detail: `Last ${loadKw.toFixed(1)} kW > Brenner ${maxKw.toFixed(1)} kW — Ausschaltpunkt kaum erreichbar (Unterversorgung).`,
        };
      }

      // Last im Modulationsfenster → halten ohne Takten
      if (b.modulating && loadKw >= minKw * 0.95 && loadKw <= maxKw * 1.05) {
        const modPct = clamp((loadKw / maxKw) * 100, b.minMod * 100, 100);
        return {
          kind: "hold",
          level: "ok",
          startsPerHour: 0,
          tonSec: null,
          toffSec: null,
          periodSec: null,
          loadKw,
          bandK: band,
          minKw,
          label: "kaum Takten",
          detail: `Last ${loadKw.toFixed(1)} kW ≥ Pmin ${minKw.toFixed(1)} kW (${b.modRatioLabel || "Modulation"}) → kann Leistung abführen, Dauerbetrieb ~${modPct.toFixed(0)} %.`,
        };
      }

      // Unter Pmin: Vitodens 100 & Co. → Takten, weil Mindestleistung nicht „losgeworden“ wird
      const fireKw = b.modulating ? minKw : maxKw;
      const netHeatKw = Math.max(fireKw - loadKw, 0.05);
      const coolKw = Math.max(loadKw, 0.05);
      let tonSec = energyBandJ / (netHeatKw * 1000);
      let toffSec = energyBandJ / (coolKw * 1000);
      tonSec = Math.max(tonSec, b.minRun || 0);
      toffSec = Math.max(toffSec, b.lockout || 0);
      const periodSec = tonSec + toffSec;
      const startsPerHour = clamp(3600 / Math.max(periodSec, 1), 0, 60);

      let level = "ok";
      let label = "selten";
      if (startsPerHour >= 6) {
        level = "bad";
        label = "starkes Takten";
      } else if (startsPerHour >= 3) {
        level = "warn";
        label = "grenzwertig";
      }

      const cause =
        b.modulating && loadKw < minKw
          ? `Pmin ${minKw.toFixed(1)} kW > Last ${loadKw.toFixed(1)} kW — ${b.name} kann nicht weiter drosseln`
          : `Ein/Aus-Betrieb`;

      return {
        kind: "cycling",
        level,
        startsPerHour,
        tonSec,
        toffSec,
        periodSec,
        loadKw,
        bandK: band,
        minKw,
        label,
        detail: `${cause} → An ~${Math.round(tonSec)} s / Aus ~${Math.round(toffSec)} s ≈ ${startsPerHour.toFixed(1)} Starts/h (${label}).`,
      };
    }

    function buildTips(hyd, onAt, offAt, flowSet) {
      const tips = [];
      const starts = state.burner.starts.length;
      const flows = hyd.flows;
      const volRatio = state.circuitVolumeL / BOILER_VOLUME_L;

      tips.push({
        level: "ok",
        text: `Physik: Q=Qn·(ΔTm/50)^n, Darcy Δp. Therme nur ~${BOILER_VOLUME_L} L, Kreislauf ≈ ${state.circuitVolumeL.toFixed(0)} L (×${volRatio.toFixed(0)}).`,
      });

      if (state.minPowerCycling && state.burner.mode === "on") {
        tips.push({
          level: "warn",
          text: `${brand().name}: Last ${state.lastLoadKw.toFixed(1)} kW < Pmin ${state.lastMinKw.toFixed(1)} kW — Mindestleistung wird nicht abgeführt → Kessel läuft auf Ausschaltpunkt und taktet.`,
        });
      } else if (state.burner.mode === "on") {
        tips.push({
          level: "ok",
          text: brand().modulating
            ? `Brenner ${Math.round(state.burner.powerFrac * 100)} % (Pmin ${(brand().minMod * 100).toFixed(0)} %) — Last im Modulationsfenster, Kessel ${state.boilerT.toFixed(0)} °C.`
            : `Brenner Vollast bis Ausschaltpunkt ${offAt.toFixed(1)} °C.`,
        });
      } else if (state.burner.mode === "igniting") {
        tips.push({ level: "warn", text: "Brenner zündet — erst Kessel heiß, Rohre noch kälter." });
      } else {
        tips.push({
          level: "ok",
          text: state.minPowerCycling
            ? `Brenner aus (Sperre/Hysterese). Nächster Start wieder bei ${onAt.toFixed(1)} °C — typisches Takten unter Pmin.`
            : `Brenner aus. Wieder an unter ${onAt.toFixed(1)} °C.`,
        });
      }

      const living = state.rooms.living;
      const bed = state.rooms.bed;
      if (living.spread < 5 && flows.living > flows.bed * 1.5) {
        tips.push({
          level: "warn",
          text: `Spreizung Wohnen ${living.spread.toFixed(1)} K vs. Schlaf ${bed.spread.toFixed(1)} K — typisch ohne Abgleich (zu viel ṁ im kurzen Strang).`,
        });
      }

      if (state.balance < 40 && flows.living > flows.bed * 1.6) {
        tips.push({
          level: "bad",
          text: `Darcy: kurzer Strang Δp ${((living.deltaP || 0) / 1000).toFixed(1)} kPa vs. lang ${((bed.deltaP || 0) / 1000).toFixed(1)} kPa — Durchfluss stiehlt sich den Weg.`,
        });
      }

      const pred = predictCycling(hyd, onAt, offAt, flowSet);
      tips.push({
        level: pred.level,
        text: `Takt-Prognose: ${pred.detail}`,
      });

      if (starts >= 6) {
        tips.push({ level: "bad", text: `Gemessen ${starts} Starts/h — Takten! Hysterese/Leistung/Kurve prüfen.` });
      } else if (starts >= 3) {
        tips.push({ level: "warn", text: `Gemessen ${starts} Starts/h — Grenzbereich.` });
      }

      // Unterdimensionierter HK
      if (bed.emitterW < bed.loadW * 0.55 && bed.tRoom < bed.tSet - 1) {
        tips.push({
          level: "warn",
          text: `Schlafzimmer-HK Qn=${bed.qn} W zu klein bzw. ΔTm zu niedrig (Typ ${radType(bed).name}).`,
        });
      }

      state.tips = tips.slice(0, 6);
    }

    function step(realDt) {
      const flowSetPreview = flowSetpoint();
      const hystPreview = hysteresisK();
      const offPreview = flowSetPreview + hystPreview / 2;
      const onPreview = flowSetPreview - hystPreview / 2;
      const br = state.burner;
      // Zeitraffer so, dass AN/AUS innerhalb weniger Echtsekunden sichtbar wird
      let boost = 1;
      if (state.minPowerCycling || br.mode !== "on") boost = 3.2;
      if (state.brandId === "einaus" || (state.hystOverride != null && state.hystOverride <= 1.5)) {
        boost = Math.max(boost, 2.5);
      }
      // Aufheizen zum Ausschaltpunkt / Abkühlen zum Einschaltpunkt beschleunigen,
      // besonders bei Pmin oder wenn der Brenner hart auf Mindestleistung steht.
      const atMinMod =
        brand().modulating && br.mode === "on" && br.powerFrac <= brand().minMod + 0.03;
      if ((state.minPowerCycling || atMinMod) && br.mode === "on" && state.boilerT < offPreview) {
        const remain = offPreview - state.boilerT;
        boost = Math.max(boost, remain > 10 ? 11 : remain > 3 ? 6.5 : 4);
      }
      if ((state.minPowerCycling || br.mode === "off") && br.mode !== "on" && state.boilerT > onPreview) {
        const remain = state.boilerT - onPreview;
        boost = Math.max(boost, remain > 4 ? 7 : 4);
      }
      state.dtScaleBoost = boost;
      const dt = clamp(realDt, 0.016, 0.1) * state.dtScale * state.dtScaleBoost;
      state.simTime += dt;
      const flowSet = flowSetPreview;
      const hyd = hydraulics(dt);
      const { onAt, offAt } = updateBurner(dt, flowSet, hyd.heatExtractKw);
      updateBoiler(dt, hyd.totalLh, hyd.heatExtractKw);
      buildTips(hyd, onAt, offAt, flowSet);
      return snapshot(hyd, onAt, offAt, flowSet, predictCycling(hyd, onAt, offAt, flowSet));
    }

    function snapshot(hyd, onAt, offAt, flowSet, cyclingPred) {
      const br = state.burner;
      let modeLabel = "AUS";
      if (br.mode === "igniting") modeLabel = "ZÜNDET";
      else if (br.mode === "on")
        modeLabel = brand().modulating && br.powerFrac < 0.95 ? "MODULIERT" : "BRENNT";

      const pred =
        cyclingPred ||
        predictCycling(hyd || { heatExtractKw: 0, flows: {} }, onAt, offAt, flowSet);

      return {
        outdoor: state.outdoor,
        slope: state.slope,
        shift: state.shift,
        diameterMm: state.diameterMm,
        lengthMul: state.lengthMul,
        balance: state.balance,
        pumpHeadM: state.pumpHeadM,
        burnerPowerKw: state.burnerPowerKw,
        brandId: state.brandId,
        brand: brand(),
        hysteresis: hysteresisK(),
        flowSet,
        onAt,
        offAt,
        boilerT: state.boilerT,
        returnHeaderT: state.returnHeaderT,
        boilerVolumeL: BOILER_VOLUME_L,
        circuitVolumeL: state.circuitVolumeL || circuitVolumeLiters(),
        systemDeltaP: state.systemDeltaP,
        burnerMode: modeLabel,
        burnerFrac: br.powerFrac,
        startsHour: br.starts.length,
        cyclingPred: pred,
        minPowerCycling: state.minPowerCycling,
        lastLoadKw: state.lastLoadKw,
        lastMinKw: state.lastMinKw,
        cycleLog: br.cycleLog.slice(),
        simTime: state.simTime,
        physicsNote: state.physicsNote,
        rooms: {
          living: { ...state.rooms.living },
          bath: { ...state.rooms.bath },
          bed: { ...state.rooms.bed },
        },
        flows: hyd?.flows || { living: 0, bath: 0, bed: 0 },
        totalLh: hyd?.totalLh || 0,
        tips: state.tips,
      };
    }

    function setControls(partial) {
      const { rooms: roomPatch, ...rest } = partial || {};
      Object.assign(state, rest);
      if (roomPatch) {
        for (const k of Object.keys(roomPatch)) {
          if (!state.rooms[k]) state.rooms[k] = createRoomState({});
          const patch = { ...roomPatch[k] };
          if (patch.radType && RADIATOR_TYPES[patch.radType]) {
            const t = RADIATOR_TYPES[patch.radType];
            if (patch.n == null) patch.n = t.n;
            // Wenn Typ wechselt und qn nicht explizit: Default des Typs
            if (patch.qn == null && state.rooms[k].radType !== patch.radType) {
              patch.qn = t.defaultQn;
            }
          }
          Object.assign(state.rooms[k], patch);
        }
      }
    }

    function resetBurnerAndTemps() {
      state.boilerT = 42;
      state.returnHeaderT = 36;
      state.burner = {
        mode: "off",
        powerFrac: 0,
        igniteLeft: 0,
        runTime: 0,
        lockLeft: 0,
        starts: [],
        cycleLog: [],
      };
      for (const k of Object.keys(state.rooms)) {
        const r = state.rooms[k];
        r.pipeSupplyT = r.tRoom + 6;
        r.pipeReturnT = r.tRoom + 3;
        r.tIn = r.pipeSupplyT;
        r.tOut = r.pipeReturnT;
        r.spread = 3;
      }
    }

    function applyScenario(id) {
      if (id === "taktend") {
        // Vitodens 100: Übergangsbetrieb / kleine Last → Pmin nicht abführbar → Takten
        setControls({
          brandId: "viessmann",
          hystOverride: 1.5,
          burnerPowerKw: 19,
          outdoor: 8,
          slope: 1.15,
          shift: 0,
          balance: 85,
          diameterMm: 15,
          lengthMul: 1,
          rooms: {
            living: { tSet: 20, loadW: 500, radType: "panel22", qn: 1200 },
            bath: { tSet: 22, loadW: 250, radType: "bath", qn: 500 },
            bed: { tSet: 18, loadW: 350, radType: "panel11", qn: 800 },
          },
        });
        const fs = flowSetpoint();
        const hyst = hysteresisK();
        // Kurz unter Ausschaltpunkt starten → erster AUS kommt sofort
        state.boilerT = fs + hyst / 2 - 0.4;
        state.returnHeaderT = fs - 10;
        for (const k of Object.keys(state.rooms)) {
          const r = state.rooms[k];
          r.tRoom = r.tSet + 0.2;
          r.pipeSupplyT = fs - 2;
          r.pipeReturnT = fs - 9;
          r.tIn = r.pipeSupplyT;
          r.tOut = r.pipeReturnT;
        }
        state.burner = {
          mode: "on",
          powerFrac: 0.2,
          igniteLeft: 0,
          runTime: 60,
          lockLeft: 0,
          starts: [state.simTime],
          cycleLog: [{ t: state.simTime - 40, on: true, power: 0.2 }],
        };
        state.minPowerCycling = true;
      } else if (id === "kalt-lang") {
        setControls({
          brandId: "viessmann",
          hystOverride: null,
          balance: 5,
          diameterMm: 12,
          lengthMul: 1.8,
          outdoor: -5,
          slope: 1.5,
          shift: 0,
          burnerPowerKw: 18,
          rooms: {
            living: { tSet: 22, loadW: 1600, radType: "panel33", qn: 2200 },
            bath: { tSet: 24, loadW: 800, radType: "bath", qn: 600 },
            bed: { tSet: 20, loadW: 2000, radType: "panel11", qn: 900 },
          },
        });
      } else if (id === "abgleich") {
        setControls({
          balance: 95,
          diameterMm: 16,
          lengthMul: 1.0,
          hystOverride: null,
          brandId: "buderus",
          outdoor: 0,
        });
      } else if (id === "fussboden") {
        setControls({
          outdoor: 0,
          slope: 0.8,
          shift: -2,
          brandId: "viessmann",
          rooms: {
            living: { radType: "underfloor", qn: 2200, tSet: 21, loadW: 1800 },
            bath: { radType: "bath", qn: 700, tSet: 24, loadW: 900 },
            bed: { radType: "underfloor", qn: 1600, tSet: 18, loadW: 1400 },
          },
        });
      } else {
        setControls({
          outdoor: 0,
          slope: 1.4,
          shift: 0,
          diameterMm: 15,
          lengthMul: 1,
          balance: 20,
          burnerPowerKw: 18,
          brandId: "viessmann",
          hystOverride: null,
          pumpHeadM: 5.5,
          rooms: {
            living: { tSet: 21, loadW: 1800, radType: "panel22", qn: 1800, n: 1.3 },
            bath: { tSet: 24, loadW: 900, radType: "bath", qn: 800, n: 1.25 },
            bed: { tSet: 18, loadW: 1400, radType: "panel11", qn: 1200, n: 1.3 },
          },
        });
        resetBurnerAndTemps();
      }
    }

    return {
      BRANDS,
      ROOMS,
      RADIATOR_TYPES,
      step,
      setControls,
      applyScenario,
      getState: () => state,
      flowSetpoint,
      hysteresisK,
      snapshot: () => {
        const flowSet = flowSetpoint();
        const hyst = hysteresisK();
        return snapshot(
          { flows: { living: 0, bath: 0, bed: 0 }, totalLh: 0, heatExtractKw: 0 },
          flowSet - hyst / 2,
          flowSet + hyst / 2,
          flowSet
        );
      },
    };
  }

  window.HeizungSim = {
    createSim,
    BRANDS,
    ROOMS,
    RADIATOR_TYPES,
    heatingCurveFlowSet,
    BOILER_VOLUME_L,
    darcyPressurePa,
    deltaTm,
  };
})();
