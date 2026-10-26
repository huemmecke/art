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
  /** Auslegungs-Außentemperatur für UA = Last / (tSoll − tAussen,Auslegung) */
  const DESIGN_OUTDOOR = -12;
  /** Hydraulische Zielspreizung für Volumenstrom aus Wärmeleistung */
  const TARGET_SPREAD_K = 10;
  /** Protokoll behalten: genug Sim-Zeit, damit Hysterese-Änderungen sichtbar bleiben */
  const CYCLE_KEEP_SEC = 7200; // 2 h Simulationszeit
  const CYCLE_KEEP_MAX = 240; // max. Modus-Segmente
  const MARK_KEEP_MAX = 48;

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
      thermoOpen: 0.5,
      valveOpen: 0.5,
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
        bath: createRoomState({ tSet: 24, loadW: 900, radType: "bath", qn: 1100, tRoom: 21 }),
        bed: createRoomState({ tSet: 18, loadW: 1400, radType: "panel11", qn: 1400, tRoom: 17.5 }),
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
        marks: [],
      },
      tips: [],
      simTime: 0,
      dtScale: 12,
      /** wird bei Takten erhöht, damit AN/AUS in Echtzeit sichtbar ist */
      dtScaleBoost: 1,
      physicsNote: "EN-442 · UA-Verlust · Ziel-Spreizung 10 K · Raum-C",
      /** true wenn Last < Brenner-Mindestleistung → muss takten */
      minPowerCycling: false,
      lastLoadKw: 0,
      lastMinKw: 0,
      buildingLossKw: 0,
      roomDeficitK: 0,
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

    /** Wärmeverlustkoeffizient: Last ist Auslegungsverlust bei tSoll/−12 °C */
    function roomUA(room) {
      const dT = Math.max(room.tSet - DESIGN_OUTDOOR, 8);
      return room.loadW / dT; // W/K
    }

    /** Raum-Wärmekapazität — realistisch träge, aber in Sim×12 noch in wenigen Minuten beobachtbar */
    function roomCapacityJperK(room) {
      const type = radType(room);
      const base = type.preferLowFlow ? 4.2e5 : 2.6e5; // J/K
      return base * (0.75 + room.loadW / 2600);
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
      // Thermostatventil: unter Soll weiter auf, nahe/über Soll zu
      const thermoOpen = clamp(err / 2.0 + 0.3, 0.02, 1);
      room.thermoOpen = thermoOpen;
      room.valveOpen = clamp(preset * thermoOpen, 0.02, 1);
      return room.valveOpen;
    }

    /**
     * Hydraulik: Volumenstrom aus Wärmebedarf bei Ziel-Spreizung ~10 K,
     * Verteilung über Ventil-Leitwerte + Darcy.
     */
    function hydraulics(dt) {
      state.circuitVolumeL = circuitVolumeLiters();
      const pumpPa = state.pumpHeadM * RHO * G;
      const outdoor = state.outdoor;

      const flows = {};
      let totalLh = 0;
      let buildingLossW = 0;
      let deficitSum = 0;
      let valveSum = 0;

      for (const k of Object.keys(ROOMS)) {
        const room = state.rooms[k];
        const ua = roomUA(room);
        room.ua = ua;
        room.lossW = ua * Math.max(room.tRoom - outdoor, 0);
        buildingLossW += room.lossW;
        deficitSum += Math.max(room.tSet - room.tRoom, 0);
        valveConductance(k);
        valveSum += room.valveOpen || 0.02;
      }
      const nRooms = Object.keys(ROOMS).length;
      const roomDeficitK = deficitSum / nRooms;
      const avgValve = valveSum / nRooms;

      // Bedarf: aktueller UA-Verlust + Anteil Untertemperatur (Aufheizen)
      const demandW = buildingLossW + roomDeficitK * 420 * nRooms;
      const heatFlowLh = (Math.max(demandW, 350) / (CP * TARGET_SPREAD_K)) * 3600;
      // etwas mehr ṁ wenn Ventile weit offen (weniger Spreizung), weniger wenn zu
      const valveFlowMul = lerp(0.55, 1.15, avgValve);

      for (let iter = 0; iter < 4; iter++) {
        let sumCond = 0;
        const cond = {};
        for (const k of Object.keys(ROOMS)) {
          const meta = ROOMS[k];
          const room = state.rooms[k];
          const lengthM = meta.lengthM * state.lengthMul;
          const guess = flows[k] || Math.max(heatFlowLh / nRooms, 40);
          const dpPipe = darcyPressurePa(lengthM, state.diameterMm, guess);
          const kv = Math.max(room.valveOpen || valveConductance(k), 0.02);
          const dpValve = (80000 / (kv * kv)) * Math.pow(guess / 200, 2);
          const dp = dpPipe + dpValve;
          room.deltaP = dp;
          cond[k] = kv / Math.sqrt(Math.max(dpPipe / 1000 + 1 / (kv * kv), 0.2));
          sumCond += cond[k];
        }

        const avgDp =
          Object.keys(ROOMS).reduce((s, k) => s + (state.rooms[k].deltaP || 0), 0) / nRooms;
        const pumpFactor = clamp(1 - avgDp / (pumpPa * 1.35), 0.12, 1);
        const pumpCapLh = 750 * pumpFactor * Math.pow(state.diameterMm / 15, 1.5);
        totalLh = clamp(heatFlowLh * valveFlowMul, 45, pumpCapLh);
        for (const k of Object.keys(ROOMS)) {
          flows[k] = sumCond > 0 ? (cond[k] / sumCond) * totalLh : 0;
        }
      }

      state.systemDeltaP = Object.keys(ROOMS).reduce((s, k) => s + (state.rooms[k].deltaP || 0), 0) / nRooms;
      state.buildingLossKw = buildingLossW / 1000;
      state.roomDeficitK = roomDeficitK;

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

        // EN-442 + ṁ·cp·ΔT
        let tOutGuess = room.tOut;
        let emitterW = 0;
        for (let j = 0; j < 3; j++) {
          const dtm = deltaTm(room.tIn, tOutGuess, room.tRoom);
          const dtn = 50; // Norm 75/65/20
          const ratio = clamp(dtm / dtn, 0, 1.4);
          emitterW = room.qn * Math.pow(ratio, room.n || type.n);
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

        // Raum: C·dT = (Q_HK − UA·ΔT)·dt
        const lossW = room.lossW || 0;
        const netW = emitterW - lossW;
        const C = roomCapacityJperK(room);
        room.capacityJperK = C;
        room.tRoom = clamp(room.tRoom + (netW * dt) / C, outdoor + 0.5, 34);

        returnMix += room.pipeReturnT * flowLh;
        flowWeight += flowLh;
        heatExtractKw += emitterW / 1000;
        room.flowLh = flowLh;
      }

      const tReturnMix = flowWeight > 0 ? returnMix / flowWeight : state.returnHeaderT;
      const tauHeader = clamp((RETURN_HEADER_L / Math.max(totalLh, 40)) * 3600, 5, 90);
      state.returnHeaderT = lerp(state.returnHeaderT, tReturnMix, 1 - Math.exp(-dt / tauHeader));

      return {
        totalLh,
        flows,
        tReturn: state.returnHeaderT,
        heatExtractKw,
        buildingLossKw: state.buildingLossKw,
        roomDeficitK,
      };
    }

    function trimCycleHistory() {
      const br = state.burner;
      const log = br.cycleLog;
      const marks = br.marks || (br.marks = []);
      while (log.length > CYCLE_KEEP_MAX) log.shift();
      while (log.length > 2 && state.simTime - log[0].t > CYCLE_KEEP_SEC) log.shift();
      while (marks.length > MARK_KEEP_MAX) marks.shift();
      while (marks.length && state.simTime - marks[0].t > CYCLE_KEEP_SEC) marks.shift();
    }

    function markEvent(kind, label, value) {
      const br = state.burner;
      if (!br.marks) br.marks = [];
      const last = br.marks[br.marks.length - 1];
      // Slider-Ziehen / identische Marker: letzten Eintrag aktualisieren statt Flut
      if (last && last.kind === kind && state.simTime - last.t < 8) {
        last.t = state.simTime;
        last.label = label;
        last.value = value;
        return;
      }
      br.marks.push({ t: state.simTime, kind, label, value });
      trimCycleHistory();
    }

    /**
     * Ein Protokoll-Eintrag pro Brenner-Modus (off | igniting | on).
     * Leistungswechsel während „on“ ändern nur power/tEnd — keine Schein-Zyklen.
     */
    function syncCycleLog() {
      const br = state.burner;
      const mode = br.mode;
      const firing = mode === "on";
      const power = firing ? br.powerFrac : 0;
      const log = br.cycleLog;
      const last = log[log.length - 1];
      if (!last || last.mode !== mode) {
        log.push({
          t: state.simTime,
          tEnd: state.simTime,
          mode,
          on: firing,
          power,
        });
      } else {
        last.power = power;
        last.tEnd = state.simTime;
      }
      trimCycleHistory();
    }

    function updateBurner(dt, flowSet, heatExtractKw) {
      const b = brand();
      const hyst = hysteresisK();
      const onAt = flowSet - hyst / 2;
      const offAt = flowSet + hyst / 2;
      const br = state.burner;
      const lossKw = Math.max(0, (state.boilerT - state.outdoor) * 0.01);
      // Last für Modulation: max(Extract, Gebäudeverlust + Untertemperatur-Aufruf)
      // → kalte Räume fordern Wärme, auch wenn Extract momentan noch niedrig ist
      const buildingKw = Math.max(state.buildingLossKw || 0, 0);
      const deficitKw = Math.max(state.roomDeficitK || 0, 0) * 0.55;
      const callKw = buildingKw + deficitKw;
      const loadKw = Math.max((heatExtractKw || 0) + lossKw, callKw, 0.02);
      const minKw = b.modulating ? state.burnerPowerKw * b.minMod : state.burnerPowerKw;
      const maxKw = state.burnerPowerKw;
      // Vitodens-Logik: unter Pmin kann Leistung nicht weiter abgesenkt werden → Takten
      // Nur takten, wenn weder Extract noch Gebäudebedarf Pmin brauchen
      const cannotShed = b.modulating && loadKw < minKw * 0.95 && (state.roomDeficitK || 0) < 1.2;
      state.minPowerCycling = cannotShed;
      state.lastLoadKw = loadKw;
      state.lastMinKw = minKw;

      br.starts = br.starts.filter((t) => state.simTime - t < 3600);
      if (br.lockLeft > 0) br.lockLeft = Math.max(0, br.lockLeft - dt);

      if (br.mode === "igniting") {
        br.igniteLeft -= dt;
        br.powerFrac = 0;
        if (br.igniteLeft <= 0) {
          br.mode = "on";
          br.runTime = 0;
          // Start: bei Unterlast sofort auf Mindestleistung (nicht „sanft darunter“)
          br.powerFrac = b.modulating ? (cannotShed ? b.minMod : Math.max(b.minMod, loadKw / maxKw)) : 1;
        }
        syncCycleLog();
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
            // Last im Modulationsfenster: Gebäudebedarf + Kessel-Soll nachführen
            want = clamp(loadKw / maxKw, b.minMod, 1);
            const band = Math.max(hyst, 1);
            const trim = clamp((flowSet - state.boilerT) / (band * 2.5), -0.06, 0.35);
            want = clamp(want + trim, b.minMod, 1);
            // Deutliche Raumuntertemperatur → nicht auf Pmin kleben
            if ((state.roomDeficitK || 0) > 2) {
              want = Math.max(want, clamp(0.45 + state.roomDeficitK / 8, b.minMod, 1));
            }
          }
        }
        br.powerFrac = lerp(br.powerFrac, want, clamp(b.ramp * (dt / 10), 0.05, 1));
        // Nie unter Mindestmodulation (außer Aus)
        if (b.modulating) br.powerFrac = Math.max(br.powerFrac, b.minMod);

        // Abschalten an Hysterese — auch bei Raumdefizit (Wasser speichert; Brenner startet wieder)
        if (br.runTime >= b.minRun && state.boilerT >= offAt) {
          br.mode = "off";
          br.powerFrac = 0;
          br.lockLeft = b.lockout;
        }
        syncCycleLog();
        return { onAt, offAt };
      }

      br.powerFrac = 0;
      if (state.boilerT <= onAt && br.lockLeft <= 0) {
        br.mode = "igniting";
        br.igniteLeft = b.ignition;
        br.starts.push(state.simTime);
      }
      syncCycleLog();
      return { onAt, offAt };
    }

    function updateBoiler(dt, totalLh, heatExtractKw) {
      const inputKw = state.burner.powerFrac * state.burnerPowerKw;
      const lossKw = Math.max(0, (state.boilerT - state.outdoor) * 0.01);
      const extractKw = Math.max(heatExtractKw || 0, 0);
      const massKg = BOILER_VOLUME_L;
      const mDot = Math.max(totalLh, 1) / 3600; // kg/s

      // Energiebilanz: m·cp·dT = P_brenner·dt + ṁ·cp·(T_rl − T_kessel)·dt − P_verlust·dt
      // Nur bei klarer Unterschreitung von Pmin dämpfen wir die RL-Kühlung leicht,
      // damit Mindestleistung den Ausschaltpunkt erreichen kann (Lernmodell).
      const deepUnderMin =
        state.minPowerCycling && state.lastMinKw > 0 && state.lastLoadKw < state.lastMinKw * 0.75;
      const mixGain = deepUnderMin ? 0.55 : 1.0;
      const dTFlow =
        ((mDot * (state.returnHeaderT - state.boilerT)) / massKg) * dt * mixGain;
      const dTBurn = (inputKw * 1000 * dt) / (massKg * CP);
      const dTLoss = (lossKw * 1000 * dt) / (massKg * CP);

      let next = state.boilerT + dTBurn + dTFlow - dTLoss;

      if (deepUnderMin && inputKw > 0) {
        const surplusKw = Math.max(inputKw - extractKw - lossKw, inputKw * 0.25);
        const dTSurplus = (surplusKw * 1000 * dt) / (massKg * CP);
        next = Math.max(next, state.boilerT + dTSurplus * 0.7);
      }

      state.boilerT = clamp(next, state.outdoor + 1, 88);
    }

    function isFireMode(modeOrEntry) {
      const m = typeof modeOrEntry === "string" ? modeOrEntry : modeOrEntry?.mode;
      if (m) return m === "on";
      return !!(modeOrEntry && modeOrEntry.on);
    }

    /**
     * Gemessene Taktung aus Modus-Wechseln (on ↔ nicht-on) im cycleLog.
     * Nur die jüngsten Perioden — sonst bleibt nach Hysterese-Änderung die alte Rate kleben.
     */
    function measureRecentCycling() {
      const tNow = state.simTime;
      const log = state.burner.cycleLog;
      if (!log.length) return null;

      const offEdges = [];
      let tonSamples = [];
      let toffSamples = [];
      for (let i = 1; i < log.length; i++) {
        const prev = log[i - 1];
        const cur = log[i];
        const prevFire = isFireMode(prev);
        const curFire = isFireMode(cur);
        const dur = cur.t - prev.t;
        if (dur <= 0 || dur > 1800) continue;
        if (prevFire && !curFire) {
          offEdges.push(cur.t);
          tonSamples.push(dur);
        }
        if (!prevFire && curFire) {
          toffSamples.push(dur);
        }
      }

      const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      const lastN = (arr, n) => arr.slice(Math.max(0, arr.length - n));

      const periods = [];
      for (let i = 1; i < offEdges.length; i++) {
        periods.push(offEdges[i] - offEdges[i - 1]);
      }
      const recentPeriods = lastN(periods, 3);
      if (recentPeriods.length >= 1) {
        const periodSec = avg(recentPeriods);
        return {
          startsPerHour: clamp(3600 / Math.max(periodSec, 1), 0, 80),
          tonSec: avg(lastN(tonSamples, 3)),
          toffSec: avg(lastN(toffSamples, 3)),
          periodSec,
          samples: recentPeriods.length,
        };
      }

      const starts = state.burner.starts.filter((t) => tNow - t < 600);
      if (starts.length >= 2) {
        const recent = lastN(starts, 4);
        const span = Math.max(recent[recent.length - 1] - recent[0], 1);
        const periodSec = span / Math.max(recent.length - 1, 1);
        return {
          startsPerHour: clamp(3600 / periodSec, 0, 80),
          tonSec: avg(lastN(tonSamples, 3)),
          toffSec: avg(lastN(toffSamples, 3)),
          periodSec,
          samples: recent.length,
        };
      }
      return null;
    }

    /** Messwerte zur Selbstprüfung: Log ↔ Brennerzustand, Starts, Band */
    function buildDiagnostics(hyd, onAt, offAt, flowSet, pred) {
      const br = state.burner;
      const log = br.cycleLog;
      const last = log[log.length - 1] || null;
      const mode = br.mode;
      const logMatchesMode = !last || last.mode === mode;
      const logOnMatchesFire = !last || last.on === (mode === "on");
      let firePhases = 0;
      for (let i = 1; i < log.length; i++) {
        if (isFireMode(log[i]) && !isFireMode(log[i - 1])) firePhases += 1;
      }
      if (log.length && isFireMode(log[0])) firePhases += 1;
      const mismatches = [];
      if (!logMatchesMode) mismatches.push("log.mode≠burner.mode");
      if (!logOnMatchesFire) mismatches.push("log.on≠(mode===on)");
      if (mode === "on" && br.powerFrac <= 0) mismatches.push("on but power=0");
      if (mode === "off" && br.powerFrac > 0) mismatches.push("off but power>0");
      if (pred?.kind === "hold" && br.starts.length >= 3) mismatches.push("pred=hold but starts≥3");

      return {
        ok: mismatches.length === 0,
        mismatches,
        simTime: state.simTime,
        mode,
        modeLabel:
          mode === "igniting" ? "ZÜNDET" : mode === "on" ? (br.powerFrac < 0.95 ? "MODULIERT" : "BRENNT") : "AUS",
        powerFrac: br.powerFrac,
        boilerT: state.boilerT,
        returnT: state.returnHeaderT,
        flowSet,
        onAt,
        offAt,
        bandK: Math.max(offAt - onAt, 0),
        loadKw: state.lastLoadKw,
        minKw: state.lastMinKw,
        extractKw: hyd?.heatExtractKw || 0,
        minPowerCycling: state.minPowerCycling,
        dtScale: state.dtScale,
        dtScaleBoost: state.dtScaleBoost,
        startsHour: br.starts.length,
        logLen: log.length,
        logSpanSec: log.length ? Math.max(0, state.simTime - log[0].t) : 0,
        logKeepSec: CYCLE_KEEP_SEC,
        marks: (br.marks || []).length,
        logLast: last
          ? { t: last.t, tEnd: last.tEnd, mode: last.mode, on: last.on, power: last.power }
          : null,
        firePhases,
        predKind: pred?.kind || null,
        predSource: pred?.source || null,
        predStarts: pred?.startsPerHour ?? null,
        predLabel: pred?.label || null,
      };
    }

    function taktLabel(startsPerHour) {
      if (startsPerHour >= 6) return { level: "bad", label: "starkes Takten" };
      if (startsPerHour >= 3) return { level: "warn", label: "grenzwertig" };
      if (startsPerHour >= 1.2) return { level: "warn", label: "leichtes Takten" };
      return { level: "ok", label: "selten" };
    }

    /**
     * Prognose der Taktung: Messung hat Vorrang vor „Last ≥ Pmin → kaum Takten“.
     * Analytisch: ton/toff ≈ (m·cp·Band) / P_netto — Band = Hysterese.
     */
    function predictCycling(hyd, onAt, offAt, flowSet) {
      const b = brand();
      const band = Math.max(offAt - onAt, 0.5);
      const extractKw = Math.max(hyd.heatExtractKw || 0, 0.05);
      const lossKw = Math.max(0, (flowSet - state.outdoor) * 0.01);
      const loadKw = extractKw + lossKw;
      const capJperK = BOILER_VOLUME_L * CP; // J/K
      const energyBandJ = capJperK * band;

      const minKw = b.modulating ? state.burnerPowerKw * b.minMod : state.burnerPowerKw;
      const maxKw = state.burnerPowerKw;
      const measured = measureRecentCycling();
      const measuredBusy = measured && measured.startsPerHour >= 1.5;

      // Überlast: auch Vollast reicht nicht → läuft durch
      if (loadKw > maxKw * 1.08 && !measuredBusy) {
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
          source: "analytic",
          label: "Dauerfeuer",
          detail: `Last ${loadKw.toFixed(1)} kW > Brenner ${maxKw.toFixed(1)} kW — Ausschaltpunkt kaum erreichbar (Unterversorgung).`,
        };
      }

      // Analytische Taktzeiten (immer mit aktuellem Hysterese-Band)
      const fireKw = b.modulating ? Math.max(minKw, loadKw < minKw ? minKw : loadKw) : maxKw;
      const underMin = b.modulating && loadKw < minKw * 0.98;
      const netHeatKw = underMin
        ? Math.max(minKw - loadKw, 0.08)
        : Math.max(0.12, maxKw * 0.04); // leichter Overshoot-Rest wenn „im Fenster“
      const coolKw = Math.max(loadKw, 0.08);
      let tonSecA = energyBandJ / (netHeatKw * 1000);
      let toffSecA = energyBandJ / (coolKw * 1000);
      tonSecA = Math.max(tonSecA, b.minRun || 0);
      toffSecA = Math.max(toffSecA, b.lockout || 0);
      const periodA = tonSecA + toffSecA;
      const startsA = clamp(3600 / Math.max(periodA, 1), 0, 60);

      // Messung schlägt Theorie, wenn der Brenner nachweislich taktet
      if (measuredBusy) {
        const sph = measured.startsPerHour;
        const { level, label } = taktLabel(sph);
        const ton = measured.tonSec ?? tonSecA;
        const toff = measured.toffSec ?? toffSecA;
        const why = underMin
          ? `Pmin ${minKw.toFixed(1)} kW > Last ${loadKw.toFixed(1)} kW`
          : `Last ~Pmin — Overshoot im Band`;
        return {
          kind: "cycling",
          level,
          startsPerHour: sph,
          tonSec: ton,
          toffSec: toff,
          periodSec: measured.periodSec ?? ton + toff,
          loadKw,
          bandK: band,
          minKw,
          source: "measured",
          label,
          detail: `Gemessen ≈ ${sph.toFixed(1)} Starts/h bei ${band.toFixed(1)} K Hysterese (${why}). Größere Hysterese → weniger Starts.`,
        };
      }

      // Stabiles Modulationsfenster nur mit Abstand zu Pmin und ohne gemessene Starts
      if (b.modulating && loadKw >= minKw * 1.08 && loadKw <= maxKw * 1.05) {
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
          source: "analytic",
          label: "kaum Takten",
          detail: `Last ${loadKw.toFixed(1)} kW klar über Pmin ${minKw.toFixed(1)} kW (${b.modRatioLabel || "Modulation"}) → Dauerbetrieb ~${modPct.toFixed(0)} %. Band ${band.toFixed(1)} K.`,
        };
      }

      // Unter Pmin oder Grenzbereich nahe Pmin → analytische Prognose inkl. Hysterese
      const { level, label } = taktLabel(startsA);
      const cause = underMin
        ? `Pmin ${minKw.toFixed(1)} kW > Last ${loadKw.toFixed(1)} kW — ${b.name} kann nicht weiter drosseln`
        : `Grenzbereich Last≈Pmin — Hysterese ${band.toFixed(1)} K bestimmt die Starts`;

      return {
        kind: "cycling",
        level,
        startsPerHour: startsA,
        tonSec: tonSecA,
        toffSec: toffSecA,
        periodSec: periodA,
        loadKw,
        bandK: band,
        minKw,
        source: "analytic",
        label,
        detail: `${cause} → An ~${Math.round(tonSecA)} s / Aus ~${Math.round(toffSecA)} s ≈ ${startsA.toFixed(1)} Starts/h (${label}).`,
      };
    }

    function buildTips(hyd, onAt, offAt, flowSet) {
      const tips = [];
      const starts = state.burner.starts.length;
      const flows = hyd.flows;
      const volRatio = state.circuitVolumeL / BOILER_VOLUME_L;

      tips.push({
        level: "ok",
        text: `Physik: EN-442, UA·(tRaum−tAussen), ṁ aus Ziel-ΔT ${TARGET_SPREAD_K} K, Raum-C. Gebäudeverlust ${(state.buildingLossKw || 0).toFixed(1)} kW · Raumdefizit ${(state.roomDeficitK || 0).toFixed(1)} K.`,
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
      const coldest = Object.values(state.rooms).sort(
        (a, b) => a.tRoom - a.tSet - (b.tRoom - b.tSet)
      )[0];
      if (coldest && coldest.tSet - coldest.tRoom > 0.8) {
        tips.push({
          level: "ok",
          text: `Thermostat: Ist ${coldest.tRoom.toFixed(1)} °C < Soll ${coldest.tSet.toFixed(1)} °C → Ventil ~${Math.round((coldest.valveOpen || 0) * 100)} % offen, Durchfluss steigt.`,
        });
      } else if (coldest && coldest.tRoom - coldest.tSet > 0.6) {
        tips.push({
          level: "ok",
          text: `Thermostat: Ist über Soll → Ventil drosselt (~${Math.round((coldest.thermoOpen || 0) * 100)} % Thermostatöffnung).`,
        });
      }
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
      const br = state.burner;
      // Fester, moderater Zeitraffer — kein Boost proportional zur Bandbreite,
      // sonst würde eine größere Hysterese in Echtzeit kaum langsamer wirken.
      let boost = 1;
      if (state.minPowerCycling || br.mode === "off" || br.mode === "igniting") boost = 2.4;
      if (state.brandId === "einaus") boost = Math.max(boost, 2.2);
      state.dtScaleBoost = boost;
      const dt = clamp(realDt, 0.016, 0.1) * state.dtScale * state.dtScaleBoost;
      state.simTime += dt;
      const flowSet = flowSetpoint();
      const hyd = hydraulics(dt);
      const { onAt, offAt } = updateBurner(dt, flowSet, hyd.heatExtractKw);
      updateBoiler(dt, hyd.totalLh, hyd.heatExtractKw);
      buildTips(hyd, onAt, offAt, flowSet);
      const pred = predictCycling(hyd, onAt, offAt, flowSet);
      state.diagnostics = buildDiagnostics(hyd, onAt, offAt, flowSet, pred);
      return snapshot(hyd, onAt, offAt, flowSet, pred);
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
      const diag =
        state.diagnostics ||
        buildDiagnostics(hyd || { heatExtractKw: 0 }, onAt, offAt, flowSet, pred);

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
        burnerRawMode: br.mode,
        burnerFrac: br.powerFrac,
        startsHour: br.starts.length,
        cyclingPred: pred,
        minPowerCycling: state.minPowerCycling,
        lastLoadKw: state.lastLoadKw,
        lastMinKw: state.lastMinKw,
        buildingLossKw: state.buildingLossKw,
        roomDeficitK: state.roomDeficitK,
        cycleLog: br.cycleLog.slice(),
        cycleMarks: (br.marks || []).slice(),
        cycleKeepSec: CYCLE_KEEP_SEC,
        diagnostics: diag,
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
      const prevHyst = hysteresisK();
      const prevBrand = state.brandId;
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
      const nextHyst = hysteresisK();
      if (Math.abs(nextHyst - prevHyst) >= 0.25) {
        markEvent("hyst", `Hyst ${nextHyst.toFixed(1)} K`, nextHyst);
      }
      if (rest.brandId != null && rest.brandId !== prevBrand) {
        markEvent("brand", brand().name.split(" ")[0], null);
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
        marks: [],
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
          cycleLog: [
            {
              t: state.simTime - 40,
              tEnd: state.simTime,
              mode: "on",
              on: true,
              power: 0.2,
            },
          ],
          marks: [],
        };
        state.minPowerCycling = true;
        syncCycleLog();
        markEvent("scenario", "Szenario: Takten", null);
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
            bath: { tSet: 24, loadW: 900, radType: "bath", qn: 1100, n: 1.25 },
            bed: { tSet: 18, loadW: 1400, radType: "panel11", qn: 1400, n: 1.3 },
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
