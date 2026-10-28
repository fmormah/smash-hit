import * as THREE from "three";
import { EYE_Y, GRAVITY, OBS_TOP, PATH_HALF } from "../../config/constants";
import { CHAPTERS } from "../../config/chapters";
import { gamesComChapterFor } from "../../config/gamescom-levels";
import { gamescom } from "../../config/runtime";
import type {
  MaterialFactories,
  SharedGeometries,
} from "../../rendering/materials";
import { rnd } from "../../utils/random";
import type { Obstacle, Segment } from "../../types";
import { addObstacle, coversCenter, makePane } from "../obstacle-helpers";
import { chapterAt } from "../chapter";

function chapterAccent(segIndex: number) {
  return gamescom.enabled
    ? gamesComChapterFor(chapterAt(segIndex)).accent
    : CHAPTERS[chapterAt(segIndex) % CHAPTERS.length].accent;
}
function glassPyramid(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const base = 4;
  const size = 1.4;
  for (let row = 0; row < base; row++) {
    const cnt = base - row;
    for (let i = 0; i < cnt; i++) {
      const x = (i - (cnt - 1) / 2) * (size + 0.1);
      const y = 0.4 + size / 2 + row * (size + 0.05);
      const m = new THREE.Mesh(geo.frag, mats.glass());
      m.scale.set(size, size, size);
      m.position.set(x, y, 0);
      const o = addObstacle(seg, m, obstacles, {});
      o.blocksCenter = coversCenter(o.mesh);
    }
  }
}

function pendulum(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
  dispose: (mesh: THREE.Object3D) => void,
) {
  const pivotY = OBS_TOP + 5.5;
  const len = rnd(4.5, 5.8);
  const amp = rnd(0.55, 0.9);
  const phase = rnd(0, 6.28);
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, len, 6),
    new THREE.MeshBasicMaterial({ color: 0x9fb6d0, fog: false }),
  );
  seg.group.add(rope);
  const bob = new THREE.Mesh(geo.bob, mats.glass());
  const o = addObstacle(seg, bob, obstacles, {
    fragColor: 0xaef0ff,
    update: (dt, ob) => {
      ob.t += dt;
      const ang = Math.sin(ob.t * 2.05 + phase) * amp;
      const x = Math.sin(ang) * len;
      const y = pivotY - Math.cos(ang) * len;
      ob.mesh.position.set(x, y, 0);
      rope.position.set(x / 2, (pivotY + y) / 2, 0);
      rope.rotation.z = -ang;
      ob.blocksCenter = coversCenter(ob.mesh, 0.2);
    },
  });
  o.cleanup = () => {
    seg.group.remove(rope);
    dispose(rope);
  };
}

function pendulumField(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  mats: MaterialFactories,
  dispose: (mesh: THREE.Object3D) => void,
) {
  const cnt = 4;
  const pivotY = OBS_TOP + 5.5;
  const len = 5.5;
  for (let i = 0; i < cnt; i++) {
    const phase = (i / cnt) * Math.PI * 2;
    const baseX = -PATH_HALF + ((PATH_HALF * 2) / (cnt + 1)) * (i + 1);
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, len, 6),
      new THREE.MeshBasicMaterial({ color: 0x9fb6d0, fog: false }),
    );
    seg.group.add(rope);
    const bob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.6, 0),
      mats.glass(),
    );
    const o = addObstacle(seg, bob, obstacles, {
      update: (dt, ob) => {
        ob.t += dt;
        const ang = Math.sin(ob.t * 2.65 + phase) * 0.7;
        const x = baseX + Math.sin(ang) * 1.3;
        const y = pivotY - Math.cos(ang) * len;
        ob.mesh.position.set(x, y, i * 0.5 - 1);
        rope.position.set(
          (baseX + x) / 2,
          (pivotY + y) / 2,
          ob.mesh.position.z,
        );
        rope.rotation.z = Math.atan2(baseX - x, len);
        ob.blocksCenter = coversCenter(ob.mesh, 0.2);
      },
    });
    o.cleanup = () => {
      seg.group.remove(rope);
      dispose(rope);
    };
  }
}

function windmill(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const hub = new THREE.Group();
  hub.position.set(rnd(-1, 1), OBS_TOP / 2 + 0.5, 0);
  seg.group.add(hub);
  const blades = 3 + ((Math.random() * 2) | 0);
  const spin = rnd(1.15, 2.55) * (Math.random() < 0.5 ? -1 : 1);
  const bladeLen = OBS_TOP * 0.45;
  const arms: Obstacle[] = [];
  for (let i = 0; i < blades; i++) {
    const blade = makePane(
      geo.pane,
      mats.glass,
      0.7,
      bladeLen,
      0,
      bladeLen / 2,
      0,
    );
    const arm = new THREE.Group();
    arm.rotation.z = (i / blades) * Math.PI * 2;
    arm.add(blade);
    hub.add(arm);
    arms.push(addObstacle(seg, blade, obstacles, { noAdd: true }));
  }
  const driver: Obstacle = {
    mesh: hub,
    seg,
    breakable: false,
    blocksCenter: false,
    broken: false,
    t: 0,
    type: "driver",
    hp: 0,
    maxHp: 0,
    crystal: false,
    steel: false,
    powerup: 0,
    update: (dt) => {
      hub.rotation.z += spin * dt;
      for (const a of arms)
        if (!a.broken) a.blocksCenter = coversCenter(a.mesh, 0.2);
    },
    base: hub.position.clone(),
    fragColor: 0,
  };
  obstacles.push(driver);
  seg.obstacles.push(driver);
}

function dnaHelix(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const hub = new THREE.Group();
  hub.position.set(0, OBS_TOP / 2, 0);
  hub.rotation.z = rnd(-0.5, 0.5);
  seg.group.add(hub);
  const turns = 2.2;
  const rungs = 16;
  const radius = 2.2;
  const length = 9;
  const spin = rnd(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1);
  const railMat = mats.glass();
  const rungsArr: Obstacle[] = [];
  for (let i = 0; i < rungs; i++) {
    const t = i / (rungs - 1);
    const ang = t * Math.PI * 2 * turns;
    const z = (t - 0.5) * length;
    const rung = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 2, 0.22, 0.22),
      railMat,
    );
    rung.position.set(0, 0, z);
    rung.rotation.z = ang;
    hub.add(rung);
    rungsArr.push(
      addObstacle(seg, rung, obstacles, { noAdd: true, fragColor: 0xaef0ff }),
    );
  }
  const driver: Obstacle = {
    mesh: hub,
    seg,
    breakable: false,
    blocksCenter: false,
    broken: false,
    t: 0,
    type: "driver",
    hp: 0,
    maxHp: 0,
    crystal: false,
    steel: false,
    powerup: 0,
    update: (dt) => {
      hub.rotation.x += spin * dt;
      for (const r of rungsArr)
        if (!r.broken) r.blocksCenter = coversCenter(r.mesh, 0.25);
    },
    base: hub.position.clone(),
    fragColor: 0,
  };
  obstacles.push(driver);
  seg.obstacles.push(driver);
}

function circlePortal(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.55, 12, 28),
    mats.glassReinf(),
  );
  ring.position.set(0, EYE_Y + 0.4, 0);
  const o = addObstacle(seg, ring, obstacles, {
    type: "reinforced",
    hp: 2,
    fragColor: 0xbfe0ff,
  });
  o.blocksCenter = false;
  if (Math.random() < 0.6) {
    const bar = makePane(_geo.pane, mats.glass, 0.5, 3.6, 0, EYE_Y + 0.4, 0);
    const b = addObstacle(seg, bar, obstacles, {});
    b.blocksCenter = coversCenter(b.mesh, 0.1);
  }
}

function beamCurtain(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const accent = chapterAccent(seg.index);
  const beamMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.8,
    fog: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = -PATH_HALF + PATH_HALF * 2 * (i / (n - 1));
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, OBS_TOP + 1, 0.08),
      beamMat,
    );
    beam.position.set(x, (OBS_TOP + 1) / 2, 0);
    seg.group.add(beam);
  }
  const slatH = rnd(1.4, 2.2);
  const y = rnd(slatH / 2 + 0.3, OBS_TOP - slatH / 2);
  for (let i = 0; i < 2; i++) {
    const o = addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.glassReinf,
        PATH_HALF * 2,
        slatH,
        0,
        y + i * 2.4 * (Math.random() < 0.5 ? 1 : -1),
        0,
      ),
      obstacles,
      { type: "reinforced", hp: 2, fragColor: 0xbfe0ff },
    );
    o.blocksCenter = coversCenter(o.mesh, 0.1);
  }
}

function slidingDoors(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const h = OBS_TOP - 0.4;
  const panelW = PATH_HALF;
  const spd = rnd(2.25, 3.85);
  for (const sx of [-1, 1]) {
    const baseClosed = (sx * panelW) / 2;
    addObstacle(
      seg,
      makePane(geo.pane, mats.glass, panelW, h, baseClosed, h / 2 + 0.3, 0),
      obstacles,
      {
        update: (dt, ob) => {
          ob.t += dt;
          const open = Math.sin(ob.t * spd) * 0.5 + 0.5;
          ob.mesh.position.x = baseClosed + sx * open * panelW * 0.95;
          ob.blocksCenter = coversCenter(ob.mesh, 0.1);
        },
      },
    );
  }
}

function verticalGate(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const w = PATH_HALF * 2;
  const h = OBS_TOP * 0.55;
  const spd = rnd(2.0, 3.45);
  addObstacle(
    seg,
    makePane(geo.pane, mats.glassReinf, w, h, 0, 0, 0, mats.glassReinf()),
    obstacles,
    {
      type: "reinforced",
      hp: 2,
      fragColor: 0xbfe0ff,
      update: (dt, ob) => {
        ob.t += dt;
        const up = Math.sin(ob.t * spd) * 0.5 + 0.5;
        ob.mesh.position.y = h / 2 + up * (OBS_TOP - h);
        ob.blocksCenter = coversCenter(ob.mesh, 0.1);
      },
    },
  );
}

function fallingBlocks(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
  _dispose: (mesh: THREE.Object3D) => void,
  camera: THREE.Camera,
) {
  for (let i = 0; i < 4; i++) {
    const size = rnd(1.1, 1.8);
    const fallDelay = i * 0.12;
    const m = new THREE.Mesh(geo.frag, mats.glass());
    m.scale.set(size, size, size);
    m.position.set(
      rnd(-PATH_HALF + 0.6, PATH_HALF - 0.6),
      OBS_TOP + rnd(0, 2),
      rnd(-3, 3),
    );
    addObstacle(seg, m, obstacles, {
      update: (dt, ob) => {
        const pos = new THREE.Vector3();
        ob.mesh.getWorldPosition(pos);
        const ahead = pos.z - camera.position.z;
        if (!ob._falling && ahead > -22) {
          ob._falling = true;
          ob._vy = 0;
          ob._wait = fallDelay;
        }
        if (ob._falling) {
          if (ob._wait! > 0) ob._wait! -= dt;
          else {
            ob._vy! -= GRAVITY * 0.6 * dt;
            ob.mesh.position.y += ob._vy! * dt;
            if (ob.mesh.position.y < size / 2 + 0.1) {
              ob.mesh.position.y = size / 2 + 0.1;
              ob._vy = 0;
            }
          }
          ob.mesh.rotation.x += dt * 0.6;
          ob.mesh.rotation.z += dt * 0.4;
          ob.blocksCenter = coversCenter(ob.mesh, 0.2);
        }
      },
    });
  }
}

function closingWall(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
  _dispose: (mesh: THREE.Object3D) => void,
  camera: THREE.Camera,
) {
  const h = OBS_TOP - 0.2;
  const panelW = PATH_HALF * 1.1;
  for (const sx of [-1, 1]) {
    addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.glassReinf,
        panelW,
        h,
        0,
        h / 2 + 0.2,
        0,
        mats.glassReinf(),
      ),
      obstacles,
      {
        type: "reinforced",
        hp: 2,
        fragColor: 0xbfe0ff,
        update: (_dt, ob) => {
          const pos = new THREE.Vector3();
          ob.mesh.getWorldPosition(pos);
          const ahead = pos.z - camera.position.z;
          const closeT = THREE.MathUtils.clamp((ahead + 42) / 42, 0, 1);
          ob.mesh.position.x = sx * (panelW * 0.5 + (1 - closeT) * panelW);
          ob.blocksCenter = coversCenter(ob.mesh, 0.1);
        },
      },
    );
  }
}

// ---- new mechanics (from deeper footage analysis) ----

/** Downward glass spikes hanging from the ceiling; the long ones reach the lane. */
function hangingSpikes(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const n = 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const x = -PATH_HALF + PATH_HALF * 2 * (i / (n - 1));
    const len = rnd(1.5, 4.6);
    const m = new THREE.Mesh(geo.spike, mats.glass());
    m.scale.set(rnd(0.7, 1.1), len, rnd(0.7, 1.1));
    m.rotation.x = Math.PI; // apex points down
    m.position.set(x, OBS_TOP + 0.7 - len / 2, rnd(-1.5, 1.5));
    const o = addObstacle(seg, m, obstacles, { fragColor: 0xaef0ff });
    o.blocksCenter = coversCenter(o.mesh, 0.2);
  }
}

/** A wide horizontal glass beam suspended across the lane; sometimes a stacked pair. */
function suspendedBeam(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const h = rnd(0.8, 1.4);
  const y = rnd(EYE_Y - 0.4, OBS_TOP - 1);
  const o = addObstacle(
    seg,
    makePane(
      geo.pane,
      mats.glassReinf,
      PATH_HALF * 2 + 0.6,
      h,
      0,
      y,
      0,
      mats.glassReinf(),
    ),
    obstacles,
    { type: "reinforced", hp: 2, fragColor: 0xbfe0ff },
  );
  o.blocksCenter = coversCenter(o.mesh, 0.1);
  if (Math.random() < 0.5) {
    const y2 = y > EYE_Y ? y - rnd(2, 3) : y + rnd(2, 3);
    if (y2 > 0.6 && y2 < OBS_TOP - 0.4) {
      const o2 = addObstacle(
        seg,
        makePane(
          geo.pane,
          mats.glassReinf,
          PATH_HALF * 2 + 0.6,
          h,
          0,
          y2,
          0,
          mats.glassReinf(),
        ),
        obstacles,
        { type: "reinforced", hp: 2, fragColor: 0xbfe0ff },
      );
      o2.blocksCenter = coversCenter(o2.mesh, 0.1);
    }
  }
}

/** A large pane revolving around its vertical axis, sweeping the lane open and shut. */
function spinningPanel(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const w = rnd(3.2, 5);
  const h = rnd(3.5, OBS_TOP - 0.6);
  const spd = rnd(1.35, 2.85) * (Math.random() < 0.5 ? -1 : 1);
  const m = makePane(geo.pane, mats.glass, w, h, 0, h / 2 + 0.2, 0);
  addObstacle(seg, m, obstacles, {
    update: (dt, ob) => {
      ob.t += dt;
      ob.mesh.rotation.y = ob.t * spd;
      ob.blocksCenter = coversCenter(ob.mesh, 0.2);
    },
  });
}

/** Alternating floor- and ceiling-mounted glass columns forming a slalom. */
function staggeredColumns(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = -PATH_HALF + PATH_HALF * 2 * (i / (n - 1));
    const fromFloor = i % 2 === 0;
    const h = fromFloor ? rnd(OBS_TOP * 0.6, OBS_TOP) : rnd(1.4, 2.6);
    const y = fromFloor ? h / 2 + 0.2 : OBS_TOP - h / 2;
    const o = addObstacle(
      seg,
      makePane(geo.pane, mats.glass, 0.9, h, x, y, rnd(-1, 1)),
      obstacles,
      {},
    );
    o.blocksCenter = coversCenter(o.mesh);
  }
}

function doubleWindmill(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const spawnWindmill = (zOffset: number, spinDir: number) => {
    const hub = new THREE.Group();
    hub.position.set(rnd(-0.5, 0.5), OBS_TOP / 2 + 0.5, zOffset);
    seg.group.add(hub);
    const blades = 4;
    const spin = rnd(1.45, 2.35) * spinDir;
    const bladeLen = OBS_TOP * 0.45;
    const arms: Obstacle[] = [];
    for (let i = 0; i < blades; i++) {
      const blade = makePane(
        geo.pane,
        mats.glass,
        0.7,
        bladeLen,
        0,
        bladeLen / 2,
        0,
      );
      const arm = new THREE.Group();
      arm.rotation.z = (i / blades) * Math.PI * 2;
      arm.add(blade);
      hub.add(arm);
      arms.push(addObstacle(seg, blade, obstacles, { noAdd: true }));
    }
    const driver: Obstacle = {
      mesh: hub,
      seg,
      breakable: false,
      blocksCenter: false,
      broken: false,
      t: 0,
      type: "driver",
      hp: 0,
      maxHp: 0,
      crystal: false,
      steel: false,
      powerup: 0,
      update: (dt) => {
        hub.rotation.z += spin * dt;
        for (const a of arms)
          if (!a.broken) a.blocksCenter = coversCenter(a.mesh, 0.2);
      },
      base: hub.position.clone(),
      fragColor: 0,
    };
    obstacles.push(driver);
    seg.obstacles.push(driver);
  };

  spawnWindmill(-2.2, 1);
  spawnWindmill(2.2, -1);
}

function longitudinalPane(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const w = rnd(4, 9); // length along the path (Z-axis)
  const h = rnd(2.5, OBS_TOP - 1);
  const x = rnd(-1, 1) * 0.8; // slightly offset from center or centered
  const y = h / 2 + 0.2;
  const m = makePane(geo.pane, mats.glass, w, h, x, y, 0);
  m.rotation.y = Math.PI / 2; // rotate 90 degrees to align along Z-axis
  const o = addObstacle(seg, m, obstacles, {});
  o.blocksCenter = coversCenter(o.mesh);
}

function floorCrystalsPattern(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const n = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const py = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.85, 4),
      mats.crystal(),
    );
    py.position.set(rnd(-PATH_HALF + 0.6, PATH_HALF - 0.6), 0.42, rnd(-5, 5));
    py.rotation.y = Math.PI / 4;
    addObstacle(seg, py, obstacles, {
      type: "crystal",
      crystal: true,
      fragColor: 0x9affe0,
      update: (dt, ob) => {
        ob.mesh.rotation.y += dt * 1.0;
      },
    });
  }
}

function slidingBlocks(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const h = rnd(1.5, 2.5);
  const w = rnd(2.0, 3.5);
  const y = h / 2 + rnd(0.2, 1.0);
  const spd = rnd(3.2, 6.4);
  const offset = rnd(0, Math.PI * 2);
  const range = PATH_HALF - w / 2 + 0.5;

  addObstacle(seg, makePane(geo.pane, mats.glass, w, h, 0, y, 0), obstacles, {
    update: (dt, ob) => {
      ob.t += dt;
      ob.mesh.position.x = Math.sin(ob.t * spd + offset) * range;
      ob.blocksCenter = coversCenter(ob.mesh, 0.2);
    },
  });
}

function popupBlockers(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
  _dispose: (mesh: THREE.Object3D) => void,
  camera: THREE.Camera,
) {
  const w = PATH_HALF * 2;
  const h = rnd(2.5, 4.0);

  // Start hidden below the floor
  const m = makePane(
    geo.pane,
    mats.glassReinf,
    w,
    h,
    0,
    -h / 2,
    0,
    mats.glassReinf(),
  );
  addObstacle(seg, m, obstacles, {
    type: "reinforced",
    hp: 2,
    fragColor: 0xbfe0ff,
    update: (dt, ob) => {
      const pos = new THREE.Vector3();
      ob.mesh.getWorldPosition(pos);
      const ahead = pos.z - camera.position.z;

      // If we're getting close, pop up rapidly
      if (!ob._falling && ahead > -35 && ahead < 0) {
        ob._falling = true; // reuse _falling flag to mean "activated"
        ob._wait = 0; // animation progress
      }

      if (ob._falling && ob._wait! < 1) {
        ob._wait! += dt * 7.0; // very fast pop up
        if (ob._wait! > 1) ob._wait = 1;

        // Easing function (ease out elastic or just sqrt)
        const t = Math.sin((ob._wait! * Math.PI) / 2);
        ob.mesh.position.y = -h / 2 + t * (h + 0.2); // ends up at h/2 + 0.2
      }

      ob.blocksCenter = coversCenter(ob.mesh, 0.1);
    },
  });
}

function laserBeams(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const y = rnd(EYE_Y - 0.5, EYE_Y + 0.5);

  // The emitter base (breakable to disable laser)
  const emitterW = 1.0;
  const emitterH = 1.5;
  const side = Math.random() < 0.5 ? 1 : -1;
  const emitterX = side * (PATH_HALF + 0.2);

  const emitter = addObstacle(
    seg,
    makePane(
      geo.pane,
      mats.glassReinf,
      emitterW,
      emitterH,
      emitterX,
      y,
      0,
      mats.glassReinf(),
    ),
    obstacles,
    { type: "reinforced", hp: 2, fragColor: 0xbfe0ff },
  );
  emitter.blocksCenter = false;

  // The laser beam itself
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xff0033,
    transparent: true,
    opacity: 0.8,
    fog: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const beamLength = PATH_HALF * 2 + 1;
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(beamLength, 0.15, 0.15),
    beamMat,
  );
  beam.position.set(0, y, 0);
  seg.group.add(beam);

  const beamObs = addObstacle(seg, beam, obstacles, {
    type: "driver", // logical only
    breakable: false,
    noAdd: true,
  });

  beamObs.update = (_dt, ob) => {
    // If the emitter is broken, the laser disappears and stops blocking
    if (emitter.broken) {
      ob.mesh.visible = false;
      ob.blocksCenter = false;
    } else {
      ob.blocksCenter = true; // Always blocking the center while active!
    }
  };
}

function pushingWalls(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
  _dispose: (mesh: THREE.Object3D) => void,
  camera: THREE.Camera,
) {
  const h = OBS_TOP - 0.4;
  const w = PATH_HALF * 1.5;

  const spd = rnd(4.0, 7.1);

  for (const sx of [-1, 1]) {
    const baseClosed = sx * (PATH_HALF + w / 2 - 0.5);
    addObstacle(
      seg,
      makePane(geo.pane, mats.glass, w, h, baseClosed, h / 2 + 0.3, 0),
      obstacles,
      {
        update: (dt, ob) => {
          const pos = new THREE.Vector3();
          ob.mesh.getWorldPosition(pos);
          const ahead = pos.z - camera.position.z;

          // Only start pushing if player is close
          if (ahead > -60 && ahead < 0) {
            ob.t += dt;
            // push in and out abruptly
            const push = Math.abs(Math.sin(ob.t * spd));
            ob.mesh.position.x = baseClosed - sx * push * (w * 0.7);
          }
          ob.blocksCenter = coversCenter(ob.mesh, 0.1);
        },
      },
    );
  }
}

export {
  glassPyramid,
  pendulum,
  pendulumField,
  windmill,
  dnaHelix,
  circlePortal,
  beamCurtain,
  slidingDoors,
  verticalGate,
  fallingBlocks,
  closingWall,
  hangingSpikes,
  suspendedBeam,
  spinningPanel,
  staggeredColumns,
  doubleWindmill,
  longitudinalPane,
  floorCrystalsPattern,
  slidingBlocks,
  popupBlockers,
  laserBeams,
  pushingWalls,
};
