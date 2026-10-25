/**
 * Didaktisches Heizkreislauf-Modell (kein DIN-Auslegungstool).
 * Zeigt Zusammenhänge: Heizkurve, Hysterese/Taktung, Hydraulik, Abgleich.
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
    living: { id: "living", label: "Wohnzimmer", lengthFactor: 0.55, baseKvOpen: 1.0 },
    bath: { id: "bath", label: "Bad", lengthFactor: 1.0, baseKvOpen: 1.0 },
    bed: { id: "bed", label: "Schlafzimmer", lengthFactor: 1.85, baseKvOpen: 1.0 },
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function heatingCurveFlowSet(outdoor, slope, shift) {
    // Einfache Heizkurve: bei 20 °C außen → ~20 °C Vorlauf, bei -15 °C → hoch
    const designOutdoor = -12;
    const designFlow = 20 + slope * (20 - designOutdoor) * 1.55;
    const t = (20 - outdoor) / (20 - designOutdoor);
    const raw = 20 + t * (designFlow - 20);
    return clamp(raw + shift, 25, 75);
  }

  function createSim(initial) {
    const state = {
      outdoor: initial.outdoor ?? 0,
      slope: initial.slope ?? 1.4,
      shift: initial.shift ?? 0,
      diameterMm: initial.diameterMm ?? 15,
      lengthMul: initial.lengthMul ?? 1,
      balance: initial.balance ?? 20, // 0..100
      burnerPowerKw: initial.burnerPowerKw ?? 18,
      brandId: initial.brandId ?? "viessmann",
      hystOverride: initial.hystOverride ?? null,
      rooms: {
        living: { tSet: 21, loadW: 1800, tRoom: 19.5 },
        bath: { tSet: 24, loadW: 900, tRoom: 21 },
        bed: { tSet: 18, loadW: 1400, tRoom: 17.5 },
      },
      boilerT: 42,
      burner: {
        mode: "off", // off | igniting | on
        powerFrac: 0,
        igniteLeft: 0,
        runTime: 0,
        lockLeft: 0,
        starts: [],
      },
      tips: [],
      simTime: 0,
      dtScale: 18, // 1s realtime ≈ 18s Anlagenzeit — spürbare Dynamik
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

    function pipeResistance(lengthFactor) {
      const d = state.diameterMm / 15;
      const L = lengthFactor * state.lengthMul;
      // Δp ~ L / d^5 grob (Laminar/Faustformel für Lehre)
      return (L / Math.pow(Math.max(d, 0.55), 4.5)) * 1.15;
    }

    function roomConductance(roomKey) {
      const meta = ROOMS[roomKey];
      const room = state.rooms[roomKey];
      const bal = state.balance / 100;

      // Ohne Abgleich: kurze Stränge haben viel höheren Durchflussanteil
      const natural = 1 / pipeResistance(meta.lengthFactor);
      // Mit Abgleich: Voreinstellung drosselt kurze Stränge
      const targetShare = 1 / 3;
      const openShare = natural;
      const sharesSumApprox = Object.keys(ROOMS).reduce((s, k) => s + 1 / pipeResistance(ROOMS[k].lengthFactor), 0);
      const naturalNorm = openShare / sharesSumApprox;
      const balancedKv = targetShare / Math.max(naturalNorm, 0.05);
      const kv = lerp(1.0, balancedKv, bal) * meta.baseKvOpen;

      // Thermostat: P-Band ~2 K
      const err = room.tSet - room.tRoom;
      const thermoOpen = clamp(err / 2 + 0.35, 0.02, 1);

      const resistance = pipeResistance(meta.lengthFactor) / Math.max(kv * thermoOpen, 0.03);
      return 1 / resistance;
    }

    function hydraulics(dt) {
      const cond = {};
      let sum = 0;
      for (const k of Object.keys(ROOMS)) {
        cond[k] = roomConductance(k);
        sum += cond[k];
      }

      // Pumpenvolumenstrom sinkt mit Gesamtwiderstand / dünnen Rohren
      const avgRes =
        Object.keys(ROOMS).reduce((s, k) => s + pipeResistance(ROOMS[k].lengthFactor), 0) / 3;
      const pumpMaxLh = 900;
      const totalLh = pumpMaxLh / (1 + avgRes * 0.55);

      const flows = {};
      for (const k of Object.keys(ROOMS)) {
        flows[k] = sum > 0 ? (cond[k] / sum) * totalLh : 0;
      }

      const boilerT = state.boilerT;
      const outdoor = state.outdoor;
      let returnMix = 0;
      let flowWeight = 0;
      let heatExtractKw = 0;

      for (const k of Object.keys(ROOMS)) {
        const room = state.rooms[k];
        const mDot = flows[k] / 3600; // kg/s ≈ L/s
        const cp = 4180;
        // Heizkörper: Leistung ~ Massenstrom * Spreizung, begrenzt durch Übertemperatur
        const deltaDrive = Math.max(boilerT - room.tRoom, 0);
        const emitterW = Math.min(
          mDot * cp * Math.min(deltaDrive * 0.55, 18),
          deltaDrive * 120 + flows[k] * 1.8
        );
        const netW = emitterW - room.loadW * Math.max((room.tRoom - outdoor) / Math.max(room.tSet - outdoor, 4), 0.25);
        // Raumkapazität ~ 0.05 K pro 100 W · Minute
        const dT = (netW / 100) * 0.035 * (dt / 60);
        room.tRoom = clamp(room.tRoom + dT, outdoor + 0.5, 32);

        const returnT = boilerT - Math.min(15, emitterW / Math.max(mDot * cp, 1));
        returnMix += returnT * flows[k];
        flowWeight += flows[k];
        heatExtractKw += emitterW / 1000;

        room.flowLh = flows[k];
        room.emitterW = emitterW;
      }

      const tReturn = flowWeight > 0 ? returnMix / flowWeight : boilerT - 5;
      return { totalLh, flows, tReturn, heatExtractKw };
    }

    function updateBurner(dt, flowSet, heatExtractKw) {
      const b = brand();
      const hyst = hysteresisK();
      const onAt = flowSet - hyst / 2;
      const offAt = flowSet + hyst / 2;
      const br = state.burner;

      // Starts in letzter Simulationsstunde
      br.starts = br.starts.filter((t) => state.simTime - t < 3600);

      if (br.lockLeft > 0) br.lockLeft = Math.max(0, br.lockLeft - dt);
      if (br.mode === "igniting") {
        br.igniteLeft -= dt;
        br.powerFrac = 0;
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
          // unter Soll → mehr Leistung
          const err = flowSet - state.boilerT;
          want = clamp(0.35 + err / band, b.minMod, 1);
        } else {
          want = 1;
        }
        br.powerFrac = lerp(br.powerFrac, want, clamp(b.ramp * (dt / 10), 0.05, 1));

        const canStop = br.runTime >= b.minRun;
        if (canStop && state.boilerT >= offAt) {
          br.mode = "off";
          br.powerFrac = 0;
          br.lockLeft = b.lockout;
        }
        return { onAt, offAt };
      }

      // off
      br.powerFrac = 0;
      const needHeat = state.boilerT <= onAt || (heatExtractKw > 0.4 && state.boilerT < flowSet - 0.3);
      if (needHeat && br.lockLeft <= 0 && state.boilerT <= onAt + 0.2) {
        br.mode = "igniting";
        br.igniteLeft = b.ignition;
        br.starts.push(state.simTime);
      }
      return { onAt, offAt };
    }

    function updateBoiler(dt, heatExtractKw) {
      const capacityKPerKwMin = 0.55; // kleine Wassermasse → sichtbare Dynamik
      const inputKw = state.burner.powerFrac * state.burnerPowerKw;
      const lossKw = Math.max(0, (state.boilerT - state.outdoor) * 0.012);
      const net = inputKw - heatExtractKw - lossKw;
      state.boilerT = clamp(state.boilerT + net * capacityKPerKwMin * (dt / 60), state.outdoor + 1, 88);
    }

    function buildTips(hyd, onAt, offAt, flowSet) {
      const tips = [];
      const starts = state.burner.starts.length;
      const flows = hyd.flows;
      const short = flows.living;
      const long = flows.bed;

      if (state.burner.mode === "igniting") {
        tips.push({ level: "warn", text: "Brenner zündet … Vorlauf noch nicht aktiv." });
      } else if (state.burner.mode === "on") {
        const pct = Math.round(state.burner.powerFrac * 100);
        tips.push({
          level: "ok",
          text: brand().modulating
            ? `Brenner moduliert bei ${pct} % — hält das Hysterese-Band um ${flowSet.toFixed(0)} °C.`
            : `Brenner läuft Vollast, bis Ausschaltpunkt ${offAt.toFixed(1)} °C erreicht ist.`,
        });
      } else {
        tips.push({
          level: "ok",
          text: `Brenner aus. Schaltet erst unter ${onAt.toFixed(1)} °C wieder ein (Hysterese).`,
        });
      }

      if (starts >= 6) {
        tips.push({
          level: "bad",
          text: `${starts} Starts in der letzten Stunde — Takten! Hysterese verbreitern, Mindestlaufzeit/Kurve prüfen.`,
        });
      } else if (starts >= 3) {
        tips.push({
          level: "warn",
          text: `${starts} Starts/h — Grenzbereich. Schmale Hysterese oder zu große Leistung begünstigt Takten.`,
        });
      }

      if (state.balance < 40 && short > long * 1.6) {
        tips.push({
          level: "bad",
          text: "Kurzer Strang (Wohnzimmer) stiehlt Durchfluss — Schlafzimmer bleibt unterversorgt. Abgleich erhöhen!",
        });
      } else if (state.balance > 75) {
        tips.push({
          level: "ok",
          text: "Hydraulischer Abgleich wirkt: Massenstrom besser verteilt.",
        });
      }

      if (state.diameterMm <= 12 && state.lengthMul >= 1.4) {
        tips.push({
          level: "warn",
          text: "Dünnes Rohr + lange Wege → hoher Druckverlust, Volumenstrom bricht ein.",
        });
      }

      const coldLong = state.rooms.bed.tRoom < state.rooms.bed.tSet - 1.2;
      if (coldLong && flows.bed < flows.living * 0.7) {
        tips.push({
          level: "warn",
          text: "Schlafzimmer: zu wenig Volumenstrom — Thermostat auf, Abgleich oder Durchmesser prüfen.",
        });
      }

      if (Math.abs(state.shift) >= 4) {
        tips.push({
          level: "warn",
          text: `Parallelverschiebung ${state.shift > 0 ? "+" : ""}${state.shift} K verschiebt die ganze Heizkurve — Vorlauf-Soll jetzt ${flowSet.toFixed(0)} °C.`,
        });
      }

      state.tips = tips.slice(0, 4);
    }

    function step(realDt) {
      const dt = clamp(realDt, 0.016, 0.1) * state.dtScale;
      state.simTime += dt;

      const flowSet = flowSetpoint();
      const hyd = hydraulics(dt);
      const { onAt, offAt } = updateBurner(dt, flowSet, hyd.heatExtractKw);
      updateBoiler(dt, hyd.heatExtractKw);
      buildTips(hyd, onAt, offAt, flowSet);

      return snapshot(hyd, onAt, offAt, flowSet);
    }

    function snapshot(hyd, onAt, offAt, flowSet) {
      const br = state.burner;
      let modeLabel = "AUS";
      if (br.mode === "igniting") modeLabel = "ZÜNDET";
      else if (br.mode === "on") modeLabel = brand().modulating && br.powerFrac < 0.95 ? "MODULIERT" : "BRENNT";

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
        burnerMode: modeLabel,
        burnerFrac: br.powerFrac,
        startsHour: br.starts.length,
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
          if (!state.rooms[k]) state.rooms[k] = { tSet: 20, loadW: 1000, tRoom: 20 };
          Object.assign(state.rooms[k], roomPatch[k]);
        }
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
        state.boilerT = 42;
        state.burner = {
          mode: "off",
          powerFrac: 0,
          igniteLeft: 0,
          runTime: 0,
          lockLeft: 0,
          starts: [],
        };
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

  window.HeizungSim = { createSim, BRANDS, ROOMS, heatingCurveFlowSet };
})();
