import { AmmoDebugConstants, DefaultBufferSize } from "@hubs/ammo-debug-drawer";
import { WorkerHelpers } from "../index";
import type { AmmoWorker } from "../index";
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
  LineBasicMaterial,
  LineSegments,
  Vector3,
  Quaternion,
  BoxGeometry,
  SphereGeometry,
} from "three";
import { BUFFER_CONFIG } from "../src/workers/ammo.worker";
import type { AmmoEvent } from "../src/workers/ammo.worker";

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

const uuids: string[] = [];
const indexes: Record<string, number> = {};

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

const ammoWorker = new Worker(
  new URL("../src/workers/ammo.worker.ts", import.meta.url),
  {
    type: "module",
  },
) as AmmoWorker;

const workerHelpers = WorkerHelpers(ammoWorker);

const arrayBuffer = new ArrayBuffer(
  4 * BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES + //matrices
    4 * BUFFER_CONFIG.MAX_BODIES, //velocities
);
let objectMatricesFloatArray = new Float32Array<ArrayBuffer>(arrayBuffer);

/* DEBUG RENDERING */
const debugSharedArrayBuffer = new SharedArrayBuffer(
  4 + 2 * DefaultBufferSize * 4,
);
const debugIndex = new Uint32Array(debugSharedArrayBuffer, 0, 4);
const debugVertices = new Float32Array(
  debugSharedArrayBuffer,
  4,
  DefaultBufferSize,
);
const debugColors = new Float32Array(
  debugSharedArrayBuffer,
  4 + DefaultBufferSize,
  DefaultBufferSize,
);
const debugGeometry = new BufferGeometry();
debugGeometry.setAttribute("position", new BufferAttribute(debugVertices, 3));
debugGeometry.setAttribute("color", new BufferAttribute(debugColors, 3));
const debugMaterial = new LineBasicMaterial({
  vertexColors: true,
  depthTest: true,
});
const debugMesh = new LineSegments(debugGeometry, debugMaterial);
debugMesh.frustumCulled = false;
debugMesh.renderOrder = 999;
scene.add(debugMesh);

ammoWorker.postMessage(
  {
    type: "init",
    worldConfig: { debugDrawMode: AmmoDebugConstants.DrawWireframe },
    buffer: arrayBuffer,
  },
  [arrayBuffer],
);
ammoWorker.onmessage = async (event: AmmoEvent) => {
  if (event.data.type === "ready") {
    // workerHelpers.enableDebug(true, debugSharedArrayBuffer);

    workerHelpers.addBody("floor", floorMesh, { type: "static" });
    const floorGeometryData = workerHelpers.prepareGeometry(floorMesh);
    workerHelpers.addShapes("floor", "floorShape", {
      type: "box",
      fit: "all",
      vertices: floorGeometryData.vertices,
      matrices: floorGeometryData.matrices,
      matrixWorld: floorMesh.matrixWorld.elements,
    });

    for (let i = 0; i < ballCount; i++) {
      const matrix = new Matrix4();
      ballMesh.getMatrixAt(i, matrix);
      ammoWorker.postMessage({
        type: "addBody",
        uuid: i.toString(),
        matrix: matrix.elements,
        options: { type: "dynamic", gravity: { y: -9.8 } },
      });
      ammoWorker.postMessage({
        type: "addShapes",
        bodyUuid: i.toString(),
        shapesUuid: i.toString(),
        options: {
          type: "sphere",
          fit: "manual",
          sphereRadius: 0.25,
          matrixWorld: matrix.elements,
        },
      });
    }
  } else if (event.data.type === "bodyReady") {
    const uuid = event.data.uuid;
    uuids.push(uuid);
    indexes[uuid] = event.data.index;
  } else if (event.data.type === "transferData") {
    objectMatricesFloatArray = event.data
      .objectMatrices as Float32Array<ArrayBuffer>;
  }
};

let lastTick = 0;
const matrix = new Matrix4();
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
    direction = -1;
  } else if (x <= -1.5) {
    direction = 1;
  }

  if (objectMatricesFloatArray.buffer.byteLength !== 0) {
    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i];
      if (uuid === "floor") {
        objectMatricesFloatArray.set(
          floorMesh.matrixWorld.elements,
          indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE,
        );
      } else {
        matrix.fromArray(
          objectMatricesFloatArray,
          indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE,
        );
        matrix.decompose(pos, quat, scale);
        if (pos.y < -2) {
          matrix.setPosition(
            Math.random() * 10 - 5,
            Math.random() * 4 + 1,
            Math.random() * 10 - 5,
          );
          objectMatricesFloatArray.set(
            matrix.elements,
            indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE,
          );
          workerHelpers.resetDynamicBody(uuid);
        }
        ballMesh.setMatrixAt(indexes[uuid], matrix);
        // print velocities
        // console.log(
        //   uuid,
        //   objectMatricesFloatArray[indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE + 16],
        //   objectMatricesFloatArray[indexes[uuid] * BUFFER_CONFIG.BODY_DATA_SIZE + 17]
        // );
      }
      ballMesh.instanceMatrix.needsUpdate = true;
    }
    ammoWorker.postMessage(
      {
        type: "transferData",
        objectMatrices: objectMatricesFloatArray,
      },
      [objectMatricesFloatArray.buffer],
    );
  }

  /* DEBUG RENDERING */
  //   const index = Atomics.load(debugIndex, 0);
  //   if (index !== 0) {
  //     debugGeometry.attributes.position.needsUpdate = true;
  //     debugGeometry.attributes.color.needsUpdate = true;
  //   }
  //   debugGeometry.setDrawRange(0, index);
  //   Atomics.store(debugIndex, 0, 0);

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
