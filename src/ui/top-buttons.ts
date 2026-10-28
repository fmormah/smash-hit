import { audioState, toggleMute } from "../audio/state";

/**
 * Floating control buttons (bottom-right): a mute toggle and a pause toggle, with
 * crisp inline-SVG icons. Pause calls back into the game; mute flips the global
 * mute flag. The pause button hides on the title / tutorial (gameplay only).
 */
export interface TopButtons {
  setPaused(paused: boolean): void;
  setPauseVisible(visible: boolean): void;
}

const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
const ICON_PLAY =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z"/></svg>';
const SPK = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>';
const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SPK}<path d="M16 8.5a4.5 4.5 0 0 1 0 7"/><path d="M18.8 6a8 8 0 0 1 0 12"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SPK}<line x1="16" y1="9.5" x2="21.5" y2="15"/><line x1="21.5" y1="9.5" x2="16" y2="15"/></svg>`;

export function createTopButtons(onPause: () => void): TopButtons {
  const wrap = document.createElement("div");
  wrap.className = "top-btns";

  const mute = document.createElement("button");
  mute.className = "icon-btn";
  mute.innerHTML = audioState.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
  mute.title = "Mute / unmute";
  mute.setAttribute("aria-label", "Mute");

  const pause = document.createElement("button");
  pause.className = "icon-btn";
  pause.innerHTML = ICON_PAUSE;
  pause.title = "Pause (P / Esc)";
  pause.setAttribute("aria-label", "Pause");

  const tap = (btn: HTMLElement, fn: () => void) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation(); // keep the joystick layer from seeing this tap
      fn();
    });
  };

  tap(mute, () => {
    mute.innerHTML = toggleMute() ? ICON_SOUND_OFF : ICON_SOUND_ON;
  });
  tap(pause, onPause);

  wrap.append(mute, pause);
  document.body.appendChild(wrap);

  return {
    setPaused(paused: boolean) {
      pause.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    },
    setPauseVisible(visible: boolean) {
      pause.style.display = visible ? "" : "none";
    },
  };
}
