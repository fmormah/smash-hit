import type { HudElements } from "../ui/hud";
import { showCrashFx, showEvent } from "../ui/hud";
import { COMBO_WINDOW } from "../config/constants";

export interface ScoreState {
  score: number;
  distance: number;
  crystals: number;
  combo: number;
  comboTimer: number;
  eventTimer: number;
  shakeTime: number;
  crashCooldown: number;
}

export function createScoreState(): ScoreState {
  return {
    score: 0,
    distance: 0,
    crystals: 0,
    combo: 1,
    comboTimer: 0,
    eventTimer: 0,
    shakeTime: 0,
    crashCooldown: 0,
  };
}

/**
 * Scoring + combo state. Score/combo/shards are surfaced by the Crystal-Line HUD
 * (see `ui/cl-hud.ts`), which reads `ScoreState` each frame — so handlers only
 * mutate state and fire the transient #event / #flash overlays.
 */
export function createScoringHandlers(state: ScoreState, hud: HudElements) {
  const bumpCombo = () => {
    state.comboTimer = COMBO_WINDOW;
    state.combo = Math.min(99, state.combo + 1);
  };

  const breakCombo = () => {
    state.combo = 1;
    state.comboTimer = 0;
  };

  const addScore = (n: number) => {
    state.score += Math.round(n);
  };

  const showGameEvent = (text: string) => {
    showEvent(hud.event, text, () => {
      state.eventTimer = 1.1;
    });
  };

  const onCrash = () => {
    state.score = Math.max(0, state.score - 75);
    state.shakeTime = 0.45;
    state.crashCooldown = 0.7;
    showCrashFx(hud);
    showGameEvent("CRASH! −75");
    breakCombo();
  };

  const tickScoring = (dt: number) => {
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) breakCombo();
    }
    if (state.eventTimer > 0) {
      state.eventTimer -= dt;
      if (state.eventTimer <= 0) hud.event.style.opacity = "0";
    }
    if (state.crashCooldown > 0) state.crashCooldown -= dt;
  };

  const fragmentCallbacks = {
    onPowerup: (_value: number) => {
      state.crystals++;
      addScore(40 * state.combo);
      bumpCombo();
      showGameEvent("+CRYSTAL");
    },
    onCrystal: () => {
      state.crystals++;
      addScore(50 * state.combo);
      bumpCombo();
      showGameEvent("+CRYSTAL");
    },
    onGlassBreak: (base: number) => {
      addScore(base * state.combo);
      bumpCombo();
    },
    onSteelHit: () => {
      breakCombo();
      showGameEvent("CLANG — steel!");
    },
    onReinforcedHit: () => {},
    onSteelClang: () => {
      breakCombo();
      showGameEvent("CLANG — steel!");
    },
  };

  return {
    state,
    bumpCombo,
    breakCombo,
    addScore,
    showGameEvent,
    onCrash,
    tickScoring,
    fragmentCallbacks,
  };
}

export type ScoringHandlers = ReturnType<typeof createScoringHandlers>;
