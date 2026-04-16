import World from "../src/world.js";
import Body from "../src/body.js";
import type { BodyConfig } from "../src/body.js";
import {
  createBoxShape,
  createSphereShape,
  iterateGeometries,
} from "@hubs/three-to-ammo";
import { AmmoDebugConstants, DefaultBufferSize } from "@hubs/ammo-debug-drawer";
import Stats from "stats.js";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  MeshBasicMaterial,
  Mesh,
  MeshNormalMaterial,
  InstancedMesh,
  Matrix4,
  BufferGeometry,
  BufferAttribute,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  Quaternion,
  BoxGeometry,
  SphereGeometry,
} from "three";

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const scene = new Scene();
const camera = new PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 10;

const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const bodies: Record<string | number, Body> = {};
const meshMatrices: Record<number, Matrix4> = {};

const floorGeometry = new BoxGeometry(10, 0.1, 10);
const floorMaterial = new MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);

const BoxGeom = new BoxGeometry(0.5, 0.5, 0.5);
const boxMaterial = new MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new Mesh(BoxGeom, boxMaterial);
scene.add(boxMesh);

const urlParams = new URLSearchParams(window.location.search);
const count = urlParams.get("count");
const ballCount = count ? parseInt(count) : 1000;
document.getElementById("info")!.innerHTML += ` (${count} Bodies)`;

const ballGeometry = new SphereGeometry(0.25, 32, 32);
const ballMaterial = new MeshNormalMaterial();
const ballMesh = new InstancedMesh(ballGeometry, ballMaterial, ballCount);
scene.add(ballMesh);

const ballMatrix = new Matrix4();
let i = 0;
const offset = (10 - 1) / 2;
for (let x = 0; x < 10; x++) {
  for (let y = 0; y < ballCount / 100; y++) {
    for (let z = 0; z < 10; z++) {
      ballMatrix.identity();
      ballMatrix.setPosition(
        offset - x + Math.random() * 0.1,
        y,
        offset - z + Math.random() * 0.1,
      );
      ballMesh.setMatrixAt(i++, ballMatrix);
    }
  }
}

const debugVertices = new Float32Array(DefaultBufferSize);
const debugColors = new Float32Array(DefaultBufferSize);
const debugGeometry = new BufferGeometry();
debugGeometry.setAttribute(
  "position",
  new BufferAttribute(debugVertices, 3).setUsage(DynamicDrawUsage),
);
debugGeometry.setAttribute(
  "color",
  new BufferAttribute(debugColors, 3).setUsage(DynamicDrawUsage),
);
const debugMaterial = new LineBasicMaterial({ vertexColors: true });
const debugMesh = new LineSegments(debugGeometry, debugMaterial);
debugMesh.frustumCulled = false;
scene.add(debugMesh);

const createBody = (options: Partial<BodyConfig>, mesh: Mesh, world: World) => {
  mesh.updateMatrixWorld();
  const matrixWorld = new Matrix4();
  matrixWorld.copy(mesh.matrixWorld);
  const body = new Body(options, matrixWorld, world);
  bodies[mesh.uuid] = body;
  return body;
};

const world = new World({ debugDrawMode: AmmoDebugConstants.DrawWireframe });
world.getDebugDrawer(null, debugVertices, debugColors).enable();

const vertices: number[][] = [];
const matrices: number[][] = [];

const floorBody = createBody({ type: "static" }, floorMesh, world);
console.log(floorBody);
iterateGeometries({
  root: floorMesh,
  cb: (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  },
});
const floorShape = createBoxShape({
  type: "box",
  fit: "all",
  vertices: vertices,
  matrices: matrices,
  matrixWorld: floorMesh.matrixWorld.elements,
});
floorBody.addShape(floorShape);

floorBody.matrix.copy(floorMesh.matrixWorld);
floorBody.syncToPhysics();

for (let i = 0; i < ballCount; i++) {
  const matrix = new Matrix4();
  ballMesh.getMatrixAt(i, matrix);
  const ballBody = new Body(
    { type: "dynamic", gravity: { y: -9.8 } },
    matrix,
    world,
  );
  bodies[i] = ballBody;
  meshMatrices[i] = matrix;
  const ballShape = createSphereShape({
    type: "sphere",
    fit: "manual",
    sphereRadius: 0.25,
    matrixWorld: matrix.elements,
  });
  ballBody.addShape(ballShape);
}

let lastTick = 0;
const pos = new Vector3();
const quat = new Quaternion();
const scale = new Vector3();
let direction = 1;

const tick = function (t: number) {
  requestAnimationFrame(tick);
  stats.begin();
  const dt = t - lastTick;
  lastTick = t;

  const x = boxMesh.position.x + (direction * 3 * dt) / 1000;
  boxMesh.position.set(x, 1, 7);
  if (x >= 1.5) {
    direction = -1.5;
  } else if (x <= -1) {
    direction = 1;
  }

  world.step(dt / 1000);
  for (let i = 0; i < ballCount; i++) {
    if (bodies[i].type === "dynamic") {
      bodies[i].syncFromPhysics();
      meshMatrices[i].decompose(pos, quat, scale);
      if (pos.y < -2) {
        meshMatrices[i].setPosition(
          Math.random() * 10 - 5,
          Math.random() * 4 + 1,
          Math.random() * 10 - 5,
        );
        bodies[i].syncToPhysics(true);
        bodies[i].physicsBody?.getLinearVelocity().setValue(0, 0, 0);
        bodies[i].physicsBody?.getAngularVelocity().setValue(0, 0, 0);
      }
      ballMesh.setMatrixAt(i, meshMatrices[i]);
    }
  }
  ballMesh.instanceMatrix.needsUpdate = true;

  if (world.debugDrawer) {
    if (world.debugDrawer.index !== 0) {
      debugGeometry.attributes.position.needsUpdate = true;
      debugGeometry.attributes.color.needsUpdate = true;
    }

    debugGeometry.setDrawRange(0, world.debugDrawer.index);
  }

  renderer.render(scene, camera);
  stats.end();
};

requestAnimationFrame(tick);

window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
