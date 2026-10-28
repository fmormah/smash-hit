/**
 * Global mute flag + change listeners. The music layer (and any future SFX)
 * subscribe via `onMuteChange` so toggling the HUD mute button updates them.
 */
export const audioState = { muted: false };

const listeners: (() => void)[] = [];

export function onMuteChange(fn: () => void) {
  listeners.push(fn);
}

export function toggleMute(): boolean {
  audioState.muted = !audioState.muted;
  for (const fn of listeners) fn();
  return audioState.muted;
}
