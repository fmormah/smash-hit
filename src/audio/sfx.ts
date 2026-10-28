import * as THREE from "three";
import { audioState } from "./state";
import { dev } from "../config/runtime";
import boostUrl from "../assets/level-gate-entrance.mp3";
import smallShatterUrl from "../assets/small-shatter.mp3";
import smallShatter2Url from "../assets/small-shatter-2.mp3";
import bigShatterUrl from "../assets/big-shatter.mp3";
import bigShatter2Url from "../assets/big-shatter-2.mp3";
import ringingShatterUrl from "../assets/loud-ringing-shatter.mp3";
import beamUrl from "../assets/player-beam-sound.mp3";
import pickupUrl from "../assets/when-pickup-power-up.mp3";
import shieldUrl from "../assets/yellow-ultimate-sound.mp3";
import torpedoUrl from "../assets/torpedo.mp3";

/**
 * Sound effects:
 *  - boost cue (the original level-gate-entrance sound, reused for every boost)
 *  - glass shatter (small / big / loud-ringing variants), distance-attenuated from
 *    the camera so far-off breaks are quieter. All kept below the BGM but audible.
 * Each sound has a small pool of Audio elements so overlapping breaks don't cut off.
 */
const POOL = 4;
const BGM_BELOW = 0.27; // shatter base volume (reduced ~35% from 0.42)
const RING_VOL = 0.3; // loud-ringing shatter base (reduced ~35% from 0.46)
const MAX_DIST = 85; // beyond this a break is inaudible
const MIN_GAP = 0.045; // seconds between shatter sounds (caps mass-shatter cacophony)

function makePool(url: string, vol: number): HTMLAudioElement[] {
  const arr: HTMLAudioElement[] = [];
  for (let i = 0; i < POOL; i++) {
    const a = new Audio(url);
    a.volume = vol;
    a.preload = "auto";
    arr.push(a);
  }
  return arr;
}

let boost: HTMLAudioElement[] = [];
let small: HTMLAudioElement[][] = [];
let big: HTMLAudioElement[][] = [];
let ring: HTMLAudioElement[] = [];
let torpedo: HTMLAudioElement[] = [];
let pickup: HTMLAudioElement[] = []; // crystal-ring pickup
let shield: HTMLAudioElement[] = []; // shield / boost-armour achieved
let beam: HTMLAudioElement | null = null; // low, looping hum while boost-armoured
let ready = false;

const BEAM_VOL = 0.064; // very quiet (reduced 60% from 0.16)

const boostIdx = { i: 0 };
const torpedoIdx = { i: 0 };
const _listener = new THREE.Vector3();
let lastShatterT = 0;

export function initSfx() {
  if (ready) return;
  ready = true;
  boost = makePool(boostUrl, 0.6);
  small = [makePool(smallShatterUrl, 1), makePool(smallShatter2Url, 1)];
  big = [makePool(bigShatterUrl, 1), makePool(bigShatter2Url, 1)];
  ring = makePool(ringingShatterUrl, 1);
  torpedo = makePool(torpedoUrl, 0.28);
  pickup = makePool(pickupUrl, 0.6);
  shield = makePool(shieldUrl, 0.5);
  beam = new Audio(beamUrl);
  beam.loop = true;
  beam.volume = BEAM_VOL;
}

/**
 * Loop the low beam hum while boost armour is active; stop it otherwise. Called
 * each frame with the current armour state.
 */
export function setBeam(on: boolean) {
  if (!ready || !beam) return;
  if (on && !audioState.muted) {
    beam.volume = Math.max(
      0,
      Math.min(1, BEAM_VOL * dev.sfxVolume * dev.masterVolume),
    );
    if (beam.paused) void beam.play().catch(() => {});
  } else if (!beam.paused) {
    beam.pause();
  }
}

/** The audio listener position (the camera) — set each frame for distance falloff. */
export function setListener(pos: THREE.Vector3) {
  _listener.copy(pos);
}

function playFrom(
  poolArr: HTMLAudioElement[],
  rotor: { i: number },
  vol: number,
) {
  const a = poolArr[rotor.i];
  rotor.i = (rotor.i + 1) % poolArr.length;
  try {
    a.volume = Math.max(0, Math.min(1, vol * dev.sfxVolume * dev.masterVolume)); // sfx master * master volume scale
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Play the boost cue (the ported level-gate-entrance sound). */
export function playBoost() {
  if (audioState.muted || !ready) return;
  playFrom(boost, boostIdx, 0.6);
}

/** Play the scatter missile torpedo firing sound. */
export function playTorpedo() {
  if (audioState.muted || !ready) return;
  playFrom(torpedo, torpedoIdx, 0.28);
}

/** Crystal-ring pickup cue (the original power-up pickup sound). */
export function playPickup() {
  if (audioState.muted || !ready) return;
  playFrom(pickup, rotorFor(pickup), 0.6);
}

/** Shield / boost-armour achieved cue (the original AEGIS-SHIELD ultimate sound). */
export function playShield() {
  if (audioState.muted || !ready) return;
  playFrom(shield, rotorFor(shield), 0.5);
}

/** Tiny, very-quiet shatter when the shield breaks. */
export function playShieldBreak() {
  if (audioState.muted || !ready) return;
  const p = small[(Math.random() * small.length) | 0];
  playFrom(p, rotorFor(p), 0.06);
}

const rotors = new WeakMap<HTMLAudioElement[], { i: number }>();
function rotorFor(p: HTMLAudioElement[]) {
  let r = rotors.get(p);
  if (!r) {
    r = { i: 0 };
    rotors.set(p, r);
  }
  return r;
}

/**
 * Play a glass-shatter sound at `pos`, chosen by size / sturdiness and faded by
 * distance from the camera. `big` → heavier sound; `ringing` → the loud ringing one.
 */
export function playShatter(
  pos: THREE.Vector3,
  isBig: boolean,
  ringing: boolean,
) {
  if (audioState.muted || !ready) return;
  const now = performance.now() / 1000;
  if (now - lastShatterT < MIN_GAP) return; // throttle mass shatters
  lastShatterT = now;

  const dist = pos.distanceTo(_listener);
  const fall = Math.max(0, 1 - dist / MAX_DIST);
  if (fall <= 0.02) return;

  if (ringing) {
    playFrom(ring, rotorFor(ring), RING_VOL * fall);
  } else if (isBig) {
    const p = big[(Math.random() * big.length) | 0];
    playFrom(p, rotorFor(p), BGM_BELOW * fall);
  } else {
    const p = small[(Math.random() * small.length) | 0];
    playFrom(p, rotorFor(p), BGM_BELOW * fall);
  }
}
