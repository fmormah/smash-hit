import { CHAPTERS, GAMESCOM_ALL_CHAPTERS, GAMESCOM_CANYON } from '../config/chapters';
import {
  applyGamesComRules,
  dev,
  gamescom,
  resetDev,
  setGamesComEnabled,
} from '../config/runtime';
import { steerBounds } from '../gameplay/avatar';
import { RING_COLORS } from '../gameplay/rings';
import { syncMusicVolume } from '../audio/music';
import { PATTERN_NAMES, applyGamesComObstacleDefaults } from '../world/patterns';

export interface DevPanel {
  update(info: { speed: number; zone: string; distance: number }): void;
  visible(): boolean;
}

interface DevPanelCallbacks {
  onBarrelRoll: () => void;
}

const DEG = Math.PI / 180;

/** Builds the F9-toggled dev panel (top-right, collapsible sections) and wires its controls to `dev`. */
export function createDevPanel(cb: DevPanelCallbacks): DevPanel {
  const panel = document.createElement('div');
  panel.id = 'devpanel';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '15px',
    right: '15px',
    width: '310px',
    maxHeight: 'calc(100vh - 30px)',
    overflowY: 'auto',
    padding: '14px 16px 16px',
    background: 'rgba(10, 18, 32, 0.88)',
    border: '1px solid rgba(0, 243, 255, 0.25)',
    borderRadius: '12px',
    color: '#cfeaff',
    font: '12px -apple-system, "Segoe UI", Roboto, sans-serif',
    zIndex: '60',
    display: 'none',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
    userSelect: 'none',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(0, 243, 255, 0.3) rgba(0,0,0,0.1)',
  } as Partial<CSSStyleDeclaration>);

  // Custom scrollbar styles for WebKit
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    #devpanel::-webkit-scrollbar {
      width: 6px;
    }
    #devpanel::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 10px;
    }
    #devpanel::-webkit-scrollbar-thumb {
      background: rgba(0, 243, 255, 0.3);
      border-radius: 10px;
    }
    #devpanel::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 243, 255, 0.5);
    }
    .dev-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      margin-top: 6px;
      background: rgba(0, 243, 255, 0.05);
      border: 1px solid rgba(0, 243, 255, 0.1);
      border-radius: 6px;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: 1px;
      font-size: 10.5px;
      text-transform: uppercase;
      color: #00f3ff;
      transition: all 0.2s ease;
    }
    .dev-section-header:hover {
      background: rgba(0, 243, 255, 0.12);
      border-color: rgba(0, 243, 255, 0.3);
      box-shadow: 0 0 8px rgba(0, 243, 255, 0.15);
    }
    .dev-section-content {
      padding: 4px 8px 10px;
      margin-bottom: 4px;
      border-left: 1px solid rgba(0, 243, 255, 0.15);
      margin-left: 10px;
    }
    .dev-row {
      margin: 8px 0 2px;
    }
    .dev-row-head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
      opacity: 0.85;
    }
    .dev-row-val {
      color: #00f3ff;
      font-weight: 600;
    }
    .dev-slider-input {
      width: 100%;
      accent-color: #00f3ff;
      cursor: pointer;
    }
    .dev-checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
      cursor: pointer;
    }
    .dev-checkbox-input {
      accent-color: #00f3ff;
      cursor: pointer;
    }
    .dev-btn {
      width: 100%;
      padding: 8px;
      cursor: pointer;
      font-weight: 800;
      letter-spacing: 1px;
      color: #04111f;
      border: none;
      border-radius: 6px;
      background: linear-gradient(135deg, #00f3ff, #0077ff);
      box-shadow: 0 4px 15px rgba(0, 243, 255, 0.2);
      transition: all 0.2s ease;
      text-transform: uppercase;
      font-size: 10.5px;
    }
    .dev-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0, 243, 255, 0.4);
      filter: brightness(1.1);
    }
    .dev-btn:active {
      transform: translateY(1px);
    }
  `;
  document.head.appendChild(styleSheet);

  const title = document.createElement('div');
  title.textContent = '⚡ DEV PANEL · F9';
  Object.assign(title.style, {
    fontWeight: '900',
    letterSpacing: '2px',
    fontSize: '11px',
    color: '#00f3ff',
    textShadow: '0 0 10px rgba(0, 243, 255, 0.4)',
    marginBottom: '10px',
    textAlign: 'center',
    borderBottom: '1px solid rgba(0, 243, 255, 0.2)',
    paddingBottom: '8px',
  } as Partial<CSSStyleDeclaration>);
  panel.appendChild(title);

  const readout = document.createElement('div');
  Object.assign(readout.style, {
    fontVariantNumeric: 'tabular-nums',
    fontSize: '11px',
    lineHeight: '1.6',
    padding: '8px 10px',
    marginBottom: '12px',
    background: 'rgba(0, 243, 255, 0.08)',
    border: '1px solid rgba(0, 243, 255, 0.15)',
    borderRadius: '8px',
    boxShadow: 'inset 0 0 10px rgba(0, 243, 255, 0.05)',
  } as Partial<CSSStyleDeclaration>);
  panel.appendChild(readout);

  // controls register a refresher so Reset / Apply JSON can re-sync the inputs
  const refreshers: (() => void)[] = [];
  const refreshAll = () => refreshers.forEach((fn) => fn());
  const gamescomLockedRows = new Set<HTMLElement>();

  let activeSectionContent: HTMLDivElement | null = null;
  let activeSectionHeader: HTMLDivElement | null = null;

  // --- collapsible section helper ---
  function createSection(label: string) {
    const header = document.createElement('div');
    header.className = 'dev-section-header';
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = label;
    header.appendChild(titleSpan);

    const chevron = document.createElement('span');
    chevron.textContent = '▶';
    chevron.style.transition = 'transform 0.2s ease';
    chevron.style.fontSize = '8px';
    header.appendChild(chevron);

    const content = document.createElement('div');
    content.className = 'dev-section-content';
    content.style.display = 'none';

    header.addEventListener('click', () => {
      const isVisible = content.style.display === 'block';
      
      // Close currently open section if it's different
      if (activeSectionContent && activeSectionContent !== content) {
        activeSectionContent.style.display = 'none';
        if (activeSectionHeader) {
          const chev = activeSectionHeader.querySelector('span:last-child') as HTMLElement;
          if (chev) chev.style.transform = 'rotate(0deg)';
        }
      }

      if (isVisible) {
        content.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
        activeSectionContent = null;
        activeSectionHeader = null;
      } else {
        content.style.display = 'block';
        chevron.style.transform = 'rotate(90deg)';
        activeSectionContent = content;
        activeSectionHeader = header;
      }
    });

    panel.appendChild(header);
    panel.appendChild(content);
    return content;
  }

  // --- slider helper ---
  function slider(
    sectionContainer: HTMLDivElement,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    fmt: (v: number) => string = (v) => String(v),
  ) {
    const row = document.createElement('label');
    row.className = 'dev-row';
    row.style.display = 'block';

    const head = document.createElement('div');
    head.className = 'dev-row-head';

    const name = document.createElement('span');
    name.textContent = label;

    const val = document.createElement('span');
    val.className = 'dev-row-val';
    val.textContent = fmt(get());

    head.appendChild(name);
    head.appendChild(val);

    const input = document.createElement('input');
    input.className = 'dev-slider-input';
    input.type = 'range';
    input.dataset.label = label;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      set(v);
      val.textContent = fmt(v);
    });

    row.appendChild(head);
    row.appendChild(input);
    sectionContainer.appendChild(row);

    refreshers.push(() => {
      input.value = String(get());
      val.textContent = fmt(get());
    });
    return row;
  }

  /** Grey-out + disable (or re-enable) a control row built by slider()/checkbox(). */
  function setRowEnabled(row: HTMLElement, enabled: boolean) {
    const locked = gamescom.enabled && row.dataset.gamescomOverride === 'true';
    const active = enabled && !locked;
    row.style.opacity = active ? '' : '0.35';
    row.style.pointerEvents = active ? '' : 'none';
    if (row.matches('input, select, button, textarea')) {
      (row as HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement).disabled = !active;
    }
    row.querySelectorAll('input, select, button, textarea').forEach((el) => {
      (el as HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement).disabled = !active;
    });
  }

  function lockWhenGamesCom(row: HTMLElement) {
    row.dataset.gamescomOverride = 'true';
    gamescomLockedRows.add(row);
    return row;
  }

  function refreshGamesComLocks() {
    gamescomLockedRows.forEach((row) => setRowEnabled(row, true));
  }

  // --- checkbox helper ---
  function checkbox(sectionContainer: HTMLDivElement, label: string, get: () => boolean, set: (v: boolean) => void) {
    const row = document.createElement('label');
    row.className = 'dev-checkbox-row';

    const input = document.createElement('input');
    input.className = 'dev-checkbox-input';
    input.type = 'checkbox';
    input.checked = get();

    input.addEventListener('change', () => set(input.checked));

    const name = document.createElement('span');
    name.textContent = label;

    row.appendChild(input);
    row.appendChild(name);
    sectionContainer.appendChild(row);

    refreshers.push(() => (input.checked = get()));
    return row;
  }

  // --- colour-swatch helper (edits a hex number via <input type=color>) ---
  const hex6 = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
  function colorRow(
    section: HTMLDivElement,
    label: string,
    get: () => number,
    set: (n: number) => void,
  ) {
    const row = document.createElement('label');
    row.className = 'dev-checkbox-row';
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'dev-color-input';
    input.value = hex6(get());
    input.addEventListener('input', () => set(parseInt(input.value.slice(1), 16)));
    const name = document.createElement('span');
    name.textContent = label;
    row.appendChild(input);
    row.appendChild(name);
    section.appendChild(row);
    refreshers.push(() => (input.value = hex6(get())));
    return row;
  }

  // =========================================================================
  // GAMESCOM MODE — curated exhibition level (GamesCom Canyon) + forced rule set.
  // Enabling forces the Canyon for every segment and applies GAMESCOM_RULES over
  // `dev` (evolving framework — see runtime.ts). Restart/replay to re-stream the world.
  // =========================================================================
  const secGamesCom = createSection('GamesCom Rules');
  const applyGamesComPanelRules = () => {
    applyGamesComRules();
    refreshAll();
    refreshGamesComLocks();
  };
  checkbox(
    secGamesCom,
    'Enable GamesCom mode (Canyon + forced rules)',
    () => gamescom.enabled,
    (v) => {
      setGamesComEnabled(v);
      if (v) applyGamesComObstacleDefaults(); // curated allowlist: only the cylinder set
      applyGamesComPanelRules(); // forced rules change several sliders — re-sync their displays
      refreshAll();
    },
  );
  slider(
    secGamesCom,
    'Canyon wall gap',
    6,
    22,
    0.25,
    () => gamescom.canyonWallGap,
    (v) => (gamescom.canyonWallGap = v),
    (v) => v.toFixed(2) + 'm',
  );
  slider(
    secGamesCom,
    'Canyon wall height',
    3,
    30,
    0.5,
    () => gamescom.canyonWallHeight,
    (v) => (gamescom.canyonWallHeight = v),
    (v) => v.toFixed(1) + 'm',
  );
  slider(
    secGamesCom,
    'Canyon side draw distance',
    1,
    3,
    0.05,
    () => gamescom.canyonDrawDistanceScale,
    (v) => (gamescom.canyonDrawDistanceScale = v),
    (v) => v.toFixed(2) + '×',
  );
  const canyonMirrorRows: HTMLElement[] = [];
  const canyonAsymRows: HTMLElement[] = [];
  const applyCanyonSlopeMode = () => {
    canyonMirrorRows.forEach((r) => setRowEnabled(r, gamescom.canyonMirrorSlopes));
    canyonAsymRows.forEach((r) => setRowEnabled(r, !gamescom.canyonMirrorSlopes));
  };
  checkbox(secGamesCom, 'Mirror cliff slope L/R', () => gamescom.canyonMirrorSlopes, (v) => {
    gamescom.canyonMirrorSlopes = v;
    applyCanyonSlopeMode();
  });
  canyonMirrorRows.push(
    slider(
      secGamesCom,
      '• mirrored slope',
      0,
      90,
      1,
      () => gamescom.canyonSlopeDeg,
      (v) => (gamescom.canyonSlopeDeg = v),
      (v) => `${Math.round(v)}°`,
    ),
  );
  canyonAsymRows.push(
    slider(
      secGamesCom,
      '• left slope',
      0,
      90,
      1,
      () => gamescom.canyonLeftSlopeDeg,
      (v) => (gamescom.canyonLeftSlopeDeg = v),
      (v) => `${Math.round(v)}°`,
    ),
    slider(
      secGamesCom,
      '• right slope',
      0,
      90,
      1,
      () => gamescom.canyonRightSlopeDeg,
      (v) => (gamescom.canyonRightSlopeDeg = v),
      (v) => `${Math.round(v)}°`,
    ),
  );
  refreshers.push(applyCanyonSlopeMode);
  applyCanyonSlopeMode();
  const canyonMirrorCurveRows: HTMLElement[] = [];
  const canyonAsymCurveRows: HTMLElement[] = [];
  const applyCanyonCurveMode = () => {
    canyonMirrorCurveRows.forEach((r) => setRowEnabled(r, gamescom.canyonMirrorCurves));
    canyonAsymCurveRows.forEach((r) => setRowEnabled(r, !gamescom.canyonMirrorCurves));
  };
  checkbox(secGamesCom, 'Mirror cliff curve L/R', () => gamescom.canyonMirrorCurves, (v) => {
    gamescom.canyonMirrorCurves = v;
    applyCanyonCurveMode();
  });
  checkbox(secGamesCom, 'Flatten cliff curve at top', () => gamescom.canyonCurveFlattenTop, (v) => {
    gamescom.canyonCurveFlattenTop = v;
  });
  const curveFmt = (v: number) =>
    (v > 0 ? '+' : '') + v.toFixed(1) + 'm';
  canyonMirrorCurveRows.push(
    slider(
      secGamesCom,
      '• mirrored curve',
      -8,
      8,
      0.1,
      () => gamescom.canyonCurve,
      (v) => (gamescom.canyonCurve = v),
      curveFmt,
    ),
  );
  canyonAsymCurveRows.push(
    slider(
      secGamesCom,
      '• left curve',
      -8,
      8,
      0.1,
      () => gamescom.canyonLeftCurve,
      (v) => (gamescom.canyonLeftCurve = v),
      curveFmt,
    ),
    slider(
      secGamesCom,
      '• right curve',
      -8,
      8,
      0.1,
      () => gamescom.canyonRightCurve,
      (v) => (gamescom.canyonRightCurve = v),
      curveFmt,
    ),
  );
  refreshers.push(applyCanyonCurveMode);
  applyCanyonCurveMode();
  const canyonGridRows: HTMLElement[] = [];
  const applyCanyonGridMode = () => {
    canyonGridRows.forEach((r) => setRowEnabled(r, gamescom.canyonGridLines));
  };
  checkbox(secGamesCom, 'Show subtle canyon grid', () => gamescom.canyonGridLines, (v) => {
    gamescom.canyonGridLines = v;
    applyCanyonGridMode();
  });
  canyonGridRows.push(
    slider(
      secGamesCom,
      '• grid opacity',
      0.02,
      1.0,
      0.01,
      () => gamescom.canyonGridOpacity,
      (v) => (gamescom.canyonGridOpacity = v),
      (v) => Math.round(v * 100) + '%',
    ),
  );
  refreshers.push(applyCanyonGridMode);
  applyCanyonGridMode();
  slider(
    secGamesCom,
    'GamesCom bloom override',
    0,
    0.6,
    0.01,
    () => gamescom.bloomIntensity,
    (v) => {
      gamescom.bloomIntensity = v;
      applyGamesComPanelRules();
    },
    (v) => v.toFixed(2) + '×',
  );
  slider(
    secGamesCom,
    'Hero container scale',
    0.5,
    3,
    0.05,
    () => gamescom.heroContScale,
    (v) => {
      gamescom.heroContScale = v;
      applyGamesComPanelRules();
    },
    (v) => v.toFixed(2) + '×',
  );
  slider(
    secGamesCom,
    'Booster offset Y',
    -4,
    4,
    0.02,
    () => gamescom.boosterY,
    (v) => {
      gamescom.boosterY = v;
      applyGamesComPanelRules();
    },
    (v) => v.toFixed(2),
  );
  slider(
    secGamesCom,
    'Ring orb size',
    0.25,
    2.5,
    0.05,
    () => gamescom.ringOrbScale,
    (v) => (gamescom.ringOrbScale = v),
    (v) => Math.round(v * 100) + '% hero',
  );
  slider(
    secGamesCom,
    'Canyon lateral reach',
    -3,
    4,
    0.05,
    () => gamescom.steerMulX,
    (v) => {
      gamescom.steerMulX = v;
      applyGamesComPanelRules();
    },
    (v) => (v >= 0 ? '+' : '') + v.toFixed(2),
  );
  slider(
    secGamesCom,
    'Canyon top reach',
    -2,
    18,
    0.1,
    () => gamescom.steerMulUp,
    (v) => {
      gamescom.steerMulUp = v;
      applyGamesComPanelRules();
    },
    (v) => (v >= 0 ? '+' : '') + v.toFixed(1),
  );
  slider(
    secGamesCom,
    'Canyon bottom reach',
    -4,
    8,
    0.1,
    () => gamescom.steerMulDown,
    (v) => {
      gamescom.steerMulDown = v;
      applyGamesComPanelRules();
    },
    (v) => (v >= 0 ? '+' : '') + v.toFixed(1),
  );
  const playMulFmt = (v: number) => v.toFixed(1) + '×';
  slider(
    secGamesCom,
    'Play wall-gap difficulty',
    0,
    10,
    0.1,
    () => gamescom.playWallGapDifficultyMul,
    (v) => (gamescom.playWallGapDifficultyMul = v),
    playMulFmt,
  );
  slider(
    secGamesCom,
    'Play slope difficulty',
    0,
    10,
    0.1,
    () => gamescom.playSlopeDifficultyMul,
    (v) => (gamescom.playSlopeDifficultyMul = v),
    playMulFmt,
  );
  slider(
    secGamesCom,
    'Play obstacle difficulty',
    0,
    10,
    0.1,
    () => gamescom.playObstacleDifficultyMul,
    (v) => (gamescom.playObstacleDifficultyMul = v),
    playMulFmt,
  );
  slider(
    secGamesCom,
    'Play base-speed difficulty',
    0,
    10,
    0.1,
    () => gamescom.playBaseSpeedDifficultyMul,
    (v) => (gamescom.playBaseSpeedDifficultyMul = v),
    playMulFmt,
  );
  slider(
    secGamesCom,
    'Play acceleration difficulty',
    0,
    10,
    0.1,
    () => gamescom.playAccelerationDifficultyMul,
    (v) => (gamescom.playAccelerationDifficultyMul = v),
    playMulFmt,
  );
  slider(
    secGamesCom,
    'Play boost difficulty',
    0,
    10,
    0.1,
    () => gamescom.playSpeedBoostDifficultyMul,
    (v) => (gamescom.playSpeedBoostDifficultyMul = v),
    playMulFmt,
  );

  // GamesCom-specific canyon palette. Sky + lighting update live; floor / walls / grid
  // are baked per room, so they recolour on rooms streamed AFTER a change (fly forward).
  // sky gradient (three stops: top → mid → horizon) — independent of the surfaces below
  colorRow(secGamesCom, '• sky gradient — top', () => GAMESCOM_CANYON.top, (v) => (GAMESCOM_CANYON.top = v));
  colorRow(secGamesCom, '• sky gradient — mid', () => gamescom.canyonSkyMid, (v) => (gamescom.canyonSkyMid = v));
  colorRow(secGamesCom, '• sky gradient — horizon', () => GAMESCOM_CANYON.horizon, (v) => (GAMESCOM_CANYON.horizon = v));
  // level surface colours
  colorRow(secGamesCom, '• canyon walls', () => gamescom.canyonWallColor, (v) => (gamescom.canyonWallColor = v));
  colorRow(secGamesCom, '• canyon floor', () => gamescom.canyonFloorColor, (v) => (gamescom.canyonFloorColor = v));
  colorRow(secGamesCom, '• canyon accent (grid/rim)', () => GAMESCOM_CANYON.accent, (v) => (GAMESCOM_CANYON.accent = v));
  colorRow(secGamesCom, '• canyon light', () => GAMESCOM_CANYON.light, (v) => (GAMESCOM_CANYON.light = v));
  slider(
    secGamesCom,
    'Player floor reflection',
    0,
    1,
    0.01,
    () => gamescom.playerReflectionOpacity,
    (v) => (gamescom.playerReflectionOpacity = v),
    (v) => Math.round(v * 100) + '%',
  );

  // =========================================================================
  // OBSTACLE PATTERN FILTER — global allowlist for the track generator.
  // =========================================================================
  const secObstacles = createSection('Obstacles');
  // obstacle colour is independent of the level palette (its own control)
  colorRow(secObstacles, 'Obstacle colour', () => dev.obstacleColor, (v) => (dev.obstacleColor = v));
  const obstacleBtns = document.createElement('div');
  Object.assign(obstacleBtns.style, { display: 'flex', gap: '6px', margin: '8px 0 10px' } as Partial<CSSStyleDeclaration>);
  for (const [label, checked] of [
    ['Check all', true],
    ['Uncheck all', false],
  ] as const) {
    const b = document.createElement('button');
    b.className = 'dev-btn';
    b.textContent = label;
    b.addEventListener('click', () => {
      for (const name of PATTERN_NAMES) dev.obstacleEnabled[name] = checked;
      refreshAll();
      refreshGamesComLocks();
    });
    obstacleBtns.appendChild(b);
  }
  secObstacles.appendChild(obstacleBtns);
  for (const name of PATTERN_NAMES) {
    checkbox(
      secObstacles,
      name,
      () => dev.obstacleEnabled[name] !== false,
      (v) => (dev.obstacleEnabled[name] = v),
    );
  }

  // =========================================================================
  // SPEED STREAK / POWER COLOURS — the 4 colours the warp streaks + side orb take
  // from the current power state. Dynamic off = everything goes white.
  // =========================================================================
  const secStreak = createSection('Speed Streak Colours');
  checkbox(secStreak, 'Dynamic colours (off = white)', () => dev.speedDynamicColors, (v) => (dev.speedDynamicColors = v));
  const streakLabels = ['Red', 'Blue', 'Yellow', 'Green'] as const;
  for (let i = 0; i < 4; i++) {
    colorRow(secStreak, '• ' + streakLabels[i], () => RING_COLORS[i], (v) => (RING_COLORS[i] = v));
  }

  // =========================================================================
  // OBSTACLE HIGHLIGHT — outline around destroyable obstacles inside the forward
  // cone. Range can either follow missiles or use its own slider. Thickness 0 = off.
  // =========================================================================
  const secHighlight = createSection('Obstacle Highlight');
  colorRow(secHighlight, 'Highlight colour', () => dev.highlightColor, (v) => (dev.highlightColor = v));
  slider(
    secHighlight,
    'Outline thickness (0 = off)',
    0,
    8,
    0.5,
    () => dev.highlightThickness,
    (v) => (dev.highlightThickness = v),
    (v) => v.toFixed(1),
  );
  const highlightRangeRows: HTMLElement[] = [];
  const applyHighlightRangeMode = () => {
    highlightRangeRows.forEach((r) => setRowEnabled(r, !dev.highlightSameAsMissileRange));
  };
  checkbox(secHighlight, 'Same as Missile range', () => dev.highlightSameAsMissileRange, (v) => {
    dev.highlightSameAsMissileRange = v;
    applyHighlightRangeMode();
  });
  highlightRangeRows.push(
    slider(
      secHighlight,
      'Highlight range',
      20,
      300,
      2,
      () => dev.highlightRange,
      (v) => (dev.highlightRange = v),
      (v) => v.toFixed(0) + 'm',
    ),
  );
  refreshers.push(applyHighlightRangeMode);
  applyHighlightRangeMode();

  // =========================================================================
  // SECTION 1: SPEED & PROGRESSION
  // =========================================================================
  const secSpeed = createSection('Speed & Progression');
  slider(secSpeed, 'Base speed', 6, 70, 1, () => dev.baseSpeed, (v) => (dev.baseSpeed = v));
  slider(secSpeed, 'Acceleration / m', 0, 0.06, 0.002, () => dev.accel, (v) => (dev.accel = v), (v) => v.toFixed(3));
  slider(secSpeed, 'Max speed bonus', 0, 70, 1, () => dev.maxBonus, (v) => (dev.maxBonus = v));
  slider(secSpeed, 'Level length', 80, 1500, 10, () => dev.levelLength, (v) => (dev.levelLength = v), (v) => `${Math.round(v)} m`);
  checkbox(secSpeed, 'Infinite levels (no finish)', () => dev.infiniteLevels, (v) => (dev.infiniteLevels = v));
  checkbox(secSpeed, '• infinite: GATED cycle (off = gateless free flight)', () => dev.infiniteGated, (v) => (dev.infiniteGated = v));

  // --- Levels & cycle: mode-dependent list with active toggles + drag-to-reorder ---
  // The active set + order drive ALL progression (and the gated infinite cycle).
  {
    const secLevels = createSection('Levels & Cycle');
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;opacity:0.6;margin:2px 4px 6px;';
    hint.textContent = 'Tick = playable · drag ⠿ to reorder. Shows the active mode’s levels (GamesCom vs general).';
    secLevels.appendChild(hint);
    const list = document.createElement('div');
    secLevels.appendChild(list);

    let dragFrom = -1;
    const modeArrays = () => {
      const gc = gamescom.enabled;
      return {
        order: gc ? dev.gamescomLevelOrder : dev.generalLevelOrder,
        active: gc ? dev.gamescomLevelActive : dev.generalLevelActive,
        names: (gc ? GAMESCOM_ALL_CHAPTERS : CHAPTERS).map((c) => c.name),
      };
    };
    const renderLevels = () => {
      const { order, active, names } = modeArrays();
      list.innerHTML = '';
      order.forEach((srcIdx, pos) => {
        const on = active[srcIdx] !== false;
        const row = document.createElement('div');
        row.draggable = true;
        row.style.cssText =
          'display:flex;align-items:center;gap:6px;padding:4px 6px;margin:2px 0;background:rgba(255,255,255,0.06);border-radius:4px;cursor:grab;font-size:11px;opacity:' +
          (on ? '1' : '0.45');
        const handle = document.createElement('span');
        handle.textContent = '⠿';
        handle.style.opacity = '0.5';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = on;
        cb.addEventListener('change', () => {
          active[srcIdx] = cb.checked;
          row.style.opacity = cb.checked ? '1' : '0.45';
        });
        const nm = document.createElement('span');
        nm.textContent = `${pos + 1}. ${names[srcIdx] ?? 'LEVEL ' + (srcIdx + 1)}`;
        nm.style.flex = '1';
        row.append(handle, cb, nm);
        row.addEventListener('dragstart', () => {
          dragFrom = pos;
          row.style.opacity = '0.3';
        });
        row.addEventListener('dragend', () => {
          dragFrom = -1;
          renderLevels();
        });
        row.addEventListener('dragover', (e) => e.preventDefault());
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          if (dragFrom < 0 || dragFrom === pos) return;
          const [moved] = order.splice(dragFrom, 1);
          order.splice(pos, 0, moved);
          renderLevels();
        });
        list.appendChild(row);
      });
    };
    renderLevels();
    // Re-render when the run mode (GamesCom vs general) flips, so the right list shows.
    let lastGc = gamescom.enabled;
    refreshers.push(() => {
      if (gamescom.enabled !== lastGc) {
        lastGc = gamescom.enabled;
        renderLevels();
      }
    });
  }

  // =========================================================================
  // SECTION 2: FEEL & SCALE
  // =========================================================================
  const secFeel = createSection('Feel & Scale');
  lockWhenGamesCom(slider(secFeel, 'Steer sharpness', 0.5, 4, 0.1, () => dev.steerSpeed, (v) => (dev.steerSpeed = v), (v) => v.toFixed(1) + '×'));
  slider(secFeel, 'Keyboard sensitivity', 0.25, 2.5, 0.05, () => dev.keyboardSteerSensitivity, (v) => (dev.keyboardSteerSensitivity = v), (v) => v.toFixed(2) + '×');
  slider(secFeel, 'Mobile joystick sensitivity', 0.25, 2.5, 0.05, () => dev.mobileJoystickSensitivity, (v) => (dev.mobileJoystickSensitivity = v), (v) => v.toFixed(2) + '×');
  slider(secFeel, 'Steer × at top speed (keyboard)', 0.1, 5, 0.05, () => dev.speedSteerMul, (v) => (dev.speedSteerMul = v), (v) => v.toFixed(2) + '×');
  slider(secFeel, 'Reach × at top speed (mobile)', 0.1, 5, 0.05, () => dev.mobileSpeedReachMul, (v) => (dev.mobileSpeedReachMul = v), (v) => v.toFixed(2) + '×');
  slider(secFeel, 'World scale (corridor)', 0.5, 5, 0.1, () => dev.worldScale, (v) => (dev.worldScale = v), (v) => v.toFixed(1) + '×');
  checkbox(secFeel, 'Auto world-scale (oscillate)', () => dev.worldScaleAuto, (v) => (dev.worldScaleAuto = v));
  slider(secFeel, '• scale min', 0.5, 5, 0.1, () => dev.worldScaleMin, (v) => (dev.worldScaleMin = v), (v) => v.toFixed(1) + '×');
  slider(secFeel, '• scale max', 0.5, 5, 0.1, () => dev.worldScaleMax, (v) => (dev.worldScaleMax = v), (v) => v.toFixed(1) + '×');
  slider(secFeel, '• scale rate', 0.02, 2, 0.02, () => dev.worldScaleRate, (v) => (dev.worldScaleRate = v), (v) => v.toFixed(2));
  slider(secFeel, 'Crash freeze (hitstop)', 0, 2, 0.05, () => dev.crashFreeze, (v) => (dev.crashFreeze = v), (v) => v.toFixed(2) + 's');
  slider(secFeel, 'Crash invuln (i-frames)', 0, 6, 0.25, () => dev.crashInvuln, (v) => (dev.crashInvuln = v), (v) => v.toFixed(2) + 's');
  slider(secFeel, '• i-frame flash rate', 1, 24, 1, () => dev.invulnFlashHz, (v) => (dev.invulnFlashHz = v), (v) => v.toFixed(0) + ' Hz');
  slider(secFeel, 'Crash slowdown harshness', 0, 0.95, 0.01, () => dev.crashSpeedLoss, (v) => (dev.crashSpeedLoss = v), (v) => Math.round(v * 100) + '%');
  slider(secFeel, 'Fragment volume (shards)', 0.5, 4, 0.1, () => dev.fragVolume, (v) => (dev.fragVolume = v), (v) => v.toFixed(1) + '×');
  slider(secFeel, 'Glass / obstacle opacity', 0.1, 1, 0.05, () => dev.glassOpacity, (v) => (dev.glassOpacity = v), (v) => v.toFixed(2));
  lockWhenGamesCom(slider(secFeel, 'Bloom intensity', 0.0, 3.0, 0.01, () => dev.bloomIntensity, (v) => (dev.bloomIntensity = v), (v) => v.toFixed(2) + '×'));

  // =========================================================================
  // SECTION 3: SHIELD & BOOST ARMOUR
  // =========================================================================
  const secShield = createSection('Shield & Boost Armour');
  lockWhenGamesCom(checkbox(secShield, 'Boost armour (shield on boost)', () => dev.boostArmour, (v) => (dev.boostArmour = v)));
  slider(secShield, '• consecutive boosts needed', 1, 5, 1, () => dev.boostArmourRequired, (v) => (dev.boostArmourRequired = v));
  slider(secShield, '• streak window time', 1, 15, 0.5, () => dev.boostArmourWindow, (v) => (dev.boostArmourWindow = v), (v) => v.toFixed(1) + 's');
  slider(secShield, '• boosts for world roll', 1, 15, 1, () => dev.boostsForWorldRoll, (v) => (dev.boostsForWorldRoll = v));
  lockWhenGamesCom(slider(secShield, '• crystal rings to trigger comet', 1, 8, 1, () => dev.crystalsForComet, (v) => (dev.crystalsForComet = v)));
  lockWhenGamesCom(checkbox(secShield, '• shield ALWAYS OFF', () => dev.boostArmourAlwaysOff, (v) => (dev.boostArmourAlwaysOff = v)));
  lockWhenGamesCom(checkbox(secShield, '• shield ALWAYS ON', () => dev.boostArmourAlwaysOn, (v) => (dev.boostArmourAlwaysOn = v)));
  slider(secShield, '• shield scale', 0.2, 4.0, 0.05, () => dev.shieldScale, (v) => (dev.shieldScale = v), (v) => v.toFixed(2) + '×');
  slider(secShield, '• shield position X', -4.0, 4.0, 0.05, () => dev.shieldOffsetX, (v) => (dev.shieldOffsetX = v), (v) => v.toFixed(2));
  slider(secShield, '• shield position Y', -4.0, 4.0, 0.05, () => dev.shieldOffsetY, (v) => (dev.shieldOffsetY = v), (v) => v.toFixed(2));
  slider(secShield, '• shield position Z', -4.0, 4.0, 0.05, () => dev.shieldOffsetZ, (v) => (dev.shieldOffsetZ = v), (v) => v.toFixed(2));
  slider(secShield, '• boost armour break fragments', 1.0, 5.0, 0.05, () => dev.boostArmourFragMultiplier, (v) => (dev.boostArmourFragMultiplier = v), (v) => v.toFixed(2) + '×');
  slider(secShield, '• boost armour frag travel speed', 5.0, 60.0, 0.5, () => dev.boostArmourFragSpeed, (v) => (dev.boostArmourFragSpeed = v), (v) => v.toFixed(1) + ' m/s');

  // shield trail style dropdown
  const trailRow = document.createElement('label');
  trailRow.className = 'dev-row';
  trailRow.style.display = 'block';
  const trailHead = document.createElement('div');
  trailHead.className = 'dev-row-head';
  trailHead.textContent = 'Shield trail style';
  const trailSelect = document.createElement('select');
  Object.assign(trailSelect.style, {
    width: '100%',
    background: '#0b1424',
    color: '#cfeaff',
    border: '1px solid rgba(0, 243, 255, 0.25)',
    borderRadius: '5px',
    padding: '4px',
    marginTop: '3px',
    outline: 'none',
  } as Partial<CSSStyleDeclaration>);
  
  const optComet = document.createElement('option');
  optComet.value = '0';
  optComet.textContent = 'Comet (Particles)';
  trailSelect.appendChild(optComet);
  
  const optRibbon = document.createElement('option');
  optRibbon.value = '1';
  optRibbon.textContent = 'Ribbon (3D Tapered Mesh)';
  trailSelect.appendChild(optRibbon);
  
  trailSelect.value = String(dev.shieldTrailType);
  trailRow.appendChild(trailHead);
  trailRow.appendChild(trailSelect);
  secShield.appendChild(trailRow);
  lockWhenGamesCom(trailRow);

  const shieldRibbonRows: HTMLElement[] = [];
  shieldRibbonRows.push(
    slider(secShield, '• shield trail width', 0.1, 5.0, 0.05, () => dev.shieldTrailWidth, (v) => (dev.shieldTrailWidth = v), (v) => v.toFixed(2) + 'm'),
    slider(secShield, '• shield trail decay exponent', 0.1, 8.0, 0.05, () => dev.shieldTrailDecay, (v) => (dev.shieldTrailDecay = v), (v) => v.toFixed(2))
  );

  const applyShieldTrailMode = () => {
    const isRibbon = dev.shieldTrailType === 1;
    shieldRibbonRows.forEach((r) => setRowEnabled(r, isRibbon));
  };

  trailSelect.addEventListener('change', () => {
    dev.shieldTrailType = parseInt(trailSelect.value, 10);
    applyShieldTrailMode();
  });

  refreshers.push(() => {
    trailSelect.value = String(dev.shieldTrailType);
    applyShieldTrailMode();
  });

  // =========================================================================
  // SECTION 4: SCATTER MISSILES
  // =========================================================================
  const secMissiles = createSection('Scatter Missiles');
  slider(secMissiles, 'Missiles per salvo', 1, 14, 1, () => dev.missileCount, (v) => (dev.missileCount = v));
  slider(secMissiles, '• missile speed', 20, 250, 5, () => dev.missileSpeed, (v) => (dev.missileSpeed = v), (v) => v.toFixed(0) + ' u/s');
  checkbox(secMissiles, '• missile impact explosions', () => dev.missileExplosions, (v) => (dev.missileExplosions = v));
  slider(secMissiles, '• missile cone half-angle', 5, 60, 1, () => dev.missileConeAngle, (v) => (dev.missileConeAngle = v), (v) => v.toFixed(0) + '°');
  slider(secMissiles, '• missile cone range', 20, 300, 2, () => dev.missileConeRange, (v) => (dev.missileConeRange = v), (v) => v.toFixed(0) + 'm');
  checkbox(secMissiles, '• show missile target cone', () => dev.showMissileCone, (v) => (dev.showMissileCone = v));
  slider(secMissiles, 'Gate boost duration', 1.0, 15.0, 0.5, () => dev.gateBoostDuration, (v) => (dev.gateBoostDuration = v), (v) => v.toFixed(1) + 's');

  // =========================================================================
  // SECTION 5: PLAYER BOUNDS & COLLISION
  // =========================================================================
  const secBounds = createSection('Player Bounds & Hitbox');
  lockWhenGamesCom(slider(secBounds, 'Lateral reach (offset)', -6, 10, 0.1, () => dev.steerMulX, (v) => (dev.steerMulX = v), (v) => (v >= 0 ? '+' : '') + v.toFixed(1)));
  lockWhenGamesCom(slider(secBounds, 'Top reach offset (up)', -6, 18, 0.1, () => dev.steerMulUp, (v) => (dev.steerMulUp = v), (v) => (v >= 0 ? '+' : '') + v.toFixed(1)));
  lockWhenGamesCom(slider(secBounds, 'Bottom reach offset (down)', -18, 16, 0.1, () => dev.steerMulDown, (v) => (dev.steerMulDown = v), (v) => (v >= 0 ? '+' : '') + v.toFixed(1)));
  checkbox(secBounds, 'Optokinetic reflex (gyro-stabilise craft in frame)', () => dev.optokineticReflex, (v) => (dev.optokineticReflex = v));
  // Pickup magnet: rings/orbs/crystals within this radius fly into the player (0 = off; never affects obstacles)
  slider(secBounds, 'Pickup magnet field (0 = off)', 0, 40, 0.5, () => dev.pickupMagnetRadius, (v) => (dev.pickupMagnetRadius = v), (v) => v.toFixed(1));
  checkbox(secBounds, 'Show pickup magnet field', () => dev.showPickupField, (v) => (dev.showPickupField = v));
  checkbox(secBounds, 'Show movement bounds', () => dev.showBounds, (v) => (dev.showBounds = v));
  checkbox(secBounds, 'Show hit box (collision)', () => dev.showHitBox, (v) => (dev.showHitBox = v));
  checkbox(secBounds, 'Show ride line (safe path)', () => dev.showRideLine, (v) => (dev.showRideLine = v));
  checkbox(secBounds, 'Ride line starts at player', () => dev.rideFromPlayer, (v) => (dev.rideFromPlayer = v));
  slider(secBounds, 'Block scan distance', 40, 190, 4, () => dev.scoutDist, (v) => (dev.scoutDist = v), (v) => v.toFixed(0) + 'm');
  slider(secBounds, 'Block clearance (× model)', 1, 5, 0.1, () => dev.blockClearance, (v) => (dev.blockClearance = v), (v) => v.toFixed(1) + '×');
  slider(secBounds, 'Block warn distance', 20, 190, 4, () => dev.blockWarnDist, (v) => (dev.blockWarnDist = v), (v) => v.toFixed(0) + 'm');
  slider(secBounds, 'Hit box X (half)', 0.1, 4, 0.05, () => dev.hitX, (v) => (dev.hitX = v), (v) => v.toFixed(2));
  slider(secBounds, 'Hit box Y (half)', 0.1, 4, 0.05, () => dev.hitY, (v) => (dev.hitY = v), (v) => v.toFixed(2));
  slider(secBounds, 'Hit box Z (band)', 0.2, 8, 0.1, () => dev.hitZ, (v) => (dev.hitZ = v), (v) => v.toFixed(2));

  // =========================================================================
  // SECTION 6: HERO MODEL & BOOSTERS
  // =========================================================================
  const secHero = createSection('Hero Model & Boosters');
  slider(secHero, 'Pos X', -3, 3, 0.02, () => dev.heroPosX, (v) => (dev.heroPosX = v), (v) => v.toFixed(2));
  slider(secHero, 'Pos Y', -4, 4, 0.02, () => dev.heroPosY, (v) => (dev.heroPosY = v), (v) => v.toFixed(2));
  slider(secHero, 'Pos Z', -3, 3, 0.02, () => dev.heroPosZ, (v) => (dev.heroPosZ = v), (v) => v.toFixed(2));
  slider(secHero, 'Rot X (pitch)', -180, 180, 1, () => dev.heroRotXDeg, (v) => (dev.heroRotXDeg = v), (v) => `${Math.round(v)}°`);
  slider(secHero, 'Rot Y (yaw)', -180, 180, 1, () => dev.heroRotYDeg, (v) => (dev.heroRotYDeg = v), (v) => `${Math.round(v)}°`);
  slider(secHero, 'Rot Z (roll)', -180, 180, 1, () => dev.heroRotZDeg, (v) => (dev.heroRotZDeg = v), (v) => `${Math.round(v)}°`);
  lockWhenGamesCom(slider(secHero, 'Container scale', 0.2, 4, 0.01, () => dev.heroContScale, (v) => (dev.heroContScale = v), (v) => v.toFixed(2) + '×'));
  slider(secHero, 'Container Rot X', -180, 180, 1, () => dev.heroContRotXDeg, (v) => (dev.heroContRotXDeg = v), (v) => `${Math.round(v)}°`);
  slider(secHero, 'Container Rot Y', -180, 180, 1, () => dev.heroContRotYDeg, (v) => (dev.heroContRotYDeg = v), (v) => `${Math.round(v)}°`);
  slider(secHero, 'Container Rot Z', -180, 180, 1, () => dev.heroContRotZDeg, (v) => (dev.heroContRotZDeg = v), (v) => `${Math.round(v)}°`);
  checkbox(secHero, 'Aim nose to screen centre', () => dev.aimNoseToCentre, (v) => (dev.aimNoseToCentre = v));
  slider(secHero, 'Booster spacing X', 0, 6, 0.02, () => dev.boosterX, (v) => (dev.boosterX = v), (v) => v.toFixed(2));
  lockWhenGamesCom(slider(secHero, 'Booster offset Y', -4, 4, 0.02, () => dev.boosterY, (v) => (dev.boosterY = v), (v) => v.toFixed(2)));
  slider(secHero, 'Booster offset Z', -4, 6, 0.02, () => dev.boosterZ, (v) => (dev.boosterZ = v), (v) => v.toFixed(2));
  slider(secHero, 'Orb trail width', 0.1, 5.0, 0.05, () => dev.orbTrailWidth, (v) => (dev.orbTrailWidth = v), (v) => v.toFixed(2) + 'm');
  slider(secHero, 'Orb trail decay exponent', 0.1, 8.0, 0.05, () => dev.orbTrailDecay, (v) => (dev.orbTrailDecay = v), (v) => v.toFixed(2));
  lockWhenGamesCom(checkbox(secHero, 'Barrel-roll / spin on ring pass', () => dev.spinOnRing, (v) => (dev.spinOnRing = v)));

  // =========================================================================
  // SECTION: AUDIO
  // =========================================================================
  const secAudio = createSection('Audio');
  slider(secAudio, 'Master Volume', 0, 1, 0.05, () => dev.masterVolume, (v) => { dev.masterVolume = v; syncMusicVolume(); }, (v) => v.toFixed(2));
  slider(secAudio, 'BGM volume', 0, 1, 0.05, () => dev.bgmVolume, (v) => { dev.bgmVolume = v; syncMusicVolume(); }, (v) => v.toFixed(2));
  slider(secAudio, 'SFX master', 0, 1, 0.05, () => dev.sfxVolume, (v) => (dev.sfxVolume = v), (v) => v.toFixed(2));

  // =========================================================================
  // SECTION: CAMERA & PERSPECTIVE
  // =========================================================================
  const secCamera = createSection('Camera & Perspective');
  slider(secCamera, 'Camera height (above)', 0, 24, 0.5, () => dev.camHeight, (v) => (dev.camHeight = v), (v) => v.toFixed(1));
  slider(secCamera, 'Camera distance (behind)', 4, 36, 0.5, () => dev.camBack, (v) => (dev.camBack = v), (v) => v.toFixed(1));
  slider(secCamera, 'Shoulder offset (OTS)', -12, 12, 0.5, () => dev.camShoulder, (v) => (dev.camShoulder = v), (v) => v.toFixed(1));
  slider(secCamera, 'Vanishing-point dist', 30, 220, 2, () => dev.camLookAhead, (v) => (dev.camLookAhead = v), (v) => v.toFixed(0));
  slider(secCamera, 'Pitch offset', -60, 60, 1, () => dev.camPitchDeg, (v) => (dev.camPitchDeg = v), (v) => `${Math.round(v)}°`);
  slider(secCamera, 'Yaw offset', -60, 60, 1, () => dev.camYawDeg, (v) => (dev.camYawDeg = v), (v) => `${Math.round(v)}°`);
  slider(secCamera, 'Lateral follow (0 = square)', 0, 1, 0.02, () => dev.camLatFollow, (v) => (dev.camLatFollow = v), (v) => v.toFixed(2));
  slider(secCamera, 'Vertical follow', 0, 1.5, 0.02, () => dev.camFollow, (v) => (dev.camFollow = v), (v) => v.toFixed(2));
  slider(secCamera, 'Lateral follow (in turns)', 0, 1, 0.02, () => dev.camLatFollowTurn, (v) => (dev.camLatFollowTurn = v), (v) => v.toFixed(2));
  slider(secCamera, 'Vertical follow (in turns)', 0, 1.5, 0.02, () => dev.camFollowTurn, (v) => (dev.camFollowTurn = v), (v) => v.toFixed(2));
  slider(secCamera, 'Zoom', 0.8, 3, 0.05, () => dev.camZoom, (v) => (dev.camZoom = v), (v) => v.toFixed(2) + '×');
  slider(secCamera, 'Zoom at speed (+/−)', -1, 2, 0.05, () => dev.speedZoom, (v) => (dev.speedZoom = v), (v) => v.toFixed(2) + '×');
  lockWhenGamesCom(checkbox(secCamera, 'Keep level (no roll in flight)', () => dev.keepLevel, (v) => (dev.keepLevel = v)));
  // sun / key-light source position
  slider(secCamera, 'Sun/light — lateral', -200, 200, 2, () => dev.sunLateral, (v) => (dev.sunLateral = v), (v) => v.toFixed(0));
  slider(secCamera, 'Sun/light — height', -20, 80, 1, () => dev.sunHeight, (v) => (dev.sunHeight = v), (v) => v.toFixed(0));
  slider(secCamera, 'Sun/light — distance', 20, 400, 5, () => dev.sunDistance, (v) => (dev.sunDistance = v), (v) => v.toFixed(0));
  const dynamicSunRows: HTMLElement[] = [];
  const applyDynamicSunMode = () => {
    dynamicSunRows.forEach((r) => setRowEnabled(r, dev.sunDynamic));
  };
  checkbox(secCamera, 'Dynamic sun/light follows player', () => dev.sunDynamic, (v) => {
    dev.sunDynamic = v;
    applyDynamicSunMode();
  });
  dynamicSunRows.push(
    slider(secCamera, '• dynamic light strength', 0, 1.5, 0.05, () => dev.sunDynamicStrength, (v) => (dev.sunDynamicStrength = v), (v) => v.toFixed(2)),
  );
  refreshers.push(applyDynamicSunMode);
  applyDynamicSunMode();
  // floor LIGHT pool (head light) position + size
  const floorLightRows: HTMLElement[] = [];
  const applyFloorLightMode = () => {
    floorLightRows.forEach((r) => setRowEnabled(r, dev.floorLightEnabled));
  };
  checkbox(secCamera, 'Enable original floor/head light', () => dev.floorLightEnabled, (v) => {
    dev.floorLightEnabled = v;
    applyFloorLightMode();
  });
  floorLightRows.push(
    slider(secCamera, 'Floor light — lateral', -25, 25, 0.5, () => dev.floorGlowX, (v) => (dev.floorGlowX = v), (v) => v.toFixed(1)),
    slider(secCamera, 'Floor light — height', 0.5, 24, 0.5, () => dev.floorGlowY, (v) => (dev.floorGlowY = v), (v) => v.toFixed(1)),
    slider(secCamera, 'Floor light — fwd(−)/back(+)', -30, 30, 0.5, () => dev.floorGlowZ, (v) => (dev.floorGlowZ = v), (v) => v.toFixed(1)),
    slider(secCamera, 'Floor light — reach/size', 10, 200, 2, () => dev.floorGlowReach, (v) => (dev.floorGlowReach = v), (v) => v.toFixed(0)),
    slider(secCamera, 'Floor light intensity', 0, 1.5, 0.05, () => dev.floorGlowIntensity, (v) => (dev.floorGlowIntensity = v), (v) => v.toFixed(2)),
  );
  refreshers.push(applyFloorLightMode);
  applyFloorLightMode();
  // Separate from the light pool: this only dims/boosts the glassy sky glint on
  // existing GamesCom canyon floors.
  slider(secCamera, 'Floor reflection (sky glint)', 0, 2, 0.05, () => dev.floorReflect, (v) => (dev.floorReflect = v), (v) => v.toFixed(2));

  // =========================================================================
  // SECTION 7: TURNS, SLOPES & LAYOUT
  // =========================================================================
  const secTrack = createSection('Turns, Slopes & Layout');
  slider(secTrack, 'Turn sharpness (L/R)', 0, 0.5, 0.01, () => dev.turnMax, (v) => (dev.turnMax = v), (v) => v.toFixed(2));
  lockWhenGamesCom(slider(secTrack, 'Slope sharpness (up/down)', 0, 0.5, 0.01, () => dev.elevMax, (v) => (dev.elevMax = v), (v) => v.toFixed(2)));
  slider(
    secTrack,
    'Turn/slope length',
    20,
    170,
    2,
    () => (dev.stretchMin + dev.stretchMax) / 2,
    (v) => {
      dev.stretchMin = v * 0.7;
      dev.stretchMax = v * 1.3;
    },
    (v) => v.toFixed(0),
  );
  slider(secTrack, 'Straight chance', 0, 1, 0.05, () => dev.straightChance, (v) => (dev.straightChance = v), (v) => v.toFixed(2));
  lockWhenGamesCom(slider(secTrack, 'Bank into turns', 0, 2.5, 0.05, () => dev.bank, (v) => (dev.bank = v), (v) => v.toFixed(2)));
  slider(secTrack, 'Bank smoothing speed', 0.1, 10, 0.1, () => dev.bankSmooth, (v) => (dev.bankSmooth = v), (v) => v.toFixed(1) + 's');

  const waveSpacingRow = slider(secTrack, 'Wave spacing (rooms)', 1, 12, 1, () => dev.waveSpacing, (v) => (dev.waveSpacing = v));
  const waveSpeedRows: HTMLElement[] = [];
  const applyWaveMode = () => {
    setRowEnabled(waveSpacingRow, !dev.waveBySpeed);
    waveSpeedRows.forEach((r) => setRowEnabled(r, dev.waveBySpeed));
  };
  checkbox(secTrack, 'Wave density by SPEED', () => dev.waveBySpeed, (v) => {
    dev.waveBySpeed = v;
    applyWaveMode();
  });
  waveSpeedRows.push(
    slider(secTrack, '• spacing @ base speed', 1, 12, 1, () => dev.waveSpeedMin, (v) => (dev.waveSpeedMin = v)),
    slider(secTrack, '• spacing @ top speed', 1, 14, 1, () => dev.waveSpeedMax, (v) => (dev.waveSpeedMax = v)),
    slider(secTrack, '• speed→spacing rate', 0.2, 2, 0.05, () => dev.waveSpeedRate, (v) => (dev.waveSpeedRate = v), (v) => v.toFixed(2) + '×'),
  );
  refreshers.push(applyWaveMode);
  applyWaveMode();

  // =========================================================================
  // SECTION 8: ZONE OVERRIDES
  // =========================================================================
  const secZones = createSection('Zone Overrides');
  
  // zone selector
  const zoneRow = document.createElement('label');
  zoneRow.className = 'dev-row';
  zoneRow.style.display = 'block';
  const zoneHead = document.createElement('div');
  zoneHead.className = 'dev-row-head';
  zoneHead.textContent = 'Current zone';
  const select = document.createElement('select');
  Object.assign(select.style, {
    width: '100%',
    background: '#0b1424',
    color: '#cfeaff',
    border: '1px solid rgba(0, 243, 255, 0.25)',
    borderRadius: '5px',
    padding: '4px',
    marginTop: '3px',
    outline: 'none',
  } as Partial<CSSStyleDeclaration>);
  const auto = document.createElement('option');
  auto.value = '-1';
  auto.textContent = 'AUTO (by distance)';
  select.appendChild(auto);
  CHAPTERS.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i + 1} · ${c.name}`;
    select.appendChild(o);
  });
  select.value = String(dev.zoneOverride);
  select.addEventListener('change', () => (dev.zoneOverride = parseInt(select.value, 10)));
  refreshers.push(() => (select.value = String(dev.zoneOverride)));
  zoneRow.appendChild(zoneHead);
  zoneRow.appendChild(select);
  secZones.appendChild(zoneRow);

  // splash zone selector
  const splashRow = document.createElement('label');
  splashRow.className = 'dev-row';
  splashRow.style.display = 'block';
  const splashHead = document.createElement('div');
  splashHead.className = 'dev-row-head';
  splashHead.textContent = 'Splash screen zone';
  const splashSelect = document.createElement('select');
  Object.assign(splashSelect.style, {
    width: '100%',
    background: '#0b1424',
    color: '#cfeaff',
    border: '1px solid rgba(0, 243, 255, 0.25)',
    borderRadius: '5px',
    padding: '4px',
    marginTop: '3px',
    outline: 'none',
  } as Partial<CSSStyleDeclaration>);
  CHAPTERS.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i + 1} · ${c.name}`;
    splashSelect.appendChild(o);
  });
  splashSelect.value = String(dev.splashZoneOverride);
  splashSelect.addEventListener('change', () => (dev.splashZoneOverride = parseInt(splashSelect.value, 10)));
  refreshers.push(() => (splashSelect.value = String(dev.splashZoneOverride)));
  splashRow.appendChild(splashHead);
  splashRow.appendChild(splashSelect);
  secZones.appendChild(splashRow);

  // splash zone cycling options
  checkbox(secZones, 'Cycle splash screen zones', () => dev.splashZoneCycle, (v) => {
    dev.splashZoneCycle = v;
    applySplashCycleMode();
  });
  const cycleIntervalRow = slider(secZones, '• splash cycle interval', 1, 30, 0.5, () => dev.splashZoneCycleInterval, (v) => (dev.splashZoneCycleInterval = v), (v) => v.toFixed(1) + 's');
  
  const applySplashCycleMode = () => {
    setRowEnabled(cycleIntervalRow, dev.splashZoneCycle);
    setRowEnabled(splashRow, !dev.splashZoneCycle);
  };
  refreshers.push(applySplashCycleMode);
  applySplashCycleMode();

  // =========================================================================
  // SECTION 9: STUNTS & ACTIONS
  // =========================================================================
  const secStunts = createSection('Stunts & Actions');
  lockWhenGamesCom(slider(
    secStunts,
    'Manual roll (°)',
    -180,
    180,
    1,
    () => Math.round(dev.manualRoll / DEG),
    (v) => (dev.manualRoll = v * DEG),
    (v) => `${Math.round(v)}°`,
  ));

  const btn = document.createElement('button');
  btn.className = 'dev-btn';
  btn.textContent = '⟳  TRIGGER BARREL ROLL';
  btn.style.marginTop = '8px';
  btn.addEventListener('click', () => cb.onBarrelRoll());
  secStunts.appendChild(btn);
  lockWhenGamesCom(btn);

  // =========================================================================
  // SECTION 10: SETTINGS IMPORT/EXPORT
  // =========================================================================
  const secIO = createSection('Settings Import/Export');
  const ta = document.createElement('textarea');
  Object.assign(ta.style, {
    width: '100%',
    height: '70px',
    marginTop: '6px',
    background: '#0b1424',
    color: '#cfeaff',
    border: '1px solid rgba(0, 243, 255, 0.25)',
    borderRadius: '5px',
    font: '10px monospace',
    resize: 'vertical',
    outline: 'none',
    padding: '4px',
  } as Partial<CSSStyleDeclaration>);
  ta.placeholder = 'Exported settings JSON…';

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const assignNumber = (value: unknown, set: (v: number) => void) => {
    if (typeof value === 'number' && Number.isFinite(value)) set(value);
  };
  const exportSettingsJson = () =>
    JSON.stringify(
      {
        dev: {
          ...dev,
          obstacleEnabled: { ...dev.obstacleEnabled },
        },
        gamescom: { ...gamescom },
        colors: {
          ringColors: [...RING_COLORS],
          gamescomCanyon: {
            top: GAMESCOM_CANYON.top,
            mid: gamescom.canyonSkyMid,
            horizon: GAMESCOM_CANYON.horizon,
            wall: gamescom.canyonWallColor,
            floor: gamescom.canyonFloorColor,
            accent: GAMESCOM_CANYON.accent,
            light: GAMESCOM_CANYON.light,
          },
        },
      },
      null,
      2,
    );
  
  const ioRow = document.createElement('div');
  Object.assign(ioRow.style, { display: 'flex', gap: '6px', marginTop: '8px' } as Partial<CSSStyleDeclaration>);
  
  const ioBtn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.className = 'dev-btn';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  };
  
  ioRow.appendChild(
    ioBtn('Export', () => {
      ta.value = exportSettingsJson();
      navigator.clipboard?.writeText(ta.value).catch(() => {});
    }),
  );
  ioRow.appendChild(
    ioBtn('Apply', () => {
      try {
        const p = JSON.parse(ta.value) as Record<string, unknown>;
        const importedDev = isRecord(p.dev) ? p.dev : p;
        const importedGamesCom = isRecord(p.gamescom) ? p.gamescom : undefined;
        const importedColors = isRecord(p.colors) ? p.colors : undefined;
        const importedGamesComEnabled =
          typeof importedGamesCom?.enabled === 'boolean'
            ? importedGamesCom.enabled
            : gamescom.enabled;

        if (gamescom.enabled && !importedGamesComEnabled) {
          setGamesComEnabled(false);
        }

        const d = dev as unknown as Record<string, unknown>;
        for (const k of Object.keys(dev)) if (k in importedDev) d[k] = importedDev[k];

        if (importedGamesCom) {
          const g = gamescom as unknown as Record<string, unknown>;
          for (const k of Object.keys(gamescom)) {
            if (k !== 'enabled' && k in importedGamesCom) g[k] = importedGamesCom[k];
          }
        }

        if (importedColors) {
          if (Array.isArray(importedColors.ringColors)) {
            importedColors.ringColors.slice(0, RING_COLORS.length).forEach((value, index) => {
              assignNumber(value, (v) => (RING_COLORS[index] = v));
            });
          }

          const importedCanyon = isRecord(importedColors.gamescomCanyon)
            ? importedColors.gamescomCanyon
            : undefined;
          if (importedCanyon) {
            assignNumber(importedCanyon.top, (v) => (GAMESCOM_CANYON.top = v));
            assignNumber(importedCanyon.mid, (v) => (gamescom.canyonSkyMid = v));
            assignNumber(importedCanyon.horizon, (v) => (GAMESCOM_CANYON.horizon = v));
            assignNumber(importedCanyon.wall, (v) => (gamescom.canyonWallColor = v));
            assignNumber(importedCanyon.floor, (v) => (gamescom.canyonFloorColor = v));
            assignNumber(importedCanyon.accent, (v) => (GAMESCOM_CANYON.accent = v));
            assignNumber(importedCanyon.light, (v) => (GAMESCOM_CANYON.light = v));
          }
        }

        setGamesComEnabled(importedGamesComEnabled);
        if (gamescom.enabled) applyGamesComRules();
        refreshAll();
        refreshGamesComLocks();
      } catch {
        /* ignore bad JSON */
      }
    }),
  );
  ioRow.appendChild(
    ioBtn('Reset', () => {
      resetDev();
      ta.value = exportSettingsJson();
      refreshAll();
      refreshGamesComLocks();
    }),
  );
  
  secIO.appendChild(ioRow);
  secIO.appendChild(ta);

  const hint = document.createElement('div');
  hint.textContent = 'Turn/slope & wave/zone changes apply to rooms generated ahead.';
  Object.assign(hint.style, { marginTop: '10px', fontSize: '10px', opacity: '0.45', lineHeight: '1.4', textAlign: 'center' } as Partial<CSSStyleDeclaration>);
  secIO.appendChild(hint);
  refreshGamesComLocks();

  // =========================================================================
  // INITIALIZE ACCORDION (Open first section by default)
  // =========================================================================
  const firstHeader = panel.querySelector('.dev-section-header') as HTMLDivElement;
  const firstContent = panel.querySelector('.dev-section-content') as HTMLDivElement;
  if (firstHeader && firstContent) {
    firstContent.style.display = 'block';
    const chev = firstHeader.querySelector('span:last-child') as HTMLElement;
    if (chev) chev.style.transform = 'rotate(90deg)';
    activeSectionContent = firstContent;
    activeSectionHeader = firstHeader;
  }

  document.body.appendChild(panel);

  let shown = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F9') {
      e.preventDefault();
      shown = !shown;
      panel.style.display = shown ? 'block' : 'none';
    }
  });

  return {
    update(info) {
      if (!shown) return;
      const zone = dev.zoneOverride >= 0 ? `${info.zone} (forced)` : info.zone;
      const b = steerBounds();
      readout.innerHTML =
        `speed <b>${info.speed.toFixed(1)}</b> u/s &nbsp;·&nbsp; ${Math.floor(info.distance)} m<br>` +
        `zone: <b>${zone}</b><br>` +
        `bounds: <b>±${b.x.toFixed(1)}</b> x &nbsp; top <b>${b.up.toFixed(1)}</b> / btm <b>${b.lo.toFixed(1)}</b>`;
    },
    visible: () => shown,
  };
}
