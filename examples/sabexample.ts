import { AmmoDebugConstants, DefaultBufferSize } from "@hubs/ammo-debug-drawer";
import { WorkerHelpers } from "../index";
import type { AmmoWorker } from "../index";
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
  Object3D,
} from "three";
import type { BodyConfig } from "../src/body";
import { BUFFER_CONFIG, BUFFER_STATE } from "../src/workers/ammo.worker";
import type { AmmoEvent } from "../src/workers/ammo.worker";

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

const uuids: Record<
  string,
  {
    index?: number;
    bodyConfig: Partial<BodyConfig>;
    object3D: Object3D;
    shape: string;
  }
> = {};

const floorGeometry = new BoxGeometry(5, 0.1, 5);
const floorMaterial = new MeshBasicMaterial({ color: 0xff6600 });
const floorMesh = new Mesh(floorGeometry, floorMaterial);
floorMesh.position.set(0, -1, 0);
scene.add(floorMesh);

uuids["floor"] = {
  bodyConfig: { type: "kinematic" },
  shape: "floor-shape",
  object3D: floorMesh,
};

const boxGeometry = new BoxGeometry(0.5, 0.5, 0.5);
const boxMaterial = new MeshBasicMaterial({ color: 0x00ffff });
const boxMesh = new Mesh(boxGeometry, boxMaterial);
boxMesh.position.set(-1, 2, 0);
scene.add(boxMesh);

uuids["box"] = {
  bodyConfig: { type: "dynamic" },
  shape: "box-shape",
  object3D: boxMesh,
};

const ballGeometry = new SphereGeometry(0.5, 32, 32);
const ballMaterial = new MeshBasicMaterial({ color: 0x00ff00 });
const ballMesh = new Mesh(ballGeometry, ballMaterial);
ballMesh.position.set(0, 2, 0);
scene.add(ballMesh);
uuids["ball"] = {
  bodyConfig: { type: "dynamic" },
  shape: "ball-shape",
  object3D: ballMesh,
};

// const boxGeometry2 = new BoxGeometry(0.5, 0.5, 0.5);
// const boxMaterial2 = new MeshBasicMaterial({ color: 0x00ffff });
// const boxMesh2 = new Mesh(boxGeometry2, boxMaterial2);
// boxMesh2.position.set(1, 2, 0);
// scene.add(boxMesh2);
// object3Ds[boxMesh2.uuid] = boxMesh2;

// const boxGeometry3 = new BoxGeometry(0.5, 0.5, 0.5);
// const boxMaterial3 = new MeshBasicMaterial({ color: 0x00ffff });
// const boxMesh3 = new Mesh(boxGeometry3, boxMaterial3);
// boxMesh3.position.set(1, 3, 0);
// scene.add(boxMesh3);
// object3Ds[boxMesh3.uuid] = boxMesh3;

const ammoWorker = new Worker(
  new URL("../src/workers/ammo.worker.ts", import.meta.url),
  {
    type: "module",
  },
) as AmmoWorker;

const workerHelpers = WorkerHelpers(ammoWorker);

const sharedArrayBuffer = new SharedArrayBuffer(
  4 * BUFFER_CONFIG.HEADER_LENGTH + //header
    4 * BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES + //matrices
    4 * BUFFER_CONFIG.MAX_BODIES, //velocities
);
const headerIntArray = new Int32Array(
  sharedArrayBuffer,
  0,
  BUFFER_CONFIG.HEADER_LENGTH,
);
const objectMatricesIntArray = new Int32Array(
  sharedArrayBuffer,
  BUFFER_CONFIG.HEADER_LENGTH * 4,
  BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES,
);
const objectMatricesFloatArray = new Float32Array(
  sharedArrayBuffer,
  BUFFER_CONFIG.HEADER_LENGTH * 4,
  BUFFER_CONFIG.BODY_DATA_SIZE * BUFFER_CONFIG.MAX_BODIES,
);

objectMatricesIntArray[0] = BUFFER_STATE.UNINITIALIZED;

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
  depthTest: true,
});
const debugMesh = new LineSegments(debugGeometry, debugMaterial);
debugMesh.frustumCulled = false;
debugMesh.renderOrder = 999;
scene.add(debugMesh);

ammoWorker.postMessage({
  type: "init",
  worldConfig: { debugDrawMode: AmmoDebugConstants.DrawWireframe },
  buffer: sharedArrayBuffer,
});

ammoWorker.onmessage = async (event: AmmoEvent) => {
  if (event.data.type === "ready") {
    workerHelpers.enableDebug(true, debugSharedArrayBuffer);
    workerHelpers.addBody("box", boxMesh, uuids["box"].bodyConfig);
    const boxGeometryData = workerHelpers.prepareGeometry(boxMesh);
    workerHelpers.addShapes("box", "box-shape", {
      type: "box",
      fit: "all",
      vertices: boxGeometryData.vertices,
      matrices: boxGeometryData.matrices,
      matrixWorld: boxMesh.matrixWorld.elements,
    });

    workerHelpers.addBody("floor", floorMesh, uuids["floor"].bodyConfig);
    const floorGeometryData = workerHelpers.prepareGeometry(floorMesh);
    workerHelpers.addShapes("floor", "floor-shape", {
      type: "box",
      fit: "all",
      vertices: floorGeometryData.vertices,
      matrices: floorGeometryData.matrices,
      matrixWorld: floorMesh.matrixWorld.elements,
    });

    workerHelpers.addBody("ball", ballMesh, uuids["ball"].bodyConfig);
    const ballGeometryData = workerHelpers.prepareGeometry(ballMesh);
    workerHelpers.addShapes("ball", "ball-shape", {
      type: "sphere",
      fit: "all",
      vertices: ballGeometryData.vertices,
      matrices: ballGeometryData.matrices,
      matrixWorld: ballMesh.matrixWorld.elements,
    });

    //workerHelpers.addConstraint("constraint", "ball", "box");

    // bodyOptions[boxMesh2.uuid] = { type: TYPE.DYNAMIC, gravity: { x: 0, y: -1, z: 0 } };
    // workerHelpers.addBody(boxMesh2, bodyOptions[boxMesh2.uuid]);
    // workerHelpers.addShapes(boxMesh2.uuid, boxMesh2, { type: SHAPE.BOX });

    window.setTimeout(() => {
      const ballOptions = uuids["ball"].bodyConfig;
      ballOptions.gravity = { y: -9.8 };
      workerHelpers.updateBody("ball", ballOptions);

      const boxOptions = uuids["box"].bodyConfig;
      boxOptions.gravity = { y: -4.9 };
      workerHelpers.updateBody("box", boxOptions);

      window.setInterval(() => {
        if (ballOptions.type === "dynamic") {
          ballOptions.type = "kinematic";
          workerHelpers.updateBody("ball", ballOptions);
          ballMesh.position.set(0, 1, 0);
        } else {
          ballOptions.type = "dynamic";
          workerHelpers.updateBody("ball", ballOptions);
        }
      }, 3000);
    }, 1000);

    // window.setTimeout(() => {
    //   workerHelpers.removeBody(boxMesh2.uuid);
    //   uuids.splice(uuids.indexOf(boxMesh2.uuid), 1);
    //   delete shapes[boxMesh2.uuid];

    //   bodyOptions[boxMesh3.uuid] = { type: TYPE.DYNAMIC, gravity: { x: 0, y: -1, z: 0 } };
    //   workerHelpers.addBody(boxMesh3, bodyOptions[boxMesh3.uuid]);
    //   workerHelpers.addShapes(boxMesh3.uuid, boxMesh3, { type: SHAPE.BOX });
    // }, 5000);

    // window.setTimeout(() => {
    //   /* remove constraint example */
    //   workerHelpers.removeConstraint("constraint");

    //   /* remove body example */
    //   workerHelpers.removeBody(boxMesh.uuid);
    //   uuids.splice(uuids.indexOf(boxMesh.uuid), 1);
    //   delete shapes[boxMesh.uuid];

    //   /* remove shape example */
    //   workerHelpers.removeShapes(ballMesh.uuid, shapes[ballMesh.uuid]);
    //   shapes[ballMesh.uuid].length = 0;
    // }, 3000);
  } else if (event.data.type === "bodyReady") {
    console.log(event);
    const uuid = event.data.uuid;
    if (!uuids[uuid])
      return console.warn(
        "bodyReady tried to update a UUID not recorded in worker's UUID index!",
      );
    uuids[uuid].index = event.data.index;
  }
};

const transform = new Matrix4();
const inverse = new Matrix4();
const matrix = new Matrix4();
const scale = new Vector3();

const tick = function () {
  requestAnimationFrame(tick);

  floorMesh.rotation.y += 0.01;

  if (Atomics.load(headerIntArray, 0) === BUFFER_STATE.READY) {
    Object.values(uuids).forEach(({ index, object3D, bodyConfig }) => {
      if (index === undefined || !object3D.parent)
        return console.warn("NO PARENT FOUND!", index, object3D.parent);
      if (bodyConfig.type === "dynamic") {
        matrix.fromArray(
          objectMatricesFloatArray,
          index * BUFFER_CONFIG.BODY_DATA_SIZE,
        );
        inverse.copy(object3D.parent.matrixWorld).invert();
        transform.multiplyMatrices(inverse, matrix);
        transform.decompose(object3D.position, object3D.quaternion, scale);
      } else {
        objectMatricesFloatArray.set(
          object3D.matrixWorld.elements,
          index * BUFFER_CONFIG.BODY_DATA_SIZE,
        );
      }

      // // print velocities
      // console.log(
      //   index,
      //   objectMatricesFloatArray[index * BUFFER_CONFIG.BODY_DATA_SIZE + 16],
      //   objectMatricesFloatArray[index * BUFFER_CONFIG.BODY_DATA_SIZE + 17],
      // );

      // // print coliisions
      // const collisions = [];
      // for (let j = 18; j < 26; j++) {
      //   const collidingIndex =
      //     objectMatricesIntArray[index * BUFFER_CONFIG.BODY_DATA_SIZE + j];
      //   if (collidingIndex !== -1) {
      //     collisions.push(index);
      //   }
      // }
      // console.log(index, collisions);
    });
    Atomics.store(headerIntArray, 0, BUFFER_STATE.CONSUMED);
  }

  /* DEBUG RENDERING */
  const index = Atomics.load(debugIndex, 0);
  if (index !== 0) {
    debugGeometry.attributes.position.needsUpdate = true;
    debugGeometry.attributes.color.needsUpdate = true;
  }
  debugGeometry.setDrawRange(0, index);
  Atomics.store(debugIndex, 0, 0);
  renderer.render(scene, camera);
};

requestAnimationFrame(tick);

window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
