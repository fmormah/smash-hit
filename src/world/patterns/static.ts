import * as THREE from "three";
import { EYE_Y, OBS_TOP, PATH_HALF } from "../../config/constants";
import type {
  MaterialFactories,
  SharedGeometries,
} from "../../rendering/materials";
import { choice, rnd } from "../../utils/random";
import type { Obstacle, Segment } from "../../types";
import { addObstacle, coversCenter, makePane } from "../obstacle-helpers";
function singlePane(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const w = rnd(2.4, PATH_HALF * 2 - 0.6);
  const h = rnd(2.2, OBS_TOP - 1);
  const x = rnd(-1, 1) * (PATH_HALF - w / 2);
  const y = rnd(h / 2 + 0.2, OBS_TOP - h / 2);
  const o = addObstacle(
    seg,
    makePane(geo.pane, mats.glass, w, h, x, y, 0),
    obstacles,
    {},
  );
  o.blocksCenter = coversCenter(o.mesh);
}

function paneRowWithGap(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const cols = 3 + ((Math.random() * 3) | 0);
  const cw = (PATH_HALF * 2) / cols;
  const h = rnd(3.2, OBS_TOP - 0.4);
  const y = h / 2 + rnd(0.2, OBS_TOP - h);
  const gap = (Math.random() * cols) | 0;
  for (let i = 0; i < cols; i++) {
    if (i === gap) continue;
    const x = -PATH_HALF + cw * (i + 0.5);
    const o = addObstacle(
      seg,
      makePane(geo.pane, mats.glass, cw - 0.12, h, x, y, 0),
      obstacles,
      {},
    );
    o.blocksCenter = coversCenter(o.mesh);
  }
}

function glassGrid(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const cols = 4;
  const rows = 3;
  const cw = (PATH_HALF * 2) / cols;
  const chh = (OBS_TOP - 0.4) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = -PATH_HALF + cw * (i + 0.5);
      const y = 0.4 + chh * (j + 0.5);
      const o = addObstacle(
        seg,
        makePane(
          geo.pane,
          mats.glass,
          cw - 0.1,
          chh - 0.1,
          x,
          y,
          rnd(-0.6, 0.6),
        ),
        obstacles,
        {},
      );
      o.blocksCenter = coversCenter(o.mesh);
    }
}

function reinforcedWall(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const w = rnd(3, PATH_HALF * 2 - 0.6);
  const h = rnd(3, OBS_TOP - 0.6);
  const x = rnd(-0.8, 0.8) * (PATH_HALF - w / 2);
  const y = h / 2 + rnd(0.2, OBS_TOP - h);
  const hp = Math.random() < 0.5 ? 2 : 3;
  const o = addObstacle(
    seg,
    makePane(geo.pane, mats.glassReinf, w, h, x, y, 0, mats.glassReinf()),
    obstacles,
    {
      type: "reinforced",
      hp,
      fragColor: 0xbfe0ff,
    },
  );
  o.blocksCenter = coversCenter(o.mesh);
}

function steelGotcha(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const plateW = rnd(1.8, 2.8);
  for (const sx of [-1, 1]) {
    const h = rnd(3, OBS_TOP);
    const x = sx * (PATH_HALF - plateW / 2 + 0.2);
    addObstacle(
      seg,
      makePane(geo.pane, mats.steel, plateW, h, x, h / 2, 0, mats.steel()),
      obstacles,
      {
        type: "steel",
        breakable: false,
        steel: true,
      },
    );
  }
  if (Math.random() < 0.5)
    addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.steel,
        PATH_HALF * 2,
        1.1,
        0,
        OBS_TOP - 0.5,
        0,
        mats.steel(),
      ),
      obstacles,
      {
        type: "steel",
        breakable: false,
        steel: true,
      },
    );
}

function decoyHole(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const w = PATH_HALF * 2 - 0.6;
  const h = OBS_TOP - 1.2;
  const y = h / 2 + 0.5;
  const t = 0.35;
  for (const [pw, ph, px, py] of [
    [w, t, 0, y + h / 2],
    [w, t, 0, y - h / 2],
    [t, h, -w / 2, y],
    [t, h, w / 2, y],
  ] as const) {
    const o = addObstacle(
      seg,
      makePane(geo.pane, mats.glass, pw, ph, px, py, 0),
      obstacles,
      {},
    );
    o.blocksCenter = false;
  }
}

function layeredPanes(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  for (let i = 0; i < 3; i++) {
    const w = rnd(2.5, PATH_HALF * 2 - 1);
    const h = rnd(2.6, OBS_TOP - 0.8);
    const x = rnd(-1, 1) * (PATH_HALF - w / 2);
    const y = h / 2 + rnd(0.2, OBS_TOP - h);
    const o = addObstacle(
      seg,
      makePane(geo.pane, mats.glass, w, h, x, y, -i * 3.2),
      obstacles,
      {},
    );
    o.blocksCenter = coversCenter(o.mesh);
  }
}

function tiltedPanes(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const n = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const w = rnd(2.5, 4);
    const h = rnd(2.5, OBS_TOP - 1);
    const m = makePane(
      geo.pane,
      mats.glass,
      w,
      h,
      rnd(-2, 2),
      h / 2 + rnd(0.2, OBS_TOP - h),
      rnd(-2, 2),
    );
    m.rotation.y = rnd(-0.7, 0.7);
    m.rotation.z = rnd(-0.25, 0.25);
    const o = addObstacle(seg, m, obstacles, {});
    o.blocksCenter = coversCenter(o.mesh, 0.6);
  }
}

function narrowSlit(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const slitY = rnd(EYE_Y - 0.6, EYE_Y + 0.8);
  const slitH = rnd(0.7, 1.2);
  const lowH = slitY - slitH / 2;
  if (lowH > 0.2) {
    const o = addObstacle(
      seg,
      makePane(geo.pane, mats.glass, PATH_HALF * 2, lowH, 0, lowH / 2, 0),
      obstacles,
      {},
    );
    o.blocksCenter = false;
  }
  const upH = OBS_TOP - (slitY + slitH / 2);
  if (upH > 0.2) {
    const o = addObstacle(
      seg,
      makePane(
        geo.pane,
        mats.glass,
        PATH_HALF * 2,
        upH,
        0,
        OBS_TOP - upH / 2,
        0,
      ),
      obstacles,
      {},
    );
    o.blocksCenter = false;
  }
}

function crystalBonus(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  geo: SharedGeometries,
  mats: MaterialFactories,
) {
  const n = 2 + ((Math.random() * 3) | 0);
  const drift = Math.random() < 0.5;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo.octa, mats.crystal());
    m.position.set(
      rnd(-PATH_HALF + 0.5, PATH_HALF - 0.5),
      rnd(1, OBS_TOP - 0.5),
      rnd(-4, 4),
    );
    m.scale.setScalar(rnd(0.7, 1.2));
    addObstacle(seg, m, obstacles, {
      type: "crystal",
      crystal: true,
      fragColor: 0x9affe0,
      update: drift
        ? (dt, ob) => {
            ob.t += dt;
            ob.mesh.position.x = ob.base.x + Math.sin(ob.t * 1.6 + i) * 1.6;
            ob.mesh.rotation.y += dt * 1.5;
            ob.mesh.rotation.x += dt * 0.8;
          }
        : (dt, ob) => {
            ob.mesh.rotation.y += dt * 1.2;
            ob.mesh.rotation.x += dt * 0.5;
          },
    });
  }
}

function multiballOrb(
  seg: Segment,
  _diff: number,
  obstacles: Obstacle[],
  _geo: SharedGeometries,
  _mats: MaterialFactories,
) {
  const value = choice([2, 3, 5]);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 24, 18),
    new THREE.MeshStandardMaterial({
      color: 0xbfeaff,
      transparent: true,
      opacity: 0.5,
      metalness: 0.1,
      roughness: 0.05,
      envMapIntensity: 1.6,
      emissive: 0x2a6cff,
      emissiveIntensity: 0.7,
    }),
  );
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.font = "900 90px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#eaffff";
  g.shadowColor = "#7fd6ff";
  g.shadowBlur = 18;
  g.fillText("×" + value, 64, 70);
  const lbl = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  lbl.scale.set(1.1, 1.1, 1);
  sphere.add(lbl);
  sphere.position.set(rnd(-2, 2), rnd(1.5, OBS_TOP - 1), rnd(-3, 3));
  addObstacle(seg, sphere, obstacles, {
    type: "powerup",
    powerup: value,
    crystal: true,
    fragColor: 0xbfeaff,
    update: (dt, ob) => {
      ob.mesh.rotation.y += dt * 0.8;
      ob.mesh.position.y = ob.base.y + Math.sin((ob.t += dt)) * 0.4;
    },
  });
}

export {
  singlePane,
  paneRowWithGap,
  glassGrid,
  reinforcedWall,
  steelGotcha,
  decoyHole,
  layeredPanes,
  tiltedPanes,
  narrowSlit,
  crystalBonus,
  multiballOrb,
};
