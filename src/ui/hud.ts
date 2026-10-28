import { $ } from "../utils/dom";

export interface HudElements {
  event: HTMLElement;
  flash: HTMLElement;
  loading: HTMLElement;
  start: HTMLElement;
  pause: HTMLElement;
  hud: HTMLElement;
  playBtn: HTMLButtonElement;
  testFlightBtn: HTMLButtonElement;
  resumeBtn: HTMLButtonElement;
  titleBtn: HTMLButtonElement;
  pathBlocked: HTMLElement;
  win: HTMLElement;
  winTitle: HTMLElement;
  winStats: HTMLElement;
  restartBtn: HTMLButtonElement;
}

export function queryHudElements(): HudElements {
  return {
    event: $("event"),
    flash: $("flash"),
    loading: $("loading"),
    start: $("start"),
    pause: $("pause"),
    hud: $("hud"),
    playBtn: $("playBtn"),
    testFlightBtn: $("testFlightBtn"),
    resumeBtn: $("resumeBtn"),
    titleBtn: $("titleBtn"),
    pathBlocked: $("pathBlocked"),
    win: $("win"),
    winTitle: $("winTitle"),
    winStats: $("winStats"),
    restartBtn: $("restartBtn"),
  };
}

/** Show the end-of-run screen (PERFECT when all shards + no hits). */
export function showWinScreen(
  els: Pick<HudElements, "win" | "winTitle" | "winStats" | "hud">,
  perfect: boolean,
  shards: number,
  shardTarget: number,
  distance: number,
) {
  els.winTitle.textContent = perfect ? "PERFECT" : "ARRIVED";
  els.winTitle.style.color = perfect ? "#ffd24a" : "";
  els.winStats.textContent = perfect
    ? `All ${shards} play shards · no hits · ${Math.floor(distance)} m`
    : `${shards} / ${shardTarget} play shards · ${Math.floor(distance)} m`;
  els.hud.classList.add("hide");
  els.win.classList.remove("hide");
}

export function showEvent(
  elEvent: HTMLElement,
  text: string,
  onShow: () => void,
) {
  elEvent.textContent = text;
  elEvent.style.opacity = "1";
  onShow();
}

export function showStartScreen(els: Pick<HudElements, "loading" | "start">) {
  els.loading.classList.add("hide");
  els.start.classList.remove("hide");
}

export function showGameHud(els: Pick<HudElements, "start" | "hud">) {
  els.start.classList.add("hide");
  els.hud.classList.remove("hide");
}

export function togglePauseScreen(
  els: Pick<HudElements, "pause">,
  paused: boolean,
) {
  els.pause.classList.toggle("hide", !paused);
}

export function showCrashFx(els: Pick<HudElements, "flash">) {
  els.flash.style.transition = "none";
  els.flash.style.opacity = "0.5";
  requestAnimationFrame(() => {
    els.flash.style.transition = "opacity .5s";
    els.flash.style.opacity = "0";
  });
}
