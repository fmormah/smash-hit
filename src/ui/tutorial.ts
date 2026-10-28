/**
 * "How to Play" guided tutorial — Goal-Hunter style. Instead of a static frozen
 * slideshow, this is a real guided flight: the world streams normally, and at each
 * lesson the FORWARD motion freezes behind a card ("PAUSED — waiting for your move")
 * until the player performs the input in context, then it unfreezes and you fly on
 * to the next beat. Numbered lesson cards, device-relative copy, control highlights,
 * and a polished completion panel. Collisions are made safe by the game while active.
 */
const isTouch = window.matchMedia("(pointer: coarse)").matches;

/** Per-frame snapshot the game feeds the tutorial. */
export interface TutorialCtx {
  axisX: number;
  axisY: number;
  fire: boolean; // Space (desktop) / double-tap (mobile) this frame
  distance: number; // current HUD distance (drives the fly-gap between lessons)
}

type Highlight = "horizontal" | "vertical" | "fire" | "none";

interface Lesson {
  tag: string;
  title: string;
  body: string;
  hint: string;
  highlight: Highlight;
  check: (c: TutorialCtx) => boolean;
}

export interface Tutorial {
  active: boolean;
  /** The game reads this each frame: when true, forward motion is gated (the beat). */
  freezeForward: boolean;
  /** Wired by the game: completion-panel buttons. */
  onPlayForReal: (() => void) | null;
  onTitle: (() => void) | null;
  start(): void;
  stop(): void;
  update(c: TutorialCtx, dt: number): void;
}

function el(tag: string, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** HUD-metres of free flight between one lesson and the next gate. */
const FLY_GAP = 120;

export function createTutorial(): Tutorial {
  const root = el("div", "tutorial-overlay");

  // --- instruction card (top-centre) ---
  const card = el("div", "tut-card");
  const cardTag = el("div", "tut-card-tag");
  const cardTitle = el("div", "tut-card-title");
  const cardBody = el("div", "tut-card-body");
  const cardHint = el("div", "tut-card-hint");
  const cardPaused = el("div", "tut-card-paused", "▌▌ PAUSED — waiting for your move");
  card.append(cardTag, cardTitle, cardBody, cardHint, cardPaused);

  // --- control highlights ---
  const chevL = el("div", "tut-chevron tut-chevron-left", "◂");
  const chevR = el("div", "tut-chevron tut-chevron-right", "▸");
  const chevU = el("div", "tut-chevron tut-chevron-up", "▴");
  const chevD = el("div", "tut-chevron tut-chevron-down", "▾");
  const firePing = el("div", "tut-fire-ping");

  // --- skip (always tappable) ---
  const skip = el("button", "tut-skip", "SKIP ▸");
  skip.addEventListener("click", () => api.onTitle?.());

  // --- completion panel ---
  const complete = el("div", "tut-complete");
  const compTag = el("div", "tut-complete-tag", "★ TRAINING COMPLETE ★");
  const compTitle = el("div", "tut-complete-title", "YOU'RE RACE-READY");
  const compBody = el(
    "div",
    "tut-complete-body",
    "Weave, climb, scatter and smash — you've got the lot. Time to race to Gamescom.",
  );
  const compBtns = el("div", "tut-complete-buttons");
  const btnGo = el("button", "tut-btn tut-btn-go", "PLAY FOR REAL ▸");
  const btnTitle = el("button", "tut-btn tut-btn-title", "TITLE");
  btnGo.addEventListener("click", () => api.onPlayForReal?.());
  btnTitle.addEventListener("click", () => api.onTitle?.());
  compBtns.append(btnGo, btnTitle);
  complete.append(compTag, compTitle, compBody, compBtns);

  root.append(card, chevL, chevR, chevU, chevD, firePing, skip, complete);
  root.style.display = "none";
  document.body.appendChild(root);

  const lessons: Lesson[] = [
    {
      tag: "LESSON 1 / 4",
      title: "WEAVE TO DODGE",
      body: isTouch
        ? "Drag left or right to slide your craft across the lane."
        : "Press A / D (or ← / →) to slide your craft across the lane.",
      hint: isTouch ? "DRAG  ◂ ▸" : "A  ◂      ▸  D",
      highlight: "horizontal",
      check: (c) => Math.abs(c.axisX) > 0.5,
    },
    {
      tag: "LESSON 2 / 4",
      title: "CLIMB & DIVE",
      body: isTouch
        ? "Drag up or down to fly over or under what's ahead."
        : "Press W / S (or ↑ / ↓) to fly over or under what's ahead.",
      hint: isTouch ? "DRAG  ▴ ▾" : "W  ▴      ▾  S",
      highlight: "vertical",
      check: (c) => Math.abs(c.axisY) > 0.5,
    },
    {
      tag: "LESSON 3 / 4",
      title: "SCATTER MISSILES",
      body: isTouch
        ? "Double-tap to blast a fan of homing missiles and clear the way."
        : "Press SPACE to blast a fan of homing missiles and clear the way.",
      hint: isTouch ? "DOUBLE-TAP" : "PRESS  SPACE",
      highlight: "fire",
      check: (c) => c.fire,
    },
    {
      tag: "LESSON 4 / 4",
      title: "BOOST & SMASH",
      body: isTouch
        ? "Fly through crystal rings to surge — while boosting you SMASH through glass. Double-tap to launch!"
        : "Fly through crystal rings to surge — while boosting you SMASH through glass. Press SPACE to launch!",
      hint: isTouch ? "DOUBLE-TAP" : "PRESS  SPACE",
      highlight: "none",
      check: (c) => c.fire,
    },
  ];

  let step = 0;
  let engaged = false; // currently gating (frozen, waiting for the input)
  let settle = 0; // brief settle before accepting input (held input can't skip)
  let done = false; // completion panel shown
  let nextGateDist = 0;

  function setHighlight(h: Highlight) {
    chevL.style.display = chevR.style.display = h === "horizontal" ? "" : "none";
    chevU.style.display = chevD.style.display = h === "vertical" ? "" : "none";
    firePing.style.display = h === "fire" ? "" : "none";
  }

  function showLesson() {
    const l = lessons[step];
    cardTag.textContent = l.tag;
    cardTitle.textContent = l.title;
    cardBody.textContent = l.body;
    cardHint.textContent = l.hint;
    card.style.display = "";
    setHighlight(l.highlight);
  }

  function hideCard() {
    card.style.display = "none";
    setHighlight("none");
  }

  const api: Tutorial = {
    active: false,
    freezeForward: false,
    onPlayForReal: null,
    onTitle: null,
    start() {
      api.active = true;
      api.freezeForward = true;
      step = 0;
      engaged = true; // lesson 1 gates immediately
      settle = 0.35;
      done = false;
      nextGateDist = 0;
      complete.style.display = "none";
      showLesson();
      root.style.display = "block";
    },
    stop() {
      api.active = false;
      api.freezeForward = false;
      root.style.display = "none";
    },
    update(c, dt) {
      if (!api.active) return;
      if (done) {
        api.freezeForward = true; // hold the world while the panel is up
        return;
      }
      const lesson = lessons[step];
      if (!engaged) {
        // free flight until we reach the next gate
        api.freezeForward = false;
        if (c.distance >= nextGateDist) {
          engaged = true;
          settle = 0.35;
          showLesson();
        }
        return;
      }
      // engaged: forward frozen, waiting for the input in context
      api.freezeForward = true;
      if (settle > 0) {
        settle -= dt;
        return;
      }
      if (lesson.check(c)) {
        engaged = false;
        step++;
        if (step >= lessons.length) {
          done = true;
          hideCard();
          complete.style.display = "flex";
          return;
        }
        nextGateDist = c.distance + FLY_GAP;
        hideCard();
      }
    },
  };
  return api;
}
