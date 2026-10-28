import * as THREE from "three";
import redCrystalUrl from "../assets/red-crystal.webp";
import blueCrystalUrl from "../assets/blue-crystal.webp";
import yellowCrystalUrl from "../assets/yellow-crystal.webp";
import greenCrystalUrl from "../assets/green-crystal.webp";
import allCrystalUrl from "../assets/all-crystal.webp";

/**
 * In-game HUD (Crystal-Line look, trimmed): SCORE (top-left), a big run timer
 * (centre), LEVEL + biome + collected crystals (top-right), a world-progress line +
 * THRUST/speed bar + "power ready" prompt (bottom), and an off-screen indicator.
 * Built once; only values mutate.
 */
// Crystal-piece icons indexed to match RING_COLORS order (0=red,1=blue,2=yellow,3=green).
const CRYSTAL_URLS = [redCrystalUrl, blueCrystalUrl, yellowCrystalUrl, greenCrystalUrl];
function el(tag: string, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Name a colour by hue (kept for callers; HUD no longer shows a polarity label). */
export function colorName(hex: number): string {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.08) return max > 0.8 ? "WHITE" : "STEEL";
  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  const bands: [number, string][] = [
    [15, "RUBY"],
    [45, "AMBER"],
    [70, "GOLD"],
    [160, "EMERALD"],
    [200, "CYAN"],
    [255, "AZURE"],
    [290, "VIOLET"],
    [330, "MAGENTA"],
    [360, "RUBY"],
  ];
  for (const [lim, name] of bands) if (h <= lim) return name;
  return "RUBY";
}

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(1).padStart(4, "0")}`;
}

export interface ClHudState {
  score: number;
  combo: number;
  time: number; // run seconds (counts up)
  level: number; // 1-based
  biome: string;
  polarityName: string;
  polarityHex: string; // "#rrggbb" — still used to tint the off-screen indicator
  energy: number; // 0..1 (thrust / speed-as-health)
  charged: boolean; // scatter-missile ability ready
  crystalActive: boolean; // crystal-ring perma-boost running → show the acquired banner
  crystalColor: string; // crystal colour "#rrggbb" for the banner
  crystals: boolean[]; // which active run crystals have been collected
  progress: number; // 0..1 through the whole game (finite mode)
  infinite: boolean; // endless run → ∞ instead of segments
  levelColors: string[]; // per-level theme colours "#rrggbb" (finite progress segments)
  zoneColor: string; // current zone colour "#rrggbb" (infinite line + progress marker)
  camera: THREE.Camera;
  avatar: THREE.Vector3;
}

export interface ClHud {
  root: HTMLElement;
  update(s: ClHudState): void;
  setPlaying(playing: boolean): void;
}

export function createClHud(parent: HTMLElement): ClHud {
  const root = el("div", "cl-hud");

  // --- top bar: SCORE · TIMER · LEVEL + biome ---
  const top = el("div", "hud-top");
  const left = el("div", "hud-stat");
  const scoreVal = el("div", "hud-stat-value");
  left.append("SCORE", scoreVal);

  const timer = el("div", "hud-timer");

  const right = el("div", "hud-stat");
  const levelText = el("div", "", "LEVEL 1");
  const biomeName = el("div", "hud-stat-value");
  // Collected crystals (old-game style): four color-crystal wedges stacked on a dim
  // base outline (collection HUD) that come together into a single glowing crystal.
  const crystalWrap = el("div", "cl-crystal-wrap");
  const crystalAssembly = el("div", "cl-crystal-assembly");
  const crystalBase = el("img", "cl-crystal-base") as HTMLImageElement;
  crystalBase.src = allCrystalUrl;
  crystalBase.alt = "";
  crystalBase.draggable = false;
  crystalAssembly.appendChild(crystalBase);

  const crystalImgs: HTMLImageElement[] = [];
  for (const url of CRYSTAL_URLS) {
    const img = el("img", "cl-crystal-piece") as HTMLImageElement;
    img.src = url;
    img.alt = "";
    img.draggable = false;
    crystalImgs.push(img);
    crystalAssembly.appendChild(img);
  }
  crystalWrap.appendChild(crystalAssembly);
  right.append(levelText, biomeName, crystalWrap);

  top.append(left, timer, right);

  // --- bottom: power-ready prompt + THRUST/speed bar ---
  const bottom = el("div", "hud-bottom");
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const powerReady = el(
    "div",
    "cl-power-ready",
    isTouch ? "⚡ SCATTER READY · DOUBLE-TAP" : "⚡ SCATTER READY · SPACE",
  );
  powerReady.style.display = "none";

  const thrustWrap = el("div", "cl-thrust-wrap");
  const thrustLabel = el("div", "cl-thrust-label", "THRUST");
  const thrustBar = el("div", "cl-thrust");
  const thrustFill = el("div", "cl-thrust-fill");
  thrustBar.appendChild(thrustFill);
  thrustWrap.append(thrustLabel, thrustBar);

  bottom.append(powerReady, thrustWrap);

  // --- 'CRYSTAL ACQUIRED' banner (slow flash, tinted to the crystal) ---
  const crystalBanner = el("div", "cl-crystal-banner", "CRYSTAL ACQUIRED");
  crystalBanner.style.display = "none";

  // --- world-progress line (above the scatter prompt; vertical-left on portrait) ---
  const progress = el("div", "cl-progress");
  const progInf = el("div", "cl-prog-inf", "∞");
  progInf.style.display = "none";
  const progTrack = el("div", "cl-prog-track");
  const progMarker = el("div", "cl-prog-marker");
  progress.append(progInf, progTrack);

  // --- off-screen player indicator ---
  const indicator = el("div", "player-indicator");
  const ping = el("div", "player-indicator-ping");
  const arrow = el("div", "player-indicator-arrow");
  const indText = el("div", "player-indicator-text");
  indicator.append(ping, arrow, indText);

  root.append(top, bottom, crystalBanner, progress, indicator);
  parent.appendChild(root);

  // Rebuild the progress track only when its shape changes (level set / infinite flip).
  let builtSig = "";
  function buildTrack(infinite: boolean, levelColors: string[]) {
    const sig = infinite ? "inf" : levelColors.join(",");
    if (sig === builtSig) return;
    builtSig = sig;
    progTrack.textContent = "";
    if (infinite) {
      progInf.style.display = "";
      const seg = el("div", "cl-prog-seg");
      progTrack.appendChild(seg); // single full-length segment, tinted to the live zone
    } else {
      progInf.style.display = "none";
      for (const c of levelColors) {
        const seg = el("div", "cl-prog-seg");
        seg.style.background = c;
        seg.style.color = c; // for the currentColor glow
        progTrack.appendChild(seg);
      }
      progTrack.appendChild(progMarker); // position marker rides over the segments
    }
  }

  const _v = new THREE.Vector3();

  function updateIndicator(s: ClHudState) {
    _v.copy(s.avatar).project(s.camera);
    const offscreen = Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1 || _v.z > 1;
    if (!offscreen) {
      indicator.style.display = "none";
      return;
    }
    indicator.style.display = "block";
    let x = _v.x;
    let y = _v.y;
    if (_v.z > 1) {
      x = -x;
      y = -y;
    }
    const margin = 0.92;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax > ay) {
      const sc = margin / (ax || 0.001);
      x = x > 0 ? margin : -margin;
      y = y * sc;
    } else {
      const sc = margin / (ay || 0.001);
      x = x * sc;
      y = y > 0 ? margin : -margin;
    }
    indicator.style.left = `${(x + 1) * 50}%`;
    indicator.style.top = `${(1 - y) * 50}%`;
    const deg = 90 - (Math.atan2(y, x) * 180) / Math.PI;
    indicator.style.setProperty("--angle", `${deg}deg`);
    indicator.style.setProperty("--indicator-color", s.polarityHex);
  }

  function update(s: ClHudState) {
    scoreVal.textContent = Math.floor(s.score).toLocaleString();
    timer.textContent = formatClock(s.time);
    levelText.textContent = `LEVEL ${s.level}`;
    biomeName.textContent = s.biome;

    const percentage = Math.max(0, Math.min(1, s.energy));
    thrustFill.style.width = `${percentage * 100}%`;

    if (percentage < 0.33) {
      // Red Tier (Google Red and its pale version)
      thrustFill.style.background =
        "linear-gradient(90deg, #ea4335, #ff5b4f 70%, #f9dad6)";
      thrustFill.style.boxShadow = "0 0 14px rgba(234, 67, 53, 0.7)";
      thrustBar.style.background = "rgba(234, 67, 53, 0.1)";
      thrustBar.style.borderColor = "rgba(234, 67, 53, 0.25)";
    } else if (percentage <= 0.66) {
      // Yellow Tier (Google Yellow and its pale version)
      thrustFill.style.background =
        "linear-gradient(90deg, #fbbc05, #ffd24a 70%, #fef1d2)";
      thrustFill.style.boxShadow = "0 0 14px rgba(251, 188, 5, 0.7)";
      thrustBar.style.background = "rgba(251, 188, 5, 0.1)";
      thrustBar.style.borderColor = "rgba(251, 188, 5, 0.25)";
    } else {
      // Green Tier (Google Green and its pale version)
      thrustFill.style.background =
        "linear-gradient(90deg, #34a853, #5cd67c 70%, #e6f4ea)";
      thrustFill.style.boxShadow = "0 0 14px rgba(52, 168, 83, 0.7)";
      thrustBar.style.background = "rgba(52, 168, 83, 0.1)";
      thrustBar.style.borderColor = "rgba(52, 168, 83, 0.25)";
    }

    powerReady.style.display = s.charged ? "" : "none";

    if (s.crystalActive) {
      crystalBanner.style.display = "";
      crystalBanner.style.color = s.crystalColor;
      crystalBanner.classList.add("show");
    } else {
      crystalBanner.style.display = "none";
      crystalBanner.classList.remove("show");
    }

    // collected crystals
    let allCollected = s.crystals.length > 0 && s.crystals.every(Boolean);
    for (let i = 0; i < crystalImgs.length; i++) {
      const got = !!s.crystals[i];
      crystalImgs[i].classList.toggle("collected", got);
    }
    // full set → the whole crystal assembles over the (dimmed) row
    crystalWrap.classList.toggle("complete", allCollected);

    // world-progress line
    buildTrack(s.infinite, s.levelColors);
    if (s.infinite) {
      const seg = progTrack.firstChild as HTMLElement | null;
      if (seg) {
        seg.style.background = s.zoneColor;
        seg.style.color = s.zoneColor;
      }
      progInf.style.color = s.zoneColor;
    } else {
      progTrack.style.setProperty("--prog", String(Math.max(0, Math.min(1, s.progress))));
      progMarker.style.background = s.zoneColor;
      progMarker.style.color = s.zoneColor;
    }

    updateIndicator(s);
  }

  function setPlaying(playing: boolean) {
    root.classList.toggle("show", playing);
  }

  return { root, update, setPlaying };
}
