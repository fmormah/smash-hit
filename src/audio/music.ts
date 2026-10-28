import { audioState, onMuteChange } from "./state";
import { dev } from "../config/runtime";
import bgmUrl from "../assets/race-to-games-com-bgm.webm";

/**
 * Looping background music. Browsers block autoplay until the first user gesture,
 * so the track is armed on the first pointerdown / keydown. Honours the global
 * mute flag (toggled by the HUD mute button).
 */
let audio: HTMLAudioElement | null = null;
let started = false;

export function initMusic() {
  if (audio) return;
  audio = new Audio(bgmUrl);
  audio.loop = true;
  audio.volume = dev.bgmVolume * dev.masterVolume;
  audio.muted = audioState.muted;

  const start = () => {
    if (started || !audio) return;
    started = true;
    audio.play().catch(() => {
      /* will retry on the next gesture if blocked */
      started = false;
    });
  };
  window.addEventListener("pointerdown", start);
  window.addEventListener("keydown", start);
  window.addEventListener("touchstart", start);

  onMuteChange(() => {
    if (audio) audio.muted = audioState.muted;
  });
}

/** Apply the live BGM volume (called by the dev-panel slider). */
export function syncMusicVolume() {
  if (audio)
    audio.volume = Math.max(0, Math.min(1, dev.bgmVolume * dev.masterVolume));
}
