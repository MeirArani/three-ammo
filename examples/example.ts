import Body, { ActivationState, type BodyConfig } from "../src/body";
import World from "../src/world";
import Constraint from "../src/constraint";
import {
  createBoxShape,
  createCollisionShapes,
  createSphereShape,
  iterateGeometries,
} from "@hubs/three-to-ammo";
import { AmmoDebugConstants, DefaultBufferSize } from "@hubs/ammo-debug-drawer";

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  MeshBasicMaterial,
  Mesh,
  BufferGeometry,
  BufferAttribute,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Vector3,
  BoxGeometry,
  SphereGeometry,
} from "three";

const scene = new Scene();
const camera = new PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 5;

const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

interface uuidData {
  body: Body;
  mesh: Mesh;
  matrix: Matrix4;
}
const uuidMap = new Map<string, uuidData>();
const bodies = {};
const meshes = {};
const meshMatrices = {};

const floorGeometry = new BoxGeometry(5, 0.1, 5);
const floorMaterial = new MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);

const ballGeometry = new SphereGeometry(0.5, 32, 32);
const ballMaterial = new MeshBasicMaterial({ color: 0x00ff00 });
const ballMesh = new Mesh(ballGeometry, ballMaterial);
ballMesh.position.set(0, 2, 0);
scene.add(ballMesh);
console.log(ballMesh.position);

const boxGeometry = new BoxGeometry(0.5, 0.5, 0.5);
const boxMaterial = new MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new Mesh(boxGeometry, boxMaterial);
boxMesh.position.set(-2, 2, 0);
scene.add(boxMesh);

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
const debugMaterial = new LineBasicMaterial({
  vertexColors: true,
});
const debugMesh = new LineSegments(debugGeometry, debugMaterial);
debugMesh.frustumCulled = false;
scene.add(debugMesh);

const createBody = (options: Partial<BodyConfig>, mesh: Mesh, world: World) => {
  mesh.updateMatrixWorld();
  const matrixWorld = new Matrix4();
  matrixWorld.copy(mesh.matrixWorld);
  const body = new Body(options, matrixWorld, world);
  uuidMap.set(mesh.uuid, { mesh: mesh, matrix: matrixWorld, body: body });
  return body;
};

const world = new World({ debugDrawMode: AmmoDebugConstants.DrawWireframe });
world.getDebugDrawer(null, debugVertices, debugColors).enable();

const vertices: number[][] = [];
const matrices: number[][] = [];

// Floor

const floorBody = createBody({ type: "kinematic" }, floorMesh, world);
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
  minHalfExtent: 0,
  maxHalfExtent: Number.POSITIVE_INFINITY,
});
floorBody.addShape(floorShape);

vertices.length = 0;
matrices.length = 0;

// Ball

const ballBody = createBody({ type: "dynamic" }, ballMesh, world);
iterateGeometries({
  root: ballMesh,
  cb: (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  },
});
const ballShape = createSphereShape({
  type: "sphere",
  fit: "all",
  vertices: vertices,
  matrices: matrices,
  matrixWorld: ballMesh.matrixWorld.elements,
});
ballBody.addShape(ballShape);

console.log(ballMesh.position);

vertices.length = 0;
matrices.length = 0;

const boxBody = createBody(
  {
    type: "dynamic",
    activationState: ActivationState.DisableDeactivation,
  },
  boxMesh,
  world,
);
iterateGeometries({
  root: boxMesh,
  cb: (vertexArray, matrix) => {
    vertices.push(vertexArray);
    matrices.push(matrix);
  },
});
const boxShape = createBoxShape({
  type: "box",
  fit: "all",
  vertices: vertices,
  matrices: matrices,
  matrixWorld: ballMesh.matrixWorld.elements,
  minHalfExtent: 0,
  maxHalfExtent: Number.POSITIVE_INFINITY,
});
boxBody.addShape(boxShape);

//const constraint = new Constraint({ type: "lock" }, ballBody, boxBody, world);

window.setTimeout(() => {
  ballBody.update({ gravity: { y: -9.8 } });
  ballBody.physicsBody?.activate(true);

  window.setInterval(() => {
    if (ballBody.type === "dynamic") {
      ballBody.update({ type: "kinematic" });
      ballMesh.position.set(0, 2, 0);
    } else {
      ballBody.update({ type: "dynamic" });
      ballBody.physicsBody?.activate(true);
    }
  }, 3000);
}, 500);

let lastTick = 0;
const inverse = new Matrix4();
const transform = new Matrix4();
const scale = new Vector3();

const tick = function (t: number) {
  requestAnimationFrame(tick);
  const dt = t - lastTick;
  lastTick = t;

  floorMesh.rotation.y += 0.01;

  uuidMap.forEach(({ body, mesh, matrix }, uuid) => {
    if (body.type === "kinematic") {
      matrix.copy(mesh.matrixWorld);
      body.syncToPhysics();
    }
  });

  world.step(dt / 1000);

  uuidMap.forEach(({ body, mesh, matrix }, uuid) => {
    if (body.type === "dynamic" && mesh.parent) {
      body.syncFromPhysics();
      inverse.copy(mesh.parent?.matrixWorld).invert();
      transform.multiplyMatrices(inverse, matrix);
      transform.decompose(mesh.position, mesh.quaternion, scale);
    }
  });

  if (world.debugDrawer) {
    if (world.debugDrawer.index !== 0) {
      debugGeometry.attributes.position.needsUpdate = true;
      debugGeometry.attributes.color.needsUpdate = true;
    }

    debugGeometry.setDrawRange(0, world.debugDrawer.index);
  }

  renderer.render(scene, camera);
};

requestAnimationFrame(tick);

window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
