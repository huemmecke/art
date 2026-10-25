/**
 * Didaktisches Heizkreislauf-Modell (kein DIN-Auslegungstool).
 *
 * Kernlehrsatz: Die Gastherme erhitzt nur den kleinen Kesselinhalt.
 * Die Pumpe trägt dieses warme Wasser portionenweise in den Kreislauf.
 */
(function () {
  "use strict";

  const BRANDS = {
    viessmann: {
      name: "Viessmann (modulierend)",
      hint: "Weiches Modulieren, enge Hysterese, wenige Starts — typisch moderne Gasbrennwert.",
      hysteresis: 2.0,
      modulating: true,
      minMod: 0.18,
      ramp: 0.55,
      minRun: 45,
      lockout: 25,
      ignition: 2.5,
    },
    buderus: {
      name: "Buderus / Bosch (modulierend)",
      hint: "Stabiles Modulieren, etwas breitere Hysterese als Top-Sparsam.",
      hysteresis: 2.5,
      modulating: true,
      minMod: 0.2,
      ramp: 0.48,
      minRun: 50,
      lockout: 30,
      ignition: 2.8,
    },
    vaillant: {
      name: "Vaillant (modulierend)",
      hint: "Schnelle Reaktion, enge Bandbreite — bei falscher Kurve trotzdem Takten möglich.",
      hysteresis: 1.8,
      modulating: true,
      minMod: 0.16,
      ramp: 0.62,
      minRun: 40,
      lockout: 20,
      ignition: 2.2,
    },
    weishaupt: {
      name: "Weishaupt (klassisch)",
      hint: "Oft eher Stufen-/Ein-Aus-Charakter: Hysterese und Mindestlaufzeit entscheiden über Takten.",
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
      hint: "Reines Ein/Aus — ideal, um Hysterese und Starts/h zu begreifen.",
      hysteresis: 6.0,
      modulating: false,
      minMod: 1,
      ramp: 1,
      minRun: 60,
      lockout: 45,
      ignition: 3.0,
    },
  };

  const ROOMS = {
    living: { id: "living", label: "Wohnzimmer", lengthFactor: 0.55, baseKvOpen: 1.0, pipeVolL: 4 },
    bath: { id: "bath", label: "Bad", lengthFactor: 1.0, baseKvOpen: 1.0, pipeVolL: 8 },
    bed: { id: "bed", label: "Schlafzimmer", lengthFactor: 1.85, baseKvOpen: 1.0, pipeVolL: 14 },
  };

  /** Liter Kesselwasser — bewusst klein gegen den Kreislauf */
  const BOILER_VOLUME_L = 7;
  const RETURN_HEADER_L = 12;

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

  function createRoomState(tSet, loadW, tRoom) {
    return {
      tSet,
      loadW,
      tRoom,
      flowLh: 0,
      emitterW: 0,
      tIn: tRoom + 8,
      tOut: tRoom + 4,
      spread: 4,
      pipeSupplyT: tRoom + 6,
      pipeReturnT: tRoom + 3,
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
      rooms: {
        living: createRoomState(21, 1800, 19.5),
        bath: createRoomState(24, 900, 21),
        bed: createRoomState(18, 1400, 17.5),
      },
      /** Nur der kleine Kesselinhalt — nicht der ganze Kreislauf */
      boilerT: 42,
      returnHeaderT: 36,
      boilerVolumeL: BOILER_VOLUME_L,
      circuitVolumeL: 0,
      burner: {
        mode: "off",
        powerFrac: 0,
        igniteLeft: 0,
        runTime: 0,
        lockLeft: 0,
        starts: [],
        /** Zyklus-Historie für die Zeitachse [{t, on, power}] */
        cycleLog: [],
      },
      tips: [],
      simTime: 0,
      dtScale: 18,
      lastBurnerOn: false,
    };

    function brand() {
      return BRANDS[state.brandId] || BRANDS.viessmann;
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
      let pipeL = 0;
      for (const meta of Object.values(ROOMS)) {
        const lengthM = 8 * meta.lengthFactor * state.lengthMul;
        pipeL += area * lengthM * 1000; // m³ → L
        pipeL += meta.pipeVolL * state.lengthMul;
      }
      return pipeL + RETURN_HEADER_L + 18; // + Heizkörperwasser grob
    }

    function pipeResistance(lengthFactor) {
      const d = state.diameterMm / 15;
      const L = lengthFactor * state.lengthMul;
      return (L / Math.pow(Math.max(d, 0.55), 4.5)) * 1.15;
    }

    function roomConductance(roomKey) {
      const meta = ROOMS[roomKey];
      const room = state.rooms[roomKey];
      const bal = state.balance / 100;
      const natural = 1 / pipeResistance(meta.lengthFactor);
      const sharesSumApprox = Object.keys(ROOMS).reduce(
        (s, k) => s + 1 / pipeResistance(ROOMS[k].lengthFactor),
        0
      );
      const naturalNorm = natural / sharesSumApprox;
      const balancedKv = 1 / 3 / Math.max(naturalNorm, 0.05);
      const kv = lerp(1.0, balancedKv, bal) * meta.baseKvOpen;
      const err = room.tSet - room.tRoom;
      const thermoOpen = clamp(err / 2 + 0.35, 0.02, 1);
      const resistance = pipeResistance(meta.lengthFactor) / Math.max(kv * thermoOpen, 0.03);
      return 1 / resistance;
    }

    /**
     * Wärmetransport: Pumpe schiebt Kesselwasser in die Rohre.
     * Langer Strang = mehr Totzeit, Wärme kommt später an.
     */
    function hydraulics(dt) {
      state.circuitVolumeL = circuitVolumeLiters();

      const cond = {};
      let sum = 0;
      for (const k of Object.keys(ROOMS)) {
        cond[k] = roomConductance(k);
        sum += cond[k];
      }

      const avgRes =
        Object.keys(ROOMS).reduce((s, k) => s + pipeResistance(ROOMS[k].lengthFactor), 0) / 3;
      const pumpMaxLh = 900;
      const totalLh = pumpMaxLh / (1 + avgRes * 0.55);

      const flows = {};
      for (const k of Object.keys(ROOMS)) {
        flows[k] = sum > 0 ? (cond[k] / sum) * totalLh : 0;
      }

      const outdoor = state.outdoor;
      const cp = 4180;
      let returnMix = 0;
      let flowWeight = 0;
      let heatExtractKw = 0;

      for (const k of Object.keys(ROOMS)) {
        const meta = ROOMS[k];
        const room = state.rooms[k];
        const flowLh = flows[k];
        const mDot = flowLh / 3600;

        // Transportverzögerung Vorlauf: Rohvolumen / Volumenstrom
        const supplyVol = meta.pipeVolL * state.lengthMul * (15 / Math.max(state.diameterMm, 10));
        const tauSupply = clamp((supplyVol / Math.max(flowLh, 20)) * 3600, 8, 180);
        const alphaS = 1 - Math.exp(-dt / tauSupply);
        room.pipeSupplyT = lerp(room.pipeSupplyT, state.boilerT, alphaS);
        room.tIn = room.pipeSupplyT;

        // Heizkörper: Wärmeabgabe aus mittlerer Übertemperatur + Massenstrom
        const meanWater = (room.tIn + room.tOut) / 2;
        const deltaDrive = Math.max(meanWater - room.tRoom, 0);
        const maxSpread = clamp(room.tIn - room.tRoom - 1, 1, 25);
        let emitterW = Math.min(
          mDot * cp * maxSpread,
          deltaDrive * (95 + flowLh * 0.9)
        );
        if (flowLh < 15) emitterW *= flowLh / 15;

        // Spreizung aus Q = m·cp·ΔT
        const spread =
          mDot > 0.00005 ? clamp(emitterW / (mDot * cp), 0.5, maxSpread) : Math.min(2, maxSpread);
        room.tOut = room.tIn - spread;
        room.spread = spread;

        // Rücklauf-Rohr laggt etwas
        const tauRet = tauSupply * 0.85;
        const alphaR = 1 - Math.exp(-dt / tauRet);
        room.pipeReturnT = lerp(room.pipeReturnT, room.tOut, alphaR);

        const lossFactor = Math.max((room.tRoom - outdoor) / Math.max(room.tSet - outdoor, 4), 0.2);
        const netW = emitterW - room.loadW * lossFactor;
        room.tRoom = clamp(room.tRoom + (netW / 100) * 0.035 * (dt / 60), outdoor + 0.5, 34);

        returnMix += room.pipeReturnT * flowLh;
        flowWeight += flowLh;
        heatExtractKw += emitterW / 1000;
        room.flowLh = flowLh;
        room.emitterW = emitterW;
      }

      const tReturnMix = flowWeight > 0 ? returnMix / flowWeight : state.returnHeaderT;
      // Rücklaufsammler mischt, ehe Wasser zurück in den kleinen Kessel geht
      const tauHeader = clamp((RETURN_HEADER_L / Math.max(totalLh, 40)) * 3600, 5, 90);
      const alphaH = 1 - Math.exp(-dt / tauHeader);
      state.returnHeaderT = lerp(state.returnHeaderT, tReturnMix, alphaH);

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
      // behalte ~15 min Simulationszeit
      while (log.length > 2 && state.simTime - log[0].t > 900) log.shift();
    }

    function updateBurner(dt, flowSet, heatExtractKw) {
      const b = brand();
      const hyst = hysteresisK();
      const onAt = flowSet - hyst / 2;
      const offAt = flowSet + hyst / 2;
      const br = state.burner;

      br.starts = br.starts.filter((t) => state.simTime - t < 3600);
      if (br.lockLeft > 0) br.lockLeft = Math.max(0, br.lockLeft - dt);

      if (br.mode === "igniting") {
        br.igniteLeft -= dt;
        br.powerFrac = 0;
        logCycle(false, 0);
        if (br.igniteLeft <= 0) {
          br.mode = "on";
          br.runTime = 0;
          br.powerFrac = b.modulating ? Math.max(b.minMod, 0.4) : 1;
        }
        return { onAt, offAt };
      }

      if (br.mode === "on") {
        br.runTime += dt;
        let want;
        if (b.modulating) {
          const band = Math.max(hyst, 1);
          const err = flowSet - state.boilerT;
          want = clamp(0.35 + err / band, b.minMod, 1);
        } else {
          want = 1;
        }
        br.powerFrac = lerp(br.powerFrac, want, clamp(b.ramp * (dt / 10), 0.05, 1));
        logCycle(true, br.powerFrac);

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

    /**
     * Nur der kleine Kesselinhalt wird vom Brenner erhitzt.
     * Rücklaufwasser verdünnt ihn — Pumpe tauscht Volumen aus.
     */
    function updateBoiler(dt, totalLh, heatExtractKw) {
      const inputKw = state.burner.powerFrac * state.burnerPowerKw;
      const lossKw = Math.max(0, (state.boilerT - state.outdoor) * 0.01);

      // Volumenstrom durch den Kessel mischt Rücklauf ein
      const mixFrac = clamp((totalLh * (dt / 3600)) / BOILER_VOLUME_L, 0, 0.45);
      const afterMix = state.boilerT * (1 - mixFrac) + state.returnHeaderT * mixFrac;

      // Brennerleistung auf kleine Wassermasse → schnelle ΔT
      // Q = m·cp·ΔT → ΔT = Q·dt / (m·cp); m = 7 kg
      const massKg = BOILER_VOLUME_L;
      const dTBurn = (inputKw * 1000 * dt) / (massKg * 4180);
      const dTLoss = (lossKw * 1000 * dt) / (massKg * 4180);

      state.boilerT = clamp(afterMix + dTBurn - dTLoss, state.outdoor + 1, 88);
      void heatExtractKw; // Abgabe passiert an den Heizkörpern, nicht „aus dem Kessel abgezogen“
    }

    function buildTips(hyd, onAt, offAt, flowSet) {
      const tips = [];
      const starts = state.burner.starts.length;
      const flows = hyd.flows;
      const volRatio = state.circuitVolumeL / BOILER_VOLUME_L;

      tips.push({
        level: "ok",
        text: `Therme erhitzt nur ~${BOILER_VOLUME_L} L Kesselwasser — Kreislauf ≈ ${state.circuitVolumeL.toFixed(0)} L (≈${volRatio.toFixed(0)}×). Die Pumpe trägt die Wärme portionenweise hinaus.`,
      });

      if (state.burner.mode === "igniting") {
        tips.push({ level: "warn", text: "Brenner zündet … erst der Kessel wird heiß, Rohre noch kälter." });
      } else if (state.burner.mode === "on") {
        const pct = Math.round(state.burner.powerFrac * 100);
        const lagBed = state.boilerT - state.rooms.bed.tIn;
        tips.push({
          level: "ok",
          text: brand().modulating
            ? `Brenner ${pct} %: Kessel ${state.boilerT.toFixed(0)} °C. Langer Strang hinkt um ${Math.max(0, lagBed).toFixed(1)} K hinterher.`
            : `Brenner Vollast bis ${offAt.toFixed(1)} °C — Wärmewelle wandert erst danach durch die Rohre.`,
        });
      } else {
        tips.push({
          level: "ok",
          text: `Brenner aus (unter ${onAt.toFixed(1)} °C wieder an). Restwärme im Kreislauf kühlt über die Heizkörper ab.`,
        });
      }

      // Spreizung-Tipp
      const spLiving = state.rooms.living.spread;
      const spBed = state.rooms.bed.spread;
      if (spLiving < 4 && flows.living > flows.bed * 1.4) {
        tips.push({
          level: "warn",
          text: `Wohnzimmer-Spreizung nur ${spLiving.toFixed(1)} K (viel Durchfluss) — Schlafzimmer ${spBed.toFixed(1)} K. Typisch ohne Abgleich.`,
        });
      }

      if (starts >= 6) {
        tips.push({
          level: "bad",
          text: `${starts} Starts/h — Takten! Kleiner Kesselinhalt + enge Hysterese = viele Zyklen.`,
        });
      } else if (starts >= 3) {
        tips.push({
          level: "warn",
          text: `${starts} Starts/h — Grenzbereich. Zyklusband unten beobachten.`,
        });
      }

      if (state.balance < 40 && flows.living > flows.bed * 1.6) {
        tips.push({
          level: "bad",
          text: "Kurzer Strang stiehlt Durchfluss — Wärme kommt im Schlafzimmer spät/wenig an.",
        });
      }

      if (state.diameterMm <= 12 && state.lengthMul >= 1.4) {
        tips.push({
          level: "warn",
          text: "Dünnes Rohr + lange Wege → hoher Druckverlust, Volumenstrom bricht ein.",
        });
      }

      state.tips = tips.slice(0, 5);
    }

    function step(realDt) {
      const dt = clamp(realDt, 0.016, 0.1) * state.dtScale;
      state.simTime += dt;

      const flowSet = flowSetpoint();
      const hyd = hydraulics(dt);
      const { onAt, offAt } = updateBurner(dt, flowSet, hyd.heatExtractKw);
      updateBoiler(dt, hyd.totalLh, hyd.heatExtractKw);
      buildTips(hyd, onAt, offAt, flowSet);

      return snapshot(hyd, onAt, offAt, flowSet);
    }

    function snapshot(hyd, onAt, offAt, flowSet) {
      const br = state.burner;
      let modeLabel = "AUS";
      if (br.mode === "igniting") modeLabel = "ZÜNDET";
      else if (br.mode === "on")
        modeLabel = brand().modulating && br.powerFrac < 0.95 ? "MODULIERT" : "BRENNT";

      return {
        outdoor: state.outdoor,
        slope: state.slope,
        shift: state.shift,
        diameterMm: state.diameterMm,
        lengthMul: state.lengthMul,
        balance: state.balance,
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
        burnerMode: modeLabel,
        burnerFrac: br.powerFrac,
        startsHour: br.starts.length,
        cycleLog: br.cycleLog.slice(),
        simTime: state.simTime,
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
          if (!state.rooms[k]) state.rooms[k] = createRoomState(20, 1000, 20);
          Object.assign(state.rooms[k], roomPatch[k]);
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
        setControls({
          brandId: "einaus",
          hystOverride: 1.0,
          burnerPowerKw: 28,
          outdoor: 8,
          slope: 1.8,
          shift: 2,
          balance: 70,
        });
        state.boilerT = flowSetpoint();
        state.burner.cycleLog = [];
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
            living: { tSet: 22, loadW: 1600 },
            bath: { tSet: 24, loadW: 800 },
            bed: { tSet: 20, loadW: 2000 },
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
          rooms: {
            living: { tSet: 21, loadW: 1800 },
            bath: { tSet: 24, loadW: 900 },
            bed: { tSet: 18, loadW: 1400 },
          },
        });
        resetBurnerAndTemps();
      }
    }

    return {
      BRANDS,
      ROOMS,
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

  window.HeizungSim = { createSim, BRANDS, ROOMS, heatingCurveFlowSet, BOILER_VOLUME_L };
})();
