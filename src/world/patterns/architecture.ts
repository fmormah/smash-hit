import * as THREE from "three";
import { EYE_Y, OBS_TOP, PATH_HALF } from "../../config/constants";
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
function overheadSlabLanes(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const n = 3 + ((Math.random() * 2) | 0);
  const side = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const slab = new THREE.Mesh(geo.frag, mats.glassReinf());
    slab.scale.set(rnd(0.75, 1.4), rnd(0.18, 0.32), rnd(8, 13));
    slab.position.set(
      side * rnd(-0.4, PATH_HALF - 0.8),
      rnd(EYE_Y + 0.6, OBS_TOP + 0.2),
      -4 + i * rnd(2.2, 3.2),
    );
    slab.rotation.y = side * rnd(0.18, 0.42);
    slab.rotation.z = side * rnd(0.08, 0.22);
    const o = addObstacle(seg, slab, obstacles, {
      type: "reinforced",
      hp: 2,
      fragColor: 0xbfe0ff,
    });
    o.blocksCenter = coversCenter(o.mesh, 0.18);
  }

  if (Math.random() < 0.55) {
    const h = rnd(0.75, 1.15);
    const y = rnd(EYE_Y - 0.15, EYE_Y + 1.4);
    const o = addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.glass,
        PATH_HALF * 1.8,
        h,
        rnd(-0.5, 0.5),
        y,
        rnd(-1.5, 1.5),
      ),
      obstacles,
      {},
    );
    o.mesh.rotation.z = side * rnd(0.1, 0.22);
    o.blocksCenter = coversCenter(o.mesh, 0.16);
  }
}

function craneClaws(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const accent = chapterAccent(seg.index);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x1a2630,
    metalness: 0.55,
    roughness: 0.35,
    emissive: accent,
    emissiveIntensity: 0.25,
  });
  const rail = new THREE.Mesh(geo.frag, railMat);
  rail.scale.set(PATH_HALF * 2 + 1.4, 0.12, 0.18);
  rail.position.set(0, OBS_TOP + 2.45, 0);
  seg.group.add(rail);

  const phase = rnd(0, Math.PI * 2);
  const pivot = new THREE.Group();
  pivot.position.set(rnd(-1.2, 1.2), OBS_TOP + 2.3, rnd(-2.5, 2.5));
  seg.group.add(pivot);

  const len = rnd(3.3, 4.6);
  const chain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, len, 6),
    new THREE.MeshBasicMaterial({ color: 0x9fb6d0, fog: false }),
  );
  chain.position.y = -len / 2;
  pivot.add(chain);

  const pieces: Obstacle[] = [];
  const hub = new THREE.Mesh(geo.bob, mats.glassReinf());
  hub.scale.setScalar(0.72);
  hub.position.set(0, -len, 0);
  pivot.add(hub);
  pieces.push(
    addObstacle(seg, hub, obstacles, {
      noAdd: true,
      type: "reinforced",
      hp: 2,
      fragColor: 0xbfe0ff,
    }),
  );

  for (let i = 0; i < 3; i++) {
    const claw = new THREE.Mesh(geo.frag, mats.glass());
    claw.scale.set(0.24, 1.05, 0.32);
    claw.position.set((i - 1) * 0.42, -len - 0.85, 0);
    claw.rotation.z = (i - 1) * 0.32;
    pivot.add(claw);
    pieces.push(
      addObstacle(seg, claw, obstacles, { noAdd: true, fragColor: 0xaef0ff }),
    );
  }

  const driver: Obstacle = {
    mesh: pivot,
    seg,
    type: "driver",
    breakable: false,
    hp: 0,
    maxHp: 0,
    blocksCenter: false,
    crystal: false,
    steel: false,
    powerup: 0,
    broken: false,
    t: 0,
    base: pivot.position.clone(),
    fragColor: 0,
    update: (dt, ob) => {
      ob.t += dt;
      pivot.position.x = ob.base.x + Math.sin(ob.t * 1.7 + phase) * 1.5;
      pivot.rotation.z = Math.sin(ob.t * 2.55 + phase) * 0.32;
      for (const p of pieces) {
        if (!p.broken) p.blocksCenter = coversCenter(p.mesh, 0.18);
      }
    },
  };
  obstacles.push(driver);
  seg.obstacles.push(driver);
}

function towerGate(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const accent = chapterAccent(seg.index);
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x182636,
    transparent: true,
    opacity: 0.42,
    metalness: 0.15,
    roughness: 0.18,
    envMapIntensity: 1.1,
    emissive: accent,
    emissiveIntensity: 0.18,
  });

  for (const sx of [-1, 1]) {
    const tower = new THREE.Mesh(geo.frag, towerMat);
    tower.scale.set(rnd(1.1, 1.7), OBS_TOP + rnd(5, 8), rnd(2.0, 3.2));
    tower.position.set(
      sx * rnd(PATH_HALF + 0.9, PATH_HALF + 2.2),
      tower.scale.y / 2 - 0.2,
      rnd(-1.5, 1.5),
    );
    seg.group.add(tower);

    const vertical = addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.glassReinf,
        rnd(0.7, 1.1),
        OBS_TOP - 0.6,
        sx * rnd(2.2, 3.0),
        OBS_TOP / 2,
        0,
        mats.glassReinf(),
      ),
      obstacles,
      { type: "reinforced", hp: 2, fragColor: 0xbfe0ff },
    );
    vertical.blocksCenter = coversCenter(vertical.mesh, 0.12);
  }

  const lintelH = rnd(0.75, 1.2);
  const lintel = addObstacle(
    seg,
    makePane(
      geo.pane,
      mats.glass,
      PATH_HALF * 2,
      lintelH,
      0,
      OBS_TOP - lintelH / 2,
      0,
    ),
    obstacles,
    {},
  );
  lintel.blocksCenter = false;

  if (Math.random() < 0.65) {
    const hanging = addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.glassReinf,
        rnd(1.0, 1.6),
        rnd(1.8, 2.5),
        rnd(-0.7, 0.7),
        OBS_TOP - 1.2,
        0,
        mats.glassReinf(),
      ),
      obstacles,
      { type: "reinforced", hp: 2, fragColor: 0xbfe0ff },
    );
    hanging.blocksCenter = coversCenter(hanging.mesh, 0.12);
  }

  for (const sx of [-1, 1]) {
    const truss = new THREE.Mesh(geo.frag, towerMat);
    truss.scale.set(0.12, 0.12, rnd(5.0, 6.5));
    truss.position.set(sx * 2.2, rnd(3.2, OBS_TOP + 1.8), rnd(-1, 1));
    truss.rotation.z = sx * 0.7;
    truss.rotation.y = sx * 0.35;
    seg.group.add(truss);
  }
}

function beamElevators(
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
    opacity: 0.85,
    fog: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = -PATH_HALF + PATH_HALF * 2 * (i / (n - 1));
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, OBS_TOP + 1.4, 0.08),
      beamMat,
    );
    beam.position.set(x, (OBS_TOP + 1.4) / 2, 0);
    seg.group.add(beam);

    if (i === 1 || i === 2 || i === 3) {
      addObstacle(
        seg,
        makePane(
          geo.pane,
          mats.glassReinf,
          0.82,
          rnd(1.4, 2.2),
          x,
          EYE_Y,
          0,
          mats.glassReinf(),
        ),
        obstacles,
        {
          type: "reinforced",
          hp: 2,
          fragColor: 0xbfe0ff,
          update: (dt, ob) => {
            ob.t += dt;
            const phase = i * 1.4;
            ob.mesh.position.y = EYE_Y + Math.sin(ob.t * 2.7 + phase) * 1.65;
            ob.blocksCenter = coversCenter(ob.mesh, 0.12);
          },
        },
      );
    }
  }

  addObstacle(
    seg,
    makePane(geo.pane, mats.glass, PATH_HALF * 1.75, 0.55, 0, EYE_Y + 1.25, 0),
    obstacles,
    {
      update: (dt, ob) => {
        ob.t += dt;
        ob.mesh.position.x = Math.sin(ob.t * 2.25) * 0.86;
        ob.mesh.position.y = EYE_Y + 1.25 + Math.cos(ob.t * 2.25) * 0.65;
        ob.blocksCenter = coversCenter(ob.mesh, 0.12);
      },
    },
  );
}

function switchGate(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const accent = chapterAccent(seg.index);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x151820,
    metalness: 0.65,
    roughness: 0.38,
    emissive: accent,
    emissiveIntensity: 0.45,
  });

  const frameParts: Array<[number, number, number, number, number]> = [
    [0.55, OBS_TOP + 1.4, -3.2, (OBS_TOP + 1.2) / 2, 0],
    [0.55, OBS_TOP + 1.4, 3.2, (OBS_TOP + 1.2) / 2, 0],
    [6.9, 0.55, 0, OBS_TOP + 1.1, 0],
    [4.9, 0.36, 0, 0.18, 0],
  ];
  for (const [w, h, x, y, z] of frameParts) {
    const part = new THREE.Mesh(geo.frag, frameMat);
    part.scale.set(w, h, 0.6);
    part.position.set(x, y, z);
    seg.group.add(part);
  }

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.55, 0.28, 12, 34),
    frameMat,
  );
  ring.position.set(0, EYE_Y + 0.35, 0);
  seg.group.add(ring);

  const leftDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.22, 34, 1, false, 0, Math.PI),
    mats.glassReinf(),
  );
  leftDisc.rotation.x = Math.PI / 2;
  leftDisc.position.set(0, EYE_Y + 0.35, 0);
  const leftO = addObstacle(seg, leftDisc, obstacles, {
    type: "reinforced",
    hp: 3,
    fragColor: 0xbfe0ff,
  });
  leftO.blocksCenter = true;

  const rightDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(
      2.35,
      2.35,
      0.22,
      34,
      1,
      false,
      Math.PI,
      Math.PI,
    ),
    mats.glassReinf(),
  );
  rightDisc.rotation.x = Math.PI / 2;
  rightDisc.position.set(0, EYE_Y + 0.35, 0);
  const rightO = addObstacle(seg, rightDisc, obstacles, {
    type: "reinforced",
    hp: 3,
    fragColor: 0xbfe0ff,
  });
  rightO.blocksCenter = true;

  const switchMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0xbfeaff,
      emissive: accent,
      emissiveIntensity: 1.4,
      metalness: 0.25,
      roughness: 0.08,
      envMapIntensity: 1.4,
    }),
  );
  switchMesh.position.set(0, OBS_TOP + 1.9, 0);
  const switchO = addObstacle(seg, switchMesh, obstacles, {
    type: "switch",
    crystal: true,
    fragColor: accent,
    update: (dt, ob) => {
      ob.t += dt;
      ob.mesh.position.y = OBS_TOP + 1.9 + Math.sin(ob.t * 3.8) * 0.2;
      ob.mesh.rotation.y += dt * 2.35;
    },
  });

  leftO.update = (dt, ob) => {
    if (switchO.broken) {
      ob.mesh.position.x = THREE.MathUtils.lerp(
        ob.mesh.position.x,
        -2.65,
        dt * 9.0,
      );
      ob.mesh.rotation.z = THREE.MathUtils.lerp(
        ob.mesh.rotation.z,
        0.35,
        dt * 6.1,
      );
    }
    ob.blocksCenter = switchO.broken ? coversCenter(ob.mesh, 0.05) : true;
  };

  rightO.update = (dt, ob) => {
    if (switchO.broken) {
      ob.mesh.position.x = THREE.MathUtils.lerp(
        ob.mesh.position.x,
        2.65,
        dt * 9.0,
      );
      ob.mesh.rotation.z = THREE.MathUtils.lerp(
        ob.mesh.rotation.z,
        -0.35,
        dt * 6.1,
      );
    }
    ob.blocksCenter = switchO.broken ? coversCenter(ob.mesh, 0.05) : true;
  };
}

export { overheadSlabLanes, craneClaws, towerGate, beamElevators, switchGate };
