import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import {
  CULL_BEHIND,
  DISTANCE_SCALE,
  EYE_Y,
  SPAWN_AHEAD,
} from "../config/constants";
import {
  applyGamesComRules,
  dev,
  gamescom,
  type GamesComConfig,
} from "../config/runtime";
import {
  gamescomLevelCount,
  gamesComChapterFor,
  generalChapterFor,
  gamesComLevelTuning,
  isGamesComPlayMode,
} from "../config/gamescom-levels";
import { createDevPanel, type DevPanel } from "../ui/dev-panel";
import { laneAt, resetPath, slopeAt } from "../world/path";

const BARREL_DURATION = 1.4; // seconds for one triggered barrel roll
/** How far ahead of the camera the avatar flies (so you watch it weave). */
const AVATAR_AHEAD = 9;
// Hard floor clearance: the craft centre is kept at least this far above the lane
// floor (which sits ~at lane height) so the model never sinks through the ground.
const GROUND_CLEARANCE = 1.1;
/** Base camera FOV (from setup-renderer) — divided by camZoom for zoom. */
const BASE_FOV = 74;
/** Seconds for a booster flare to decay back to off. */
const BOOST_DECAY = 1.9;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** How fast the camera eases toward its follow target (the first game's fluid feel). */
const CAM_SMOOTH = 3.8;
/** Baseline rig elevation above the craft — keeps the OTS view looking down. */
const CAM_BASE_LIFT = 7;
/** Speed-as-health: how fast clean flying climbs speed back toward the cap. */
const SPEED_RECOVER = 0.35;
/** Scatter-missile ability cooldown (seconds). */
const POWER_COOLDOWN = 2.5;
/** Scoring: armour plough-through, normal ring, crystal ring. */
const ARMOUR_HIT_POINTS = 25;
const RING_POINTS = 40;
const CRYSTAL_RING_POINTS = 800;
/** Levels completed (when not infinite) before the finish, and the play-shard target. */
const NORMAL_LEVELS_TO_FINISH = 4;
const NORMAL_SHARD_TARGET = 4;
/** Flying through a level gate grants a long overdrive boost (this long, this multiple). */
const GATE_BOOST_MULT = 1.5;
const GAMESCOM_REFLECTOR_WIDTH = 64;
const GAMESCOM_REFLECTOR_LENGTH = 520;
import {
  shatter,
  spawnFragments,
  updateFragments,
} from "../gameplay/fragments";
import {
  STEER_SPEED_X,
  STEER_SPEED_Y,
  createAvatar,
  setAvatarBodyOpacity,
  setAvatarColor,
  steerBounds,
  triggerSpin,
  updateAvatar,
  updateAvatarSteer,
  updateBoundsBox,
  updateHitBox,
  updateMagnetField,
  type Avatar,
} from "../gameplay/avatar";
import {
  RING_COLORS,
  createRingState,
  resetRings,
  updateRings,
  type RingState,
} from "../gameplay/rings";
import { updatePalette } from "../gameplay/palette";
import { CHAPTERS } from "../config/chapters";
import {
  createSpeedLines,
  updateSpeedLines,
  type SpeedLines,
} from "../gameplay/speedlines";
import { createScout, updateScout, type Scout } from "../gameplay/scout";
import {
  createMissiles,
  fireMissiles,
  updateMissiles,
  type Missiles,
} from "../gameplay/missiles";
import { createScoreState, createScoringHandlers } from "../gameplay/scoring";
import { bindControls, createInputState, syncAxes } from "../input/controls";
import { createTouchControls } from "../ui/touch-controls";
import { createTutorial, type Tutorial } from "../ui/tutorial";
import { createTopButtons, type TopButtons } from "../ui/top-buttons";
import { initMusic } from "../audio/music";
import {
  initSfx,
  playBoost,
  playTorpedo,
  playShatter,
  playPickup,
  playShield,
  playShieldBreak,
  setBeam,
  setListener,
} from "../audio/sfx";
import { createClHud, colorName, type ClHud } from "../ui/cl-hud";
import { refreshEnv } from "../rendering/environment";
import {
  createMaterialFactories,
  createSharedGeometries,
  createSharedMaterials,
} from "../rendering/materials";
import {
  buildLights,
  updateParticles,
  type SceneVisuals,
} from "../rendering/scene-visuals";
import {
  createRenderer,
  type RendererBundle,
} from "../rendering/setup-renderer";
import { buildSky, type SkyBundle } from "../rendering/sky";
import type { Fragment, Obstacle } from "../types";
import { disposeGroup, disposeMeshResources } from "../utils/dispose";
import {
  queryHudElements,
  showGameHud,
  showStartScreen,
  showWinScreen,
  togglePauseScreen,
} from "../ui/hud";
import {
  checkAvatarCollision,
  createSegmentState,
  cullSegments,
  spawnSegment,
  updateObstacles,
  type SegmentState,
} from "../world/segments";
import { removeObstacle } from "../world/obstacle-helpers";
import { gateGlitter, setGateEnv } from "../world/gates";
import { applyGamesComObstacleDefaults } from "../world/patterns";

export class Game {
  private bundle!: RendererBundle;
  private sky!: SkyBundle;
  private visuals!: SceneVisuals;
  private hud = queryHudElements();
  private input = createInputState();
  private scoreState = createScoreState();
  private scoring = createScoringHandlers(this.scoreState, this.hud);
  private segmentState: SegmentState = createSegmentState();
  private geo = createSharedGeometries();
  private shared = createSharedMaterials();
  private mats = createMaterialFactories();
  private avatar!: Avatar;
  private speedLines!: SpeedLines;
  private scout!: Scout;
  private missiles!: Missiles;
  private gamescomPlayerReflector!: Reflector;
  private gamescomPlayerReflectionClone: THREE.Group | null = null;
  private gamescomPlayerReflectionChildCount = -1;
  private tutorial!: Tutorial;
  private topButtons!: TopButtons;
  private clHud!: ClHud;
  private runTime = 0; // elapsed seconds of the current run (HUD timer)
  private currentZone = ""; // active chapter/biome name (drives HUD + dev panel readout)
  private coneVisual!: THREE.LineSegments; // 3D Targeting Cone Outline Visual
  private fragments: Fragment[] = [];
  private powerCd = 0;
  private ringState: RingState = createRingState();
  private powerColor = RING_COLORS[0];
  private hitsTaken = 0;
  private finished = false;
  private prevSpeed = 0;
  private freezeTimer = 0; // brief hitstop on a crash so the shatter reads
  private invulnFlashing = false; // craft is currently ghosted by post-crash i-frames
  private gateBoostTimer = 0; // long overdrive boost after flying through a level gate
  private crystalBoostUntil = -1; // HUD-distance up to which a crystal-ring boost holds
  private crystalBoostColor = 0xffffff; // colour of the active crystal (for the banner)
  private crystalsCollected = [false, false, false, false]; // R/B/Y/G crystals collected
  private levelColors: string[] = []; // per-level theme colours for the progress line
  private prevBoosting = false; // edge-detect shield/armour activation for the SFX
  private boostStreak = 0; // current number of consecutive speed boosts stacked
  private crystalStreak = 0; // consecutive crystal rings stacked toward the comet trigger
  private boostStreakTimer = 0; // time remaining to register next boost before streak resets
  private splashCycleTimer = 0; // time remaining before cycling to the next splash screen zone
  private camZoomCur = 1; // smoothed camera zoom (eased toward the speed-driven target)
  private bankRoll = 0; // smoothed track banking roll
  private readonly camFwd = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly _proj = new THREE.Vector3(); // scratch for the viewport clamp
  private currentEnv: THREE.Texture | null = null;
  private lastChapterEnv = { value: -1 };
  private frameNo = 0;
  private camF = 0; // forward arc-length along the path (camera z = -camF)
  private shake = new THREE.Vector2();
  private fwd = new THREE.Vector3();
  private _hlWp = new THREE.Vector3(); // scratch for obstacle-highlight selection
  private _hlDisp = new THREE.Vector3();
  private _floorGlowPos = new THREE.Vector3();
  private _floorGlowRight = new THREE.Vector3();
  private _sunTarget = new THREE.Vector3();
  private _sunDynamic = new THREE.Vector3();
  private _sunDynamicTarget = new THREE.Vector3();
  // touch 1:1 steering: anchor the craft where it was when the thumb grabbed the stick
  private _touchPrev = false;
  private _touchAnchorX = 0;
  private _touchAnchorY = 0;
  private devPanel!: DevPanel;
  private barrelTime = 0;
  private barrelAngle = 0;

  running = false;
  paused = false;
  started = false;
  speed = 18;

  init() {
    this.bundle = createRenderer(EYE_Y);
    this.sky = buildSky(this.bundle.scene);
    this.visuals = buildLights(this.bundle.scene, this.bundle.camera);
    this.currentEnv = refreshEnv(
      this.bundle.pmrem,
      this.bundle.scene,
      0,
      this.currentEnv,
    );
    this.lastChapterEnv.value = 0;

    this.devPanel = createDevPanel({
      onBarrelRoll: () => this.triggerBarrelRoll(),
    });
    this.avatar = createAvatar(this.bundle.scene);
    this.gamescomPlayerReflector = this.createGamesComPlayerReflector();
    this.speedLines = createSpeedLines(this.bundle.scene);
    this.scout = createScout(this.bundle.scene);
    this.missiles = createMissiles(this.bundle.scene);
    this.missiles.playerSpeedRef = () => this.speed; // Bind player's active speed to missiles

    // Build 3D targeting cone outline
    {
      const points: THREE.Vector3[] = [];
      const segments = 24;
      const radius = 1; // scaled dynamically
      const height = 1; // scaled dynamically

      // Ring circles at the far base of the cone
      for (let i = 0; i < segments; i++) {
        const theta1 = (i / segments) * Math.PI * 2;
        const theta2 = ((i + 1) / segments) * Math.PI * 2;
        points.push(
          new THREE.Vector3(
            Math.cos(theta1) * radius,
            Math.sin(theta1) * radius,
            -height,
          ),
          new THREE.Vector3(
            Math.cos(theta2) * radius,
            Math.sin(theta2) * radius,
            -height,
          ),
        );
      }

      // Structural lines from apex (0,0,0) to circle base
      for (let i = 0; i < segments; i += 6) {
        // 6 structural lines
        const theta = (i / segments) * Math.PI * 2;
        points.push(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(
            Math.cos(theta) * radius,
            Math.sin(theta) * radius,
            -height,
          ),
        );
      }

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0xbd00ff, // Purple targeting cone!
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        linewidth: 2.0, // setting 1px thicker in stroke visual (where supported by driver)
      });
      this.coneVisual = new THREE.LineSegments(geo, mat);
      this.coneVisual.frustumCulled = false;
      this.coneVisual.visible = false;
      this.bundle.scene.add(this.coneVisual);
    }
    // Bake a bright room environment so the crystal gates reflect like real glass.
    {
      const pmrem = new THREE.PMREMGenerator(this.bundle.renderer);
      const room = new RoomEnvironment();
      const gateEnv = pmrem.fromScene(room, 0.04).texture;
      room.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      pmrem.dispose();
      setGateEnv(gateEnv);
    }
    this.hud.restartBtn.addEventListener("click", () => location.reload());
    this.hud.titleBtn.addEventListener("click", () => this.quitToTitle());

    // Set initial state for splash screen/attract mode
    this.running = true;
    this.started = false;
    this.segmentState.splashMode = true;

    while (
      this.bundle.camera.position.z - SPAWN_AHEAD <
      this.segmentState.nextSegZ
    ) {
      this.spawnNextSegment();
    }

    // Hide the player avatar and its associated visuals
    this.avatar.mesh.visible = false;
    this.avatar.trail.visible = false;
    this.avatar.shieldTrail.visible = false;
    this.avatar.shieldRibbon.visible = false;
    this.avatar.bounds.visible = false;
    this.avatar.hitBox.visible = false;
    this.coneVisual.visible = false;

    bindControls(this.bundle, this.hud, this.input, {
      onStart: () => this.startGame("play"),
      onTogglePause: () => this.togglePause(),
      isRunning: () => this.running,
      isPaused: () => this.paused,
      isStarted: () => this.started,
    });
    this.hud.testFlightBtn.addEventListener("click", () =>
      this.startGame("testFlight"),
    );
    createTouchControls(this.input, () => this.running && !this.paused);

    // How-to-play tutorial + floating mute/pause buttons + background music.
    this.tutorial = createTutorial();
    this.topButtons = createTopButtons(() => this.togglePause());
    this.topButtons.setPauseVisible(false); // pause hidden on the title screen
    document
      .getElementById("howBtn")
      ?.addEventListener("click", () => this.startTutorial());
    this.clHud = createClHud(document.body);
    initMusic();
    initSfx();

    showStartScreen(this.hud);
    this.animate();
  }

  private createGamesComPlayerReflector() {
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
    const reflector = new Reflector(
      new THREE.PlaneGeometry(
        GAMESCOM_REFLECTOR_WIDTH,
        GAMESCOM_REFLECTOR_LENGTH,
      ),
      {
        clipBias: 0.03,
        color: 0xffffff,
        textureWidth: Math.max(256, Math.floor(innerWidth * pixelRatio * 0.5)),
        textureHeight: Math.max(
          256,
          Math.floor(innerHeight * pixelRatio * 0.5),
        ),
        multisample: 0,
      },
    );
    reflector.name = "gamescom-player-floor-reflector";
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.05;
    reflector.renderOrder = 2;
    reflector.frustumCulled = false;
    reflector.visible = false;

    const mat = reflector.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.NormalBlending;
    mat.uniforms.uOpacity = { value: gamescom.playerReflectionOpacity };
    mat.fragmentShader = mat.fragmentShader.replace(
      "uniform sampler2D tDiffuse;",
      "uniform sampler2D tDiffuse;\nuniform float uOpacity;",
    );
    mat.fragmentShader = mat.fragmentShader.replace(
      "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
      "gl_FragColor = vec4( base.rgb, uOpacity );",
    );
    mat.needsUpdate = true;

    this.bundle.scene.add(reflector);
    return reflector;
  }

  private syncGamesComPlayerReflector() {
    const opacity = THREE.MathUtils.clamp(gamescom.playerReflectionOpacity, 0, 1);
    const visible = gamescom.enabled && opacity > 0.001;
    this.gamescomPlayerReflector.visible = visible;
    this.syncGamesComPlayerReflectionClone(visible, opacity);
    if (!visible) return;

    const centerZ =
      (this.started ? this.avatar.pos.z : this.bundle.camera.position.z) - 150;
    const lane = laneAt(centerZ);
    this.gamescomPlayerReflector.position.set(lane.x, -0.052, centerZ);
    this.gamescomPlayerReflector.scale.x = Math.max(
      0.2,
      ((gamescom.canyonWallGap + 1.2) * dev.worldScale) /
        GAMESCOM_REFLECTOR_WIDTH,
    );

    const mat = this.gamescomPlayerReflector.material as THREE.ShaderMaterial;
    mat.uniforms.uOpacity.value = opacity;
  }

  private syncGamesComPlayerReflectionClone(visible: boolean, opacity: number) {
    if (!visible || !this.started) {
      if (this.gamescomPlayerReflectionClone)
        this.gamescomPlayerReflectionClone.visible = false;
      return;
    }

    if (
      !this.gamescomPlayerReflectionClone ||
      this.gamescomPlayerReflectionChildCount !== this.avatar.mesh.children.length
    ) {
      this.rebuildGamesComPlayerReflectionClone();
    }
    const clone = this.gamescomPlayerReflectionClone;
    if (!clone) return;

    const floorY = -0.052;
    clone.visible = true;
    clone.position.copy(this.avatar.mesh.position);
    clone.position.y = floorY * 2 - this.avatar.mesh.position.y + 0.035;
    clone.quaternion.copy(this.avatar.mesh.quaternion);
    clone.scale.copy(this.avatar.mesh.scale);
    clone.scale.y *= -1;
    this.syncReflectionNode(this.avatar.mesh, clone, opacity, true);
  }

  private rebuildGamesComPlayerReflectionClone() {
    if (this.gamescomPlayerReflectionClone) {
      this.bundle.scene.remove(this.gamescomPlayerReflectionClone);
      this.gamescomPlayerReflectionClone.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of materials) mat.dispose();
      });
    }

    const clone = this.avatar.mesh.clone(true) as THREE.Group;
    clone.name = "gamescom-player-floor-reflection";
    clone.visible = false;
    clone.frustumCulled = false;
    clone.traverse((obj) => {
      obj.frustumCulled = false;
      const light = obj as THREE.Light;
      if (light.isLight) {
        light.visible = false;
        light.intensity = 0;
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const sourceMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const clonedMaterials = sourceMaterials.map((mat) => {
        const cloneMat = mat.clone() as THREE.Material & { opacity: number };
        cloneMat.transparent = true;
        cloneMat.depthWrite = false;
        cloneMat.depthTest = false;
        cloneMat.side = THREE.DoubleSide;
        cloneMat.blending = THREE.NormalBlending;
        cloneMat.opacity = 0;
        return cloneMat;
      });
      mesh.material = Array.isArray(mesh.material)
        ? clonedMaterials
        : clonedMaterials[0];
      mesh.renderOrder = 4;
    });

    this.gamescomPlayerReflectionClone = clone;
    this.gamescomPlayerReflectionChildCount = this.avatar.mesh.children.length;
    this.bundle.scene.add(clone);
  }

  private syncReflectionNode(
    source: THREE.Object3D,
    reflected: THREE.Object3D,
    opacity: number,
    root = false,
  ) {
    if (!root) {
      reflected.visible = source.visible;
      reflected.position.copy(source.position);
      reflected.quaternion.copy(source.quaternion);
      reflected.scale.copy(source.scale);
    }

    const sourceMesh = source as THREE.Mesh;
    const reflectedMesh = reflected as THREE.Mesh;
    if (sourceMesh.isMesh && reflectedMesh.isMesh) {
      const sourceMaterials = Array.isArray(sourceMesh.material)
        ? sourceMesh.material
        : [sourceMesh.material];
      const reflectedMaterials = Array.isArray(reflectedMesh.material)
        ? reflectedMesh.material
        : [reflectedMesh.material];
      for (let i = 0; i < reflectedMaterials.length; i++) {
        const src = sourceMaterials[i] as THREE.Material & { opacity?: number };
        const dst = reflectedMaterials[i] as THREE.Material & {
          opacity: number;
        };
        dst.opacity = (src.opacity ?? 1) * opacity;
      }
    }

    const n = Math.min(source.children.length, reflected.children.length);
    for (let i = 0; i < n; i++)
      this.syncReflectionNode(source.children[i], reflected.children[i], opacity);
  }

  /** Launch the guided tutorial: avatar visible, world frozen, step prompts. */
  private startTutorial() {
    this.hud.start.classList.add("hide"); // hide the title screen
    this.started = true;
    this.running = true;
    this.paused = false;
    this.segmentState.splashMode = false;
    this.centerAvatarSteer();
    this.powerCd = 0;
    this.powerColor = RING_COLORS[0];
    setAvatarColor(this.avatar, this.powerColor);
    this.avatar.mesh.visible = true;
    this.avatar.trail.visible = true;
    this.tutorial.onPlayForReal = () => {
      this.tutorial.stop();
      this.startGame("play");
      this.input.powerRequest = false;
    };
    this.tutorial.onTitle = () => this.returnToTitle();
    this.tutorial.start();
    this.topButtons.setPauseVisible(false); // no pause during the tutorial
    this.bundle.clock.getDelta();
  }

  /** Start the craft centred in its steer envelope, so it renders mid-screen (not low). */
  private centerAvatarSteer() {
    const b = steerBounds();
    this.avatar.steerX = 0;
    this.avatar.steerY = (b.up + b.lo) / 2;
  }

  /** Leave the tutorial (skip / TITLE button) back to the attract/splash title. */
  /** Abandon the current run from the pause menu and return to the attract title. */
  private quitToTitle() {
    this.paused = false;
    togglePauseScreen(this.hud, false);
    this.topButtons?.setPaused(false);
    this.resetWorldStream(true); // rebuild the world in splash/attract mode
    this.returnToTitle();
  }

  private returnToTitle() {
    this.tutorial.stop();
    this.started = false;
    this.running = true;
    this.paused = false;
    this.segmentState.splashMode = true;
    this.avatar.mesh.visible = false;
    this.avatar.trail.visible = false;
    this.avatar.shieldTrail.visible = false;
    this.avatar.shieldRibbon.visible = false;
    this.topButtons.setPauseVisible(false);
    showStartScreen(this.hud);
    this.bundle.clock.getDelta();
  }

  private disposeMesh = (mesh: THREE.Object3D) => {
    disposeMeshResources(mesh, { geo: this.geo, mat: this.shared });
  };

  private spawnNextSegment() {
    spawnSegment(
      this.bundle.scene,
      this.bundle.camera,
      this.segmentState,
      this.geo,
      this.mats,
      this.disposeMesh,
    );
  }

  private targetLevelCount() {
    return isGamesComPlayMode()
      ? gamescomLevelCount() // finish after the ACTIVE Google levels (dev-panel driven)
      : NORMAL_LEVELS_TO_FINISH;
  }

  private targetShardCount() {
    return isGamesComPlayMode()
      ? gamescomLevelCount()
      : NORMAL_SHARD_TARGET;
  }

  private speedProfile(distance = this.scoreState.distance) {
    const chIdx = Math.floor(distance / Math.max(1, dev.levelLength));
    const tuning = gamesComLevelTuning(chIdx);
    const play = isGamesComPlayMode();
    return {
      baseSpeed: dev.baseSpeed + (play ? tuning.baseSpeedBonus : 0),
      maxBonus: dev.maxBonus + (play ? tuning.maxSpeedBonus : 0),
      recover: SPEED_RECOVER * (play ? tuning.accelerationMul : 1),
      boostMult: GATE_BOOST_MULT + (play ? tuning.boostMulBonus : 0),
    };
  }

  private configureGamesComRun(runMode: GamesComConfig["runMode"]) {
    gamescom.runMode = runMode;
    if (!gamescom.enabled) return;
    applyGamesComRules();
    applyGamesComObstacleDefaults();
    dev.infiniteLevels = runMode === "testFlight";
    this.levelColors = [];
  }

  private resetWorldStream(splashMode: boolean) {
    for (const seg of this.segmentState.segments) {
      for (const o of seg.obstacles.slice()) if (o.cleanup) o.cleanup();
      disposeGroup(seg.group, { geo: this.geo, mat: this.shared });
      this.bundle.scene.remove(seg.group);
    }
    this.segmentState = createSegmentState();
    this.segmentState.splashMode = splashMode;
    resetPath();
    this.camF = 0;
    this.bundle.camera.position.set(0, EYE_Y + CAM_BASE_LIFT, 0);
    while (-SPAWN_AHEAD < this.segmentState.nextSegZ) {
      this.spawnNextSegment();
    }
  }

  private startGame(runMode: GamesComConfig["runMode"] = gamescom.runMode) {
    this.configureGamesComRun(runMode);
    this.resetWorldStream(false);
    showGameHud(this.hud);
    this.started = true;
    this.running = true;
    this.paused = false;
    this.segmentState.splashMode = false;
    this.topButtons?.setPauseVisible(true); // pause available during the run
    this.runTime = 0;
    this.clHud?.setPlaying(true);

    // Reset distance, score, and crystals for the actual gameplay run
    this.scoreState.distance = 0;
    this.scoreState.crystals = 0;
    this.scoreState.score = 0;
    this.segmentState.distance = 0;

    // Show the player avatar and its associated visuals
    this.centerAvatarSteer(); // start centred in the steer envelope → mid-screen
    setAvatarBodyOpacity(this.avatar, 1); // clear any leftover i-frame ghosting
    this.invulnFlashing = false;
    this.avatar.mesh.visible = true;
    this.avatar.trail.visible = true;
    this.avatar.shieldTrail.visible = false; // will be set based on boosting in the loop
    this.avatar.shieldRibbon.visible = false;
    this.avatar.bounds.visible = dev.showBounds;
    this.avatar.hitBox.visible = dev.showHitBox;
    this.coneVisual.visible = dev.showMissileCone;

    this.speed = this.speedProfile(0).baseSpeed; // speed-as-health starts at the floor and climbs
    this.hitsTaken = 0;
    this.finished = false;
    this.crystalBoostUntil = -1;
    this.crystalsCollected = Array(this.targetShardCount()).fill(false);
    this.powerCd = 0;
    this.powerColor = RING_COLORS[0];
    setAvatarColor(this.avatar, this.powerColor);
    resetRings(this.bundle.scene, this.ringState);
    this.bundle.clock.getDelta();
  }

  private triggerBarrelRoll() {
    if (gamescom.enabled) return;
    // If in portrait view (height > width), disable world barrel rolls for better visual stability and gameplay readability
    if (window.innerHeight > window.innerWidth) {
      return;
    }
    this.barrelTime = BARREL_DURATION;
  }

  private togglePause() {
    if (!this.started) return;
    this.paused = !this.paused;
    togglePauseScreen(this.hud, this.paused);
    this.topButtons?.setPaused(this.paused);
    if (!this.paused) this.bundle.clock.getDelta();
  }

  private handleCrash = (o: Obstacle) => {
    o.broken = true;
    this.avatar.boostFx = 0;
    this.speedLines.obj.visible = false;
    this.speedLines.mat.opacity = 0;
    // Shatter the thing we hit (a penalty — no glass-break score), then crater speed.
    const center = new THREE.Vector3();
    o.mesh.getWorldPosition(center);
    const box = new THREE.Box3().setFromObject(o.mesh);
    const sx = Math.max(0.4, box.max.x - box.min.x);
    const sy = Math.max(0.4, box.max.y - box.min.y);
    const severity = this.crashImpactSeverity(center, sx, sy);
    // Spawn the burst a short distance IN FRONT of the player (between you and the
    // object) so the freeze + shatter always plays in clear view — like the original.
    const mid = (this.avatar.pos.z + center.z) / 2;
    center.z = THREE.MathUtils.clamp(
      mid,
      this.avatar.pos.z - 8,
      this.avatar.pos.z - 1.5,
    );
    // Tie the hitstop to the shard lifetime: freeze EVERYTHING, let the shards play
    // out fully, then resume. The shards live exactly as long as the freeze.
    const fl = THREE.MathUtils.clamp(dev.crashFreeze, 0.2, 1.2);
    if (!gamescom.enabled) {
      spawnFragments(
        this.bundle.scene,
        center,
        sx,
        sy,
        0xffffff,
        this.fragments,
        this.geo,
        this.shared,
        1.5, // extra-dense crash burst
        fl / 0.85, // longest shard ≈ fl, so they finish as the freeze ends
      );
    }
    removeObstacle(o, this.segmentState.obstacles, this.disposeMesh);
    if (!gamescom.enabled)
      playShatter(center, sx > 2.5 || sy > 2.5, false); // impact shatter (no boost armour)
    this.scoring.onCrash();
    this.scoreState.crashCooldown = dev.crashInvuln; // i-frames window (dev-panel adjustable)
    this.craterSpeed(severity);
    this.crystalStreak = 0; // a crash breaks the crystal-ring stack toward the comet
    this.hitsTaken++; // breaks a PERFECT run
    this.freezeTimer = gamescom.enabled ? 0 : fl; // hitstop so the full shatter is seen
    if (!gamescom.enabled)
      triggerSpin(this.avatar, false, Math.PI * 2, Math.max(0.25, fl)); // yaw 360° during the freeze
  };

  /** Glass flown into but not path-blocking — shatter it, no speed penalty. */
  private handleGraze = (o: Obstacle) => {
    shatter(
      o,
      this.bundle.scene,
      this.fragments,
      this.geo,
      this.shared,
      this.segmentState.obstacles,
      this.disposeMesh,
      this.scoring.fragmentCallbacks,
      this.avatar.shield.visible, // pass if shield / boost armour is active
      false,
      this.speed, // carry shards forward with the craft so the smash stays visible at speed
    );
    // points for ploughing through an obstacle while boost-armoured
    if (this.avatar.shield.visible) this.scoring.addScore(ARMOUR_HIT_POINTS);
  };

  private crashImpactSeverity(center: THREE.Vector3, sx: number, sy: number) {
    const profile = this.speedProfile();
    const speedT = THREE.MathUtils.clamp(
      (this.speed - profile.baseSpeed) / Math.max(1, profile.maxBonus),
      0,
      1,
    );
    const xReach = Math.max(0.001, sx * 0.5 + dev.hitX);
    const yReach = Math.max(0.001, sy * 0.5 + dev.hitY);
    const xDirect = 1 - THREE.MathUtils.clamp(
      Math.abs(this.avatar.pos.x - center.x) / xReach,
      0,
      1,
    );
    const yDirect = 1 - THREE.MathUtils.clamp(
      Math.abs(this.avatar.pos.y - center.y) / yReach,
      0,
      1,
    );
    const directness = (xDirect + yDirect) * 0.5;
    return THREE.MathUtils.clamp(0.35 + speedT * 0.45 + directness * 0.2, 0, 1);
  }

  /** A crash guts your speed — harder/faster impacts lose more speed. */
  private craterSpeed(impactSeverity: number) {
    const profile = this.speedProfile();
    const loss = THREE.MathUtils.clamp(dev.crashSpeedLoss, 0, 0.95) * impactSeverity;
    this.speed = Math.max(profile.baseSpeed * 0.4, this.speed * (1 - loss));
  }

  /** End of the race: show ARRIVED / PERFECT (all shards + no hits) with the run stats. */
  private finishRun() {
    this.finished = true;
    this.running = false;
    const perfect =
      this.scoreState.crystals >= this.targetShardCount() && this.hitsTaken === 0;
    showWinScreen(
      this.hud,
      perfect,
      this.scoreState.crystals,
      this.targetShardCount(),
      this.scoreState.distance,
    );
  }

  private handlePickup = (o: Obstacle) => {
    o.broken = true;
    if (o.powerup) this.scoring.fragmentCallbacks.onPowerup(o.powerup);
    else if (o.crystal) this.scoring.fragmentCallbacks.onCrystal();
    removeObstacle(o, this.segmentState.obstacles, this.disposeMesh);
  };

  private animate = () => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.bundle.clock.getDelta());
    this.frameNo++;

    setListener(this.bundle.camera.position); // SFX distance falloff listener

    if (this.running && !this.paused) {
      // Periodic world-scale: oscillate the corridor scale between min/max over time
      // (read by steering bounds, room spawning, gates, etc.).
      if (dev.worldScaleAuto) {
        const t = this.bundle.clock.elapsedTime;
        const mid = (dev.worldScaleMin + dev.worldScaleMax) / 2;
        const amp = (dev.worldScaleMax - dev.worldScaleMin) / 2;
        dev.worldScale = mid + amp * Math.sin(t * dev.worldScaleRate);
      }

      // Speed-as-health: speed is the commodity. It climbs toward the cap while
      // flying clean and craters on a crash (see craterSpeed), so a hit costs you
      // ground in the race. Distance (the progress/score) tracks speed below.
      // Crash hitstop: hold the world for a beat so the shatter is actually seen
      // (fragments keep animating below). Only the forward world is frozen.
      const frozen = this.freezeTimer > 0;
      if (frozen) this.freezeTimer -= dt;
      // The tutorial is a guided real flight: the world streams, but FORWARD motion
      // freezes at each lesson gate (tutorial.freezeForward) until the player performs
      // the input. Crashes are disarmed below so the learning flight is always safe.
      const worldFrozen =
        frozen || (this.tutorial.active && this.tutorial.freezeForward);
      const fireRequested = this.input.powerRequest && this.started; // raw fire input this frame

      const speedProfile = this.speedProfile();
      const topSpeed = speedProfile.baseSpeed + speedProfile.maxBonus;
      if (!worldFrozen) {
        if (this.started) {
          if (this.gateBoostTimer > 0) {
            // long overdrive after passing a level gate — pin speed above the cap
            this.gateBoostTimer -= dt;
            this.speed = topSpeed * speedProfile.boostMult;
          } else if (this.scoreState.distance < this.crystalBoostUntil) {
            // crystal-ring boost — holds above the cap until the end of the zone
            this.speed = topSpeed * speedProfile.boostMult;
          } else {
            this.speed +=
              (topSpeed - this.speed) * Math.min(1, dt * speedProfile.recover);
          }
        } else {
          this.speed = speedProfile.baseSpeed;
          // Cycle through splash screen zones on a desired interval
          if (dev.splashZoneCycle) {
            this.splashCycleTimer += dt;
            if (this.splashCycleTimer >= dev.splashZoneCycleInterval) {
              this.splashCycleTimer = 0;
              // Cycle to next chapter
              dev.splashZoneOverride =
                (dev.splashZoneOverride + 1) % CHAPTERS.length;
              // Update dev panel select element if visible
              const selects = document.querySelectorAll("#devpanel select");
              for (const sel of Array.from(selects)) {
                const s = sel as HTMLSelectElement;
                if (
                  s.parentNode &&
                  s.parentNode.textContent &&
                  s.parentNode.textContent.includes("Splash screen zone")
                ) {
                  s.value = String(dev.splashZoneOverride);
                  break;
                }
              }
            }
          }
        }
        this.camF += this.speed * dt;
      }
      const z = -this.camF;
      const az = z - AVATAR_AHEAD; // the avatar flies ahead of the camera
      const aLane = laneAt(az);

      if (this.started) {
        // Booster flare: brief on crossing into high speed; decays back to off.
        const fastThresh = topSpeed * 0.9;
        if (this.prevSpeed < fastThresh && this.speed >= fastThresh)
          this.avatar.boostFx = 1;
        this.prevSpeed = this.speed;
        this.avatar.boostFx = Math.max(
          0,
          this.avatar.boostFx - dt / BOOST_DECAY,
        );

        // Add a high-frequency, visceral camera shake during speed boosts
        if (this.avatar.boostFx > 0.05) {
          const boostShakeAmp = this.avatar.boostFx * 0.045;
          this.shake.x += (Math.random() - 0.5) * boostShakeAmp;
          this.shake.y += (Math.random() - 0.5) * boostShakeAmp;
        }
      } else {
        this.avatar.boostFx = 0;
      }

      // barrel-roll animation (one full spin), added to any manual roll offset
      if (this.barrelTime > 0) {
        this.barrelTime -= dt;
        const p = THREE.MathUtils.clamp(
          1 - this.barrelTime / BARREL_DURATION,
          0,
          1,
        );
        this.barrelAngle = p * p * (3 - 2 * p) * Math.PI * 2; // smoothstep × 360°
        if (this.barrelTime <= 0) {
          this.barrelTime = 0;
          this.barrelAngle = 0;
        }
      }

      // --- avatar steer + 3rd-person camera --------------------------------
      // Total view-roll (bank/manual/barrel). The track banking is smoothed/eased
      // according to dev.bankSmooth so that the rotation is slow and smooth when curves happen.
      // The craft counter-rolls by it to stay upright on screen, and the steering input is
      // rotated by it so movement stays relative to the player's view even when the world is rolled.
      const targetBank = dev.keepLevel ? 0 : -slopeAt(z).x * dev.bank;
      this.bankRoll +=
        (targetBank - this.bankRoll) * Math.min(1, dt * dev.bankSmooth);
      const viewRoll = this.bankRoll + dev.manualRoll + this.barrelAngle;
      syncAxes(this.input);
      const cr = Math.cos(viewRoll);
      const sr = Math.sin(viewRoll);
      const rax = this.input.axisX * cr - this.input.axisY * sr;
      const ray = this.input.axisX * sr + this.input.axisY * cr;
      if (!frozen && this.started) {
        // Forward-speed factor 0→1 (base→top speed), shared by both control schemes:
        // keyboard scales steer SPEED by it, touch scales thumb→lane REACH by it.
        const spT = THREE.MathUtils.clamp(
          (this.speed - speedProfile.baseSpeed) /
            Math.max(1, speedProfile.maxBonus),
          0,
          1,
        );
        if (this.input.touch.active) {
          // MOBILE 1:1: the craft position tracks the thumb directly (no velocity
          // ramp). Anchor where the craft was on grab so it doesn't snap to centre,
          // then map stick displacement straight to a position offset from there.
          const b = steerBounds();
          if (!this._touchPrev) {
            this._touchAnchorX = this.avatar.steerX;
            this._touchAnchorY = this.avatar.steerY;
          }
          const vRange = (b.up - b.lo) * 0.5;
          // Reach scales with forward speed (blend 1→mobileSpeedReachMul): at top
          // speed a full thumb-throw covers more/less of the lane (default 1 = current).
          const touchSensitivity =
            dev.mobileJoystickSensitivity *
            THREE.MathUtils.lerp(1, dev.mobileSpeedReachMul, spT);
          this.avatar.steerX = THREE.MathUtils.clamp(
            this._touchAnchorX + this.input.axisX * b.x * touchSensitivity,
            -b.x,
            b.x,
          );
          this.avatar.steerY = THREE.MathUtils.clamp(
            this._touchAnchorY + this.input.axisY * vRange * touchSensitivity,
            b.lo,
            b.up,
          );
        } else {
          // Steer speed can scale with forward speed: blend 1→speedSteerMul as the
          // craft climbs from base to top speed (default 1 = unaffected / current feel).
          const speedSteer = THREE.MathUtils.lerp(1, dev.speedSteerMul, spT);
          updateAvatarSteer(this.avatar, rax, ray, dt, speedSteer); // desktop: velocity steering
        }
      }
      this._touchPrev = this.input.touch.active;
      if (this.powerCd > 0) this.powerCd -= dt;

      const cam = this.bundle.camera;
      if (this.started) {
        this.avatar.pos.set(
          aLane.x + this.avatar.steerX,
          EYE_Y + aLane.y + this.avatar.steerY,
          az,
        );
        // Keep the craft inside the viewport even when the playable bounds reach
        // beyond the visible frame: if it projects off-screen, pull the steer offset
        // back to the edge (uses last frame's camera — converges smoothly each frame).
        this._proj.copy(this.avatar.pos).project(cam);
        const M = 0.86; // NDC margin (keeps the whole craft on-screen)
        if (Math.abs(this._proj.x) > M) this.avatar.steerX *= M / Math.abs(this._proj.x);
        if (Math.abs(this._proj.y) > M) this.avatar.steerY *= M / Math.abs(this._proj.y);
        // Hard floor: never let the craft sink through the ground (any mode/level).
        const minSteerY = GROUND_CLEARANCE - EYE_Y;
        if (this.avatar.steerY < minSteerY) this.avatar.steerY = minSteerY;
        this.avatar.pos.set(
          aLane.x + this.avatar.steerX,
          EYE_Y + aLane.y + this.avatar.steerY,
          az,
        );
      } else {
        this.avatar.pos.set(aLane.x, EYE_Y + aLane.y, az);
      }
      this.avatar.mesh.position.copy(this.avatar.pos);
      this.avatar.mesh.updateWorldMatrix(true, false); // so the trail samples the live orb pos
      // Central vanishing point: far down the corridor centreline. Aiming both the
      // camera and the craft's nose here keeps it dead-centre even as the track turns.
      const vp = laneAt(z - dev.camLookAhead);
      const vpX = vp.x;
      const vpY = EYE_Y + vp.y;
      const vpZ = z - dev.camLookAhead;
      // pass the view-roll (counter-rolled to stay upright) + the vanishing point (nose aim)
      updateAvatar(
        this.avatar,
        dt,
        this.bundle.clock.elapsedTime,
        viewRoll,
        vpX,
        vpY,
        vpZ,
      );
      updateBoundsBox(this.avatar, aLane.x, EYE_Y + aLane.y, az); // dev envelope at lane centre
      updateHitBox(this.avatar); // dev collision/hit box at the avatar
      updateMagnetField(this.avatar); // dev pickup-magnet field sphere at the avatar

      // Tick down boost streak timer (a lapse also breaks the crystal-ring stack)
      if (this.boostStreakTimer > 0) {
        this.boostStreakTimer -= dt;
        if (this.boostStreakTimer <= 0) {
          this.boostStreak = 0;
          this.crystalStreak = 0;
        }
      }

      // Crystal-ring perma-boost (drives the COMET trail): active until the zone ends.
      const crystalBoostActive =
        this.started && this.scoreState.distance < this.crystalBoostUntil;
      const cometActive = !gamescom.enabled && crystalBoostActive;

      // Check if we have active boost armour (streak met, always-on, or — now — the
      // crystal-ring comet effect, which grants armour for as long as it's active).
      const hasSufficientStreak = this.boostStreak >= dev.boostArmourRequired;
      const activeBoostState =
        this.gateBoostTimer > 0 || this.avatar.boostFx > 0.05;
      const isBoosting =
        !dev.boostArmourAlwaysOff &&
        (cometActive ||
          (dev.boostArmour &&
            (dev.boostArmourAlwaysOn || (activeBoostState && hasSufficientStreak))));
      if (this.started) {
        if (this.avatar.shieldActive && !isBoosting) {
          // Shield depleted/boost ended! Trigger an awesome shatter effect right at the player's position
          const center = new THREE.Vector3();
          this.avatar.mesh.getWorldPosition(center);
          if (!gamescom.enabled) {
            spawnFragments(
              this.bundle.scene,
              center,
              2.5, // width
              2.5, // height
              this.powerColor, // shield color matches current power color
              this.fragments,
              this.geo,
              this.shared,
              1.2, // density
              0.8, // lifeScale
            );
            playShieldBreak(); // tiny, very-quiet shatter on shield loss
          }
        }
        this.avatar.shieldActive = isBoosting;
        this.avatar.shield.visible = isBoosting;
      } else {
        this.avatar.shieldActive = false;
        this.avatar.shield.visible = false;
      }
      setBeam(this.started && isBoosting); // low beam hum while boost-armoured
      // shield-achieved cue on the rising edge of boost armour
      if (this.started && isBoosting && !this.prevBoosting) playShield();
      this.prevBoosting = isBoosting && this.started;
      // Dynamic colours off → speed streaks AND the side orb / boosters go white.
      const fxColor = dev.speedDynamicColors ? this.powerColor : 0xffffff;
      setAvatarColor(this.avatar, fxColor);
      updateSpeedLines(
        this.speedLines,
        this.avatar.boostFx,
        fxColor,
        this.bundle.camera,
        dt,
      ); // warp streaks on boost
      gateGlitter.value = this.bundle.clock.elapsedTime; // twinkle the shiny crystal gates

      // Ensure player model and its associated visuals are hidden during splash screen
      this.avatar.mesh.visible = this.started;
      this.avatar.trail.visible = this.started;
      // Crystal-ring perma-boost: force the COMET trail on (even unarmoured / through
      // other rings) until the zone ends. (crystalBoostActive / cometActive computed above.)
      this.avatar.cometForce = cometActive;
      this.avatar.shieldTrail.visible =
        !gamescom.enabled &&
        this.started &&
        ((isBoosting && dev.shieldTrailType === 0) || crystalBoostActive);
      this.avatar.shieldRibbon.visible =
        !gamescom.enabled &&
        this.started &&
        isBoosting &&
        dev.shieldTrailType === 1 &&
        !crystalBoostActive;
      this.avatar.bounds.visible = this.started && dev.showBounds;
      this.avatar.hitBox.visible = this.started && dev.showHitBox;

      this.coneVisual.visible = this.started && dev.showMissileCone;
      if (this.coneVisual.visible) {
        // Position at avatar pos
        this.coneVisual.position.copy(this.avatar.pos);

        // Orient precisely pointing forward along the path direction (tangent)
        const slCone = slopeAt(this.avatar.pos.z);
        const coneDir = new THREE.Vector3(-slCone.x, -slCone.y, -1).normalize();
        this.coneVisual.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          coneDir,
        );

        // Scale: Z is height (range), X & Y are scaled such that the cone base matches our cone angle
        const hCone = dev.missileConeRange;
        const rCone = hCone * Math.tan((dev.missileConeAngle * Math.PI) / 180);
        this.coneVisual.scale.set(rCone, rCone, hCone);
      }

      // Ride line: scout a safe path ahead; flash "PATH AHEAD BLOCKED" if there's no way through.
      if (dev.showRideLine && this.started) {
        const sb = steerBounds();
        const keyboardSteer = dev.steerSpeed * dev.keyboardSteerSensitivity * dev.worldScale;
        const latS = STEER_SPEED_X * keyboardSteer;
        const vertS = STEER_SPEED_Y * keyboardSteer;
        const blocked = updateScout(
          this.scout,
          this.segmentState.obstacles,
          this.avatar.pos.x,
          this.avatar.pos.y,
          az,
          sb.x,
          sb.lo,
          sb.up,
          dev.hitX,
          dev.hitY,
          this.speed,
          latS,
          vertS,
          dev.scoutDist,
          dev.blockClearance,
          dev.blockWarnDist,
          dev.rideFromPlayer,
        );
        this.scout.line.visible = true;
        this.hud.pathBlocked.classList.toggle("show", blocked);
      } else {
        this.scout.line.visible = false;
        this.hud.pathBlocked.classList.remove("show");
      }

      // Heading-frame chase cam: a FIXED over-the-shoulder rig that rides the
      // player's direction of travel (the path tangent), so the framing stays
      // constant through a turn — the turn rotates the world, not the perspective.
      // Forward = path tangent (decreasing z); Right = forward × world-up.
      const sl2 = slopeAt(az);
      this.camFwd.set(-sl2.x, -sl2.y, -1).normalize();
      this.camRight.crossVectors(this.camFwd, WORLD_UP).normalize();
      // Turn sharpness 0→1 from the lateral track slope; blends the straight follow
      // amounts toward their turn-specific counterparts so the camera can track the
      // craft differently mid-bend than on straights.
      const turnT = THREE.MathUtils.clamp(
        Math.abs(sl2.x) / Math.max(0.001, dev.turnMax),
        0,
        1,
      );
      const latFollow = THREE.MathUtils.lerp(
        dev.camLatFollow,
        dev.camLatFollowTurn,
        turnT,
      );
      const vertFollow = THREE.MathUtils.lerp(
        dev.camFollow,
        dev.camFollowTurn,
        turnT,
      );
      const shoulderOff = dev.camShoulder + this.avatar.steerX * latFollow;
      const lift = CAM_BASE_LIFT + dev.camHeight + this.avatar.steerY * vertFollow;
      const tX =
        aLane.x -
        this.camFwd.x * dev.camBack +
        this.camRight.x * shoulderOff +
        this.shake.x;
      const tY =
        EYE_Y + aLane.y - this.camFwd.y * dev.camBack + lift + this.shake.y;
      const tZ = az - this.camFwd.z * dev.camBack;
      const k = Math.min(1, dt * CAM_SMOOTH);
      cam.position.x += (tX - cam.position.x) * k;
      cam.position.y += (tY - cam.position.y) * k;
      cam.position.z += (tZ - cam.position.z) * k;
      cam.up.set(0, 1, 0);
      // Camera aim. Default: the down-track vanishing point (the curve sweeps the craft
      // across the frame as the camera chases where the track is heading).
      // Optokinetic reflex: aim straight along the LOCAL heading from the craft's lane
      // centre, so the craft stays pinned in-frame (gyro/chicken-head) and the world
      // rotates around it — only the controller moves it off its anchor. World-space
      // position is unchanged (collisions stay honest); only the framing differs.
      let aimX = vpX,
        aimY = vpY,
        aimZ = vpZ;
      if (dev.optokineticReflex) {
        const ahead = dev.camLookAhead + AVATAR_AHEAD;
        aimX = aLane.x + this.camFwd.x * ahead;
        aimY = EYE_Y + aLane.y + this.camFwd.y * ahead;
        aimZ = az + this.camFwd.z * ahead;
      }
      cam.lookAt(aimX, aimY, aimZ);
      cam.rotateZ(viewRoll); // the craft + controls compensate for this (see above)
      cam.rotateX((dev.camPitchDeg * Math.PI) / 180); // pitch offset (− = look down)
      cam.rotateY((dev.camYawDeg * Math.PI) / 180); // yaw offset
      // Zoom: base zoom + a speed-scaled term (dev.speedZoom) so the view tightens
      // (or widens, if negative) the faster you go. The zoom is ALWAYS eased toward its
      // target so speed spikes (gate boost, crash crater) never snap the FOV.
      const speedT = THREE.MathUtils.clamp(
        (this.speed - speedProfile.baseSpeed) / Math.max(1, speedProfile.maxBonus),
        0,
        1,
      );
      const zoomTarget = Math.max(0.3, dev.camZoom + dev.speedZoom * speedT);
      this.camZoomCur += (zoomTarget - this.camZoomCur) * Math.min(1, dt * 3.5);
      const fov = BASE_FOV / this.camZoomCur;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }

      if (!worldFrozen)
        this.scoreState.distance += this.speed * dt * DISTANCE_SCALE;
      this.segmentState.distance = this.scoreState.distance;
      this.segmentState.speed = this.speed;

      // Spawn / cull off the canonical path z (not camera.z, which the free-cam
      // offset can shift) so the world streams identically in either camera mode.
      while (this.segmentState.nextSegZ > z - SPAWN_AHEAD) {
        this.spawnNextSegment();
      }

      cullSegments(this.bundle.scene, z, this.segmentState, {
        geo: this.geo,
        mat: this.shared,
      });

      if (!frozen) updateObstacles(dt, this.segmentState.obstacles);
      this.bundle.scene.updateMatrixWorld(true);

      // Weave model: collide the avatar against obstacles (crash / pickup / weave).
      if (!worldFrozen && this.started) {
        checkAvatarCollision(
          this.avatar.pos,
          dev.hitX,
          dev.hitY,
          dev.hitZ,
          this.segmentState.obstacles,
          this.handleCrash,
          this.handlePickup,
          this.handleGraze,
          () => this.scoreState.crashCooldown,
          this.speed * dt, // swept band — no tunnelling at speed / low fps
          isBoosting || this.tutorial.active, // armour-style (shatter-through, no crash) during the tutorial
        );
      }

      // How-to-play tutorial: a guided real flight with freeze-gated lessons. The
      // completion panel's buttons (wired in startTutorial) drive what happens next.
      if (this.tutorial.active) {
        this.tutorial.update(
          {
            axisX: this.input.axisX,
            axisY: this.input.axisY,
            fire: fireRequested,
            distance: this.scoreState.distance,
          },
          dt,
        );
      }

      // Scatter missiles (Space / double-tap): fire a fan of bolts from the orb.
      if (this.input.powerRequest && this.started) {
        this.input.powerRequest = false;
        if (this.powerCd <= 0) {
          const orbPos = this.avatar.orb.getWorldPosition(new THREE.Vector3());
          fireMissiles(
            this.missiles,
            orbPos,
            this.powerColor,
            dev.missileCount,
          );
          playTorpedo();
          this.powerCd = POWER_COOLDOWN;
          this.scoring.showGameEvent("SCATTER!");
        }
      }
      // Advance missiles; detonate (shatter) the breakable obstacles they strike.
      updateMissiles(
        this.missiles,
        dt,
        this.segmentState.obstacles,
        (o) => {
          if (o.broken || o.crystal || o.powerup) return;
          if (o.breakable) {
            shatter(
              o,
              this.bundle.scene,
              this.fragments,
              this.geo,
              this.shared,
              this.segmentState.obstacles,
              this.disposeMesh,
              this.scoring.fragmentCallbacks,
              false, // not boost-armour
              true, // shockwave blast (shards fly radially outward)
              this.speed, // carry the blast forward with the craft so it stays visible at speed
            );
          }
        },
        this.avatar.pos,
      );

      // Boost rings: fly through → speed surge + retune the held power colour.
      if (this.started) {
        updateRings(
          this.bundle.scene,
          this.ringState,
          this.bundle.camera,
          this.avatar.pos,
          this.avatar.radius,
          this.bundle.clock.elapsedTime,
          dt,
          (color, _ringPos, isCrystal) => {
            this.powerColor = color;
            setAvatarColor(this.avatar, color);
            const crystalSpeedBoostDisabled = gamescom.enabled && isCrystal;
            if (!crystalSpeedBoostDisabled) {
              const ringProfile = this.speedProfile();
              this.speed = Math.max(
                this.speed,
                (ringProfile.baseSpeed + ringProfile.maxBonus) *
                  ringProfile.boostMult,
              );
              this.avatar.boostFx = 1; // flare the thrusters on ring pass
              playBoost(); // boost cue (ported level-gate-entrance sound)
            }
            // ring stunt: alternate a yaw-720° or a roll-360° on every ring pass
            if (!gamescom.enabled) {
              if (Math.random() < 0.5)
                triggerSpin(this.avatar, false, Math.PI * 4, 0.7);
              else triggerSpin(this.avatar, true, Math.PI * 2, 0.6);
            }

            if (isCrystal) {
              // Crystal ring: big points always. The long perma-boost + COMET trail only
              // fire once you've STACKED `crystalsForComet` crystal rings in a row (the
              // stack resets on a window-lapse or a crash). Each crystal still gives the
              // immediate speed surge above; this just gates the comet/long-boost.
              playPickup(); // crystal-ring pickup cue
              if (!gamescom.enabled) this.triggerBarrelRoll(); // no 360 roll in GamesCom
              this.scoring.addScore(CRYSTAL_RING_POINTS);
              this.crystalStreak++;
              if (
                !gamescom.enabled &&
                this.crystalStreak >= Math.max(1, dev.crystalsForComet)
              ) {
                this.crystalBoostUntil =
                  this.scoreState.distance + dev.levelLength;
                this.crystalBoostColor = color;
                this.crystalStreak = 0; // consumed — stack again for the next comet
              }
              const ci = isGamesComPlayMode()
                ? Math.min(
                    this.crystalsCollected.length - 1,
                    Math.floor(this.scoreState.distance / Math.max(1, dev.levelLength)),
                  )
                : RING_COLORS.indexOf(color); // light up the collected crystal
              if (ci >= 0) this.crystalsCollected[ci] = true;
              this.scoring.showGameEvent("CRYSTAL RING!");
            } else {
              this.scoring.addScore(RING_POINTS); // smaller gain for a normal ring
              this.scoring.showGameEvent("BOOST");
            }

            // Increment the consecutive boost streak and set the time window
            if (!crystalSpeedBoostDisabled) {
              this.boostStreak++;
              this.boostStreakTimer = dev.boostArmourWindow;
            }

            // Trigger a world barrel roll for every N consecutive boosts
            if (
              !crystalSpeedBoostDisabled &&
              dev.spinOnRing &&
              this.boostStreak > 0 &&
              this.boostStreak % dev.boostsForWorldRoll === 0
            ) {
              this.triggerBarrelRoll();
            }
          },
        );
      }

      // Level gate: flying through the giant void crystal grants a long overdrive boost.
      if (!frozen && this.started) {
        for (const g of this.segmentState.gates) {
          if (!g.triggered && this.avatar.pos.z <= g.z + 0.6) {
            g.triggered = true;
            this.gateBoostTimer = dev.gateBoostDuration;
            this.avatar.boostFx = 1;
            playBoost(); // boost cue (the gate-entrance sound, reused for boosts)
            if (!gamescom.enabled)
              triggerSpin(this.avatar, false, Math.PI * 4, 0.7); // celebratory 720 (boost FX cuts during it)
            this.scoring.showGameEvent("LEVEL GATE");

            // Increment the consecutive boost streak and set the time window
            this.boostStreak++;
            this.boostStreakTimer = dev.boostArmourWindow;

            // Trigger a world barrel roll for every N consecutive boosts
            if (
              dev.spinOnRing &&
              this.boostStreak > 0 &&
              this.boostStreak % dev.boostsForWorldRoll === 0
            ) {
              this.triggerBarrelRoll();
            }
          }
        }
        // drop gates that have fallen behind the camera
        this.segmentState.gates = this.segmentState.gates.filter(
          (g) => g.z <= z + CULL_BEHIND,
        );
      }

      // The shatter animation PLAYS OUT during the hitstop (world frozen, shards
      // scatter), then the world resumes once it's done — the original beat.
      updateFragments(dt, this.fragments, this.bundle.scene);
      this.scoring.tickScoring(dt);

      // Post-crash i-frames: ghost-flash the craft body while invulnerable, restore
      // it solid once the window expires. (Collision treats this window as
      // shatter-through — see checkAvatarCollision.)
      if (this.scoreState.crashCooldown > 0) {
        const ph = performance.now() * 0.001 * Math.PI * 2 * dev.invulnFlashHz;
        const pulse = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(ph));
        setAvatarBodyOpacity(this.avatar, pulse);
        this.invulnFlashing = true;
      } else if (this.invulnFlashing) {
        setAvatarBodyOpacity(this.avatar, 1);
        this.invulnFlashing = false;
      }

      updatePalette(
        dt,
        this.scoreState.distance,
        this.bundle,
        this.sky,
        this.visuals,
        this.lastChapterEnv,
        (idx: number) => {
          this.currentEnv = refreshEnv(
            this.bundle.pmrem,
            this.bundle.scene,
            idx,
            this.currentEnv,
          );
        },
        (name: string) => {
          this.currentZone = name;
        },
        !this.started,
      );
      // Speed-as-health bar fill (normThrust). NormThrust reflects the absolute upper
      // limit including speed boosts (gate boosts / overdrive); the cl-hud renders it.
      const normalMaxSpeed = speedProfile.baseSpeed + speedProfile.maxBonus;
      const absoluteMaxSpeed = normalMaxSpeed * speedProfile.boostMult; // upper limit including ring/gate boosts

      let normThrust = 0;
      if (this.speed <= normalMaxSpeed) {
        // Normal speed (no boosts): maps from 0% to 50%
        normThrust = 0.5 * (this.speed / normalMaxSpeed);
      } else {
        // Boost/overdrive speed: maps from 50% to 100%
        const range = absoluteMaxSpeed - normalMaxSpeed;
        const progress = (this.speed - normalMaxSpeed) / range;
        normThrust = 0.5 + 0.5 * Math.min(1.0, progress);
      }

      this.avatar.powerReady = this.started && this.powerCd <= 0; // orb glows when missiles are charged

      // Gameplay HUD (ported Crystal-Line look): score/combo, run timer, level/biome,
      // polarity, EQ meter + CHARGED, off-screen indicator.
      if (this.started && !this.tutorial.active) {
        if (!worldFrozen) this.runTime += dt;
        const curChIdx = Math.floor(this.scoreState.distance / dev.levelLength);
        const curCh = gamescom.enabled
          ? gamesComChapterFor(curChIdx)
          : generalChapterFor(curChIdx);
        const expectedFirstLevelColor =
          "#" +
          (gamescom.enabled ? gamesComChapterFor(0) : generalChapterFor(0)).accent
            .toString(16)
            .padStart(6, "0");
        const levelCount = this.targetLevelCount();
        // lazily fill the per-level progress-line colours (self-heals if reset)
        if (
          this.levelColors.length === 0 ||
          this.levelColors[0] !== expectedFirstLevelColor
        ) {
          this.levelColors = [];
          for (let i = 0; i < levelCount; i++) {
            const levelCh = gamescom.enabled
              ? gamesComChapterFor(i)
              : generalChapterFor(i);
            this.levelColors.push(
              "#" + levelCh.accent.toString(16).padStart(6, "0"),
            );
          }
        }
        this.clHud.update({
          score: this.scoreState.score,
          combo: this.scoreState.combo,
          time: this.runTime,
          level:
            Math.floor(
              this.scoreState.distance / Math.max(1, dev.levelLength),
            ) + 1,
          biome: this.currentZone,
          polarityName: colorName(this.powerColor),
          polarityHex: "#" + this.powerColor.toString(16).padStart(6, "0"),
          energy: normThrust,
          charged: this.powerCd <= 0,
          crystalActive: this.scoreState.distance < this.crystalBoostUntil,
          crystalColor:
            "#" + this.crystalBoostColor.toString(16).padStart(6, "0"),
          crystals: this.crystalsCollected,
          progress: this.scoreState.distance / Math.max(1, levelCount * dev.levelLength),
          infinite: dev.infiniteLevels,
          levelColors: this.levelColors,
          zoneColor: "#" + curCh.accent.toString(16).padStart(6, "0"),
          camera: this.bundle.camera,
          avatar: this.avatar.pos,
        });
      }
      if (
        !dev.infiniteLevels &&
        !this.finished &&
        this.scoreState.distance >= this.targetLevelCount() * dev.levelLength
      ) {
        this.finishRun();
      }
      this.devPanel.update({
        speed: this.speed,
        zone: this.currentZone,
        distance: this.scoreState.distance,
      });
    }

    this.sky.mesh.position.copy(this.bundle.camera.position);
    // keep the horizon glow ahead of the camera along its (possibly turning) heading;
    // dev sliders nudge it laterally / in height / in distance.
    this.bundle.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() > 1e-4) this.fwd.normalize();
    if (dev.sunDynamic && this.started) {
      const b = steerBounds();
      const xNorm = THREE.MathUtils.clamp(
        this.avatar.steerX / Math.max(0.001, b.x),
        -1,
        1,
      );
      const yMid = (b.up + b.lo) * 0.5;
      const yRange = Math.max(0.001, (b.up - b.lo) * 0.5);
      const yNorm = THREE.MathUtils.clamp((this.avatar.steerY - yMid) / yRange, -1, 1);
      const bankNorm = THREE.MathUtils.clamp(this.bankRoll / 0.45, -1, 1);
      const sl = slopeAt(this.avatar.pos.z);
      const climbNorm = THREE.MathUtils.clamp(
        this.input.axisY * 0.55 + sl.y * 3.5 + yNorm * 0.35,
        -1,
        1,
      );
      const strength = THREE.MathUtils.clamp(dev.sunDynamicStrength, 0, 1.5);
      this._sunDynamicTarget.set(
        (xNorm * 18 + bankNorm * 28) * strength,
        (yNorm * 8 + climbNorm * 14 - Math.abs(bankNorm) * 2) * strength,
        (-climbNorm * 18 + Math.abs(bankNorm) * 8) * strength,
      );
    } else {
      this._sunDynamicTarget.set(0, 0, 0);
    }
    this._sunDynamic.lerp(this._sunDynamicTarget, Math.min(1, dt * 3.25));
    const sunLateral = dev.sunLateral + this._sunDynamic.x;
    const sunHeight = dev.sunHeight + this._sunDynamic.y;
    const sunDistance = dev.sunDistance + this._sunDynamic.z;
    this.visuals.sunSprite.position.set(
      this.bundle.camera.position.x +
        this.fwd.x * sunDistance +
        this.fwd.z * sunLateral, // right = (fwd.z, 0, -fwd.x)
      sunHeight,
      this.bundle.camera.position.z +
        this.fwd.z * sunDistance -
        this.fwd.x * sunLateral,
    );
    // The canyon floor patch is a real light/specular response, so keep the
    // directional key light aligned with the visible sun/glow source too.
    this.visuals.key.position.copy(this.visuals.sunSprite.position);
    this._sunTarget
      .copy(this.bundle.camera.position)
      .addScaledVector(this.fwd, 40);
    this._sunTarget.y = 0;
    this.visuals.key.target.position.copy(this._sunTarget);
    this.visuals.key.target.updateMatrixWorld();
    // The visible floor oval comes from the camera/head point-light pool. Negative Z
    // pushes the light forward into the canyon; positive Z pulls it back toward camera.
    this._floorGlowRight.set(this.fwd.z, 0, -this.fwd.x).normalize();
    this._floorGlowPos
      .copy(this.bundle.camera.position)
      .addScaledVector(this._floorGlowRight, dev.floorGlowX)
      .addScaledVector(this.fwd, dev.floorGlowZ);

    // Keep the camera-child point light aligned to the chosen world-space pool.
    this._hlWp.set(this._floorGlowPos.x, dev.floorGlowY, this._floorGlowPos.z);
    this.bundle.camera.updateMatrixWorld(true);
    this.visuals.head.position.copy(this.bundle.camera.worldToLocal(this._hlWp));
    this.visuals.head.distance = dev.floorGlowReach;
    this.syncGamesComFloorMaterials();
    this.syncGamesComPlayerReflector();
    updateParticles(
      this.visuals.particles,
      dt,
      this.bundle.camera.position.z,
      this.bundle.camera.position.x,
    );

    this.updateObstacleHighlight();
    this.bundle.composer.render();
  };

  private syncGamesComFloorMaterials() {
    if (!gamescom.enabled) return;
    const reflect = THREE.MathUtils.clamp(dev.floorReflect, 0, 2);
    const clearcoat = reflect > 0 ? 0.5 : 0;

    for (const seg of this.segmentState.segments) {
      seg.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;

        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        if (!mesh.userData.gamescomCanyonFloor) return;
        for (const material of materials) {
          const mat = material as THREE.MeshPhysicalMaterial & {
            isMeshPhysicalMaterial?: boolean;
          };
          if (!mat.isMeshPhysicalMaterial) continue;
          if (
            mat.userData.gamescomReflect === reflect &&
            mat.userData.gamescomClearcoat === clearcoat
          ) {
            continue;
          }
          mat.envMapIntensity = reflect;
          mat.clearcoat = clearcoat;
          mat.userData.gamescomReflect = reflect;
          mat.userData.gamescomClearcoat = clearcoat;
          mat.needsUpdate = true;
        }
      });
    }
  }

  /**
   * Outline destroyable obstacles inside the forward highlight cone so the player
   * can read what's shootable.
   * Colour + thickness come from the dev panel; thickness 0 disables it.
   */
  private updateObstacleHighlight() {
    const pass = this.bundle.outlinePass;
    if (dev.highlightThickness <= 0) {
      if (pass.selectedObjects.length) pass.selectedObjects = [];
      return;
    }
    pass.edgeThickness = dev.highlightThickness;
    pass.edgeStrength = 2.5 + dev.highlightThickness * 1.5;
    pass.visibleEdgeColor.set(dev.highlightColor);
    pass.hiddenEdgeColor.set(dev.highlightColor);

    const sel: THREE.Object3D[] = [];
    if (this.started && !this.finished) {
      const cosMax = Math.cos((dev.missileConeAngle * Math.PI) / 180);
      const range = dev.highlightSameAsMissileRange ? dev.missileConeRange : dev.highlightRange;
      for (const o of this.segmentState.obstacles) {
        if (o.broken || !o.breakable || o.crystal || o.powerup) continue;
        // highlight everything the scatter missiles can actually hit (anything
        // breakable inside the targeting cone) — not just lane-blocking pieces.
        o.mesh.getWorldPosition(this._hlWp);
        this._hlDisp.subVectors(this._hlWp, this.avatar.pos);
        const along = this._hlDisp.dot(this.camFwd);
        if (along < 0 || along > range) continue;
        const len = this._hlDisp.length();
        if (len > 1e-4 && along / len < cosMax) continue; // inside the cone half-angle
        sel.push(o.mesh);
      }
    }
    pass.selectedObjects = sel;
  }
}
