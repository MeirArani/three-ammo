import { Matrix4, type Matrix4Tuple } from "three";
import World, { type WorldOptions } from "../world";
import Body, { type BodyConfig } from "../body.js";
import Constraint, { type ConstraintOptions } from "../constraint";
//import { DefaultBufferSize } from "@hubs/ammo-debug-drawer";

// import * as AmmoLib from "@hubs/ammo.js";
//import AmmoWasm from "./ammo.wasm.wasm?init";

import { createCollisionShapes, type ShapeOptions } from "@hubs/three-to-ammo";

export const SIMULATION_RATE = 8.333; // 8.333ms / 120h

import { DefaultBufferSize } from "../../index";

export const BUFFER_CONFIG = {
  HEADER_LENGTH: 2,
  MAX_BODIES: 10000,
  MATRIX_OFFSET: 0,
  LINEAR_VELOCITY_OFFSET: 16,
  ANGULAR_VELOCITY_OFFSET: 17,
  COLLISIONS_OFFSET: 18,
  BODY_DATA_SIZE: 26,
};
export enum BUFFER_STATE {
  UNINITIALIZED = 0,
  READY = 1,
  CONSUMED = 2,
}

declare function postMessage(
  message: AmmoMessage,
  transfer?: Transferable[],
): void;

type UuidData = {
  body: Body;
  matrix: Matrix4;
  index: number;
};

interface InitMessage {
  type: "init";
  buffer: SharedArrayBuffer | ArrayBuffer;
  worldConfig?: WorldOptions;
  maxBodies?: number;
  simulationRate?: number;
}

interface AddBodyMessage {
  type: "addBody";
  uuid: string;
  matrix: Matrix4Tuple;
  options: Partial<BodyConfig>;
}

interface UpdateBodyMessage {
  type: "updateBody";
  uuid: string;
  options: Partial<BodyConfig>;
}

interface RemoveBodyMessage {
  type: "removeBody";
  uuid: string;
}

interface AddShapesMessage {
  type: "addShapes";
  bodyUuid: string;
  shapesUuid: string;
  options: ShapeOptions;
}

interface RemoveShapesMessage {
  type: "removeShapes";
  bodyUuid: string;
  shapesUuid: string;
}

interface AddConstraintMessage {
  type: "addConstraint";
  constraintId: string;
  bodyUuid: string;
  targetUuid: string;
  options?: ConstraintOptions;
}

interface RemoveConstraintMessage {
  type: "removeConstraint";
  constraintId: string;
}

interface EnableDebugMessage {
  type: "enableDebug";
  enable: boolean;
  debugSharedArrayBuffer: SharedArrayBuffer;
}

interface ResetDynamicBodyMessage {
  type: "resetDynamicBody";
  uuid: string;
}

interface ActivateBodyMessage {
  type: "activateBody";
  uuid: string;
}

interface BodyReadyMessage {
  type: "bodyReady";
  uuid: string;
  index: number;
}

interface ReadyMessage {
  type: "ready";
}

interface TransferDataMessage {
  type: "transferData";
  simulationRate?: number;
  objectMatrices: Float32Array;
  stepDuration?: number;
}

export type AmmoMessage =
  | InitMessage
  | AddBodyMessage
  | UpdateBodyMessage
  | RemoveBodyMessage
  | AddShapesMessage
  | RemoveShapesMessage
  | AddConstraintMessage
  | RemoveConstraintMessage
  | EnableDebugMessage
  | ResetDynamicBodyMessage
  | ActivateBodyMessage
  | BodyReadyMessage
  | ReadyMessage
  | TransferDataMessage;

export interface AmmoEvent extends MessageEvent {
  data: AmmoMessage & { source?: string };
}

const uuidMap: Map<string, UuidData> = new Map();
const shapes: Record<string, Ammo.btCollisionShape[]> = {};
const constraints: Record<string, Constraint> = {};
const ptrToIndex: Record<number, number> = {};

const messageQueue: AmmoMessage[] = [];

let simulationRate: number;

let stepDuration = 0;

let freeIndex = 0;

let freeIndexArray: Int32Array;

let world: World,
  headerIntArray: Int32Array,
  headerFloatArray: Float32Array,
  objectMatricesFloatArray: Float32Array,
  objectMatricesIntArray,
  lastTick: number,
  getPointer: typeof Ammo.getPointer;
let usingSharedArrayBuffer = false;

function isBufferConsumed() {
  if (usingSharedArrayBuffer) {
    return (
      headerIntArray && Atomics.load(headerIntArray, 0) !== BUFFER_STATE.READY
    );
  } else {
    return (
      objectMatricesFloatArray &&
      objectMatricesFloatArray.buffer.byteLength !== 0
    );
  }
}

function releaseBuffer() {
  if (usingSharedArrayBuffer) {
    headerFloatArray[1] = stepDuration;
    Atomics.store(headerIntArray, 0, BUFFER_STATE.READY);
  } else {
    postMessage(
      {
        type: "transferData",
        objectMatrices: objectMatricesFloatArray,
        stepDuration: stepDuration,
      },
      [objectMatricesFloatArray.buffer],
    );
  }
}

function tick() {
  setTimeout(tick, simulationRate);

  if (!isBufferConsumed()) return;

  const now = performance.now();
  const dt = now - lastTick;
  world.step(dt / 1000);
  stepDuration = performance.now() - now;
  lastTick = now;

  while (messageQueue.length > 0) {
    const message = messageQueue.shift()!;
    switch (message.type) {
      case "addBody":
        addBody(message);
        break;
      case "updateBody":
        updateBody(message);
        break;
      case "removeBody":
        removeBody(message);
        break;
      case "addShapes":
        addShapes(message);
        break;
      case "removeShapes":
        const bodyUuid = message.bodyUuid;
        const shapesUuid = message.shapesUuid;
        if (
          !uuidMap.has(bodyUuid) ||
          !uuidMap.has(shapesUuid) ||
          !shapes[shapesUuid]
        )
          break;

        const toRemove = shapes[shapesUuid];
        const body = uuidMap.get(bodyUuid)!.body;

        if (Array.isArray(toRemove)) {
          toRemove.forEach((shape) => body.removeShape(shape));
          break;
        }
        body.removeShape(toRemove);
        break;
      case "addConstraint":
        addConstraint(message);
        break;
      case "removeConstraint":
        const constraintId = message.constraintId;
        if (constraints[constraintId]) {
          constraints[constraintId].destroy();
          delete constraints[constraintId];
        }
        break;
      case "enableDebug":
        const enable = message.enable;
        if (!world.debugDrawer) {
          initDebug(message.debugSharedArrayBuffer, world);
        }

        if (world.debugDrawer) {
          if (enable) {
            world.debugDrawer.enable();
          } else {
            world.debugDrawer.disable();
          }
        }
        break;
      case "resetDynamicBody":
        resetDynamicBody(message);
        break;
      case "activateBody":
        activateBody(message);
        break;
      default:
        console.error("Unknown message in queue", message);
        break;
    }
  }

  /** Buffer Schema
   * Every physics body has 26 * 4 bytes (64bit float/int) assigned in the buffer
   * 0-15:  Matrix4 elements (floats)
   * 16:    Linear Velocity (float)
   * 17:    Angular Velocity (float)
   * 18-25: first 8 Collisions (ints)
   */

  for (const { body, matrix, index } of uuidMap.values()) {
    matrix.fromArray(
      objectMatricesFloatArray,
      index * BUFFER_CONFIG.BODY_DATA_SIZE + BUFFER_CONFIG.MATRIX_OFFSET,
    );
    body.updateShapes();

    if (body.type === "dynamic") {
      body.syncFromPhysics();
    } else {
      body.syncToPhysics(false);
    }

    objectMatricesFloatArray.set(
      matrix.elements,
      index * BUFFER_CONFIG.BODY_DATA_SIZE + BUFFER_CONFIG.MATRIX_OFFSET,
    );
    if (body.physicsBody) {
      objectMatricesFloatArray[
        index * BUFFER_CONFIG.BODY_DATA_SIZE +
          BUFFER_CONFIG.LINEAR_VELOCITY_OFFSET
      ] = body.physicsBody?.getLinearVelocity().length();
      objectMatricesFloatArray[
        index * BUFFER_CONFIG.BODY_DATA_SIZE +
          BUFFER_CONFIG.ANGULAR_VELOCITY_OFFSET
      ] = body.physicsBody.getAngularVelocity().length();
    }

    const ptr = getPointer(body.physicsBody);
    const collisions = world.collisions.get(ptr);
    for (
      let j = 0;
      j < BUFFER_CONFIG.BODY_DATA_SIZE - BUFFER_CONFIG.COLLISIONS_OFFSET;
      j++
    ) {
      if (!collisions || j >= collisions.length) {
        objectMatricesIntArray[
          index * BUFFER_CONFIG.BODY_DATA_SIZE +
            BUFFER_CONFIG.COLLISIONS_OFFSET +
            j
        ] = -1;
      } else {
        const collidingPtr = collisions[j];
        if (collidingPtr && ptrToIndex[collidingPtr]) {
          objectMatricesIntArray[
            index * BUFFER_CONFIG.BODY_DATA_SIZE +
              BUFFER_CONFIG.COLLISIONS_OFFSET +
              j
          ] = ptrToIndex[collidingPtr];
        }
      }
    }
  }

  releaseBuffer();
}
const initSharedArrayBuffer = (
  sharedArrayBuffer: SharedArrayBuffer,
  maxBodies: number,
) => {
  /** BUFFER HEADER
   * When using SAB, the first 4 bytes (1 int) are reserved for signaling BUFFER_STATE
   * This is used to determine which thread is currently allowed to modify the SAB.
   * The second 4 bytes (1 float) is used for storing stepDuration for stats.
   */
  usingSharedArrayBuffer = true;
  headerIntArray = new Int32Array(
    sharedArrayBuffer,
    0,
    BUFFER_CONFIG.HEADER_LENGTH,
  );
  headerFloatArray = new Float32Array(
    sharedArrayBuffer,
    0,
    BUFFER_CONFIG.HEADER_LENGTH,
  );
  objectMatricesFloatArray = new Float32Array(
    sharedArrayBuffer,
    BUFFER_CONFIG.HEADER_LENGTH * 4,
    BUFFER_CONFIG.BODY_DATA_SIZE * maxBodies,
  );
  objectMatricesIntArray = new Int32Array(
    sharedArrayBuffer,
    BUFFER_CONFIG.HEADER_LENGTH * 4,
    BUFFER_CONFIG.BODY_DATA_SIZE * maxBodies,
  );
};

const initTransferrables = (arrayBuffer: ArrayBuffer) => {
  objectMatricesFloatArray = new Float32Array(arrayBuffer);
  objectMatricesIntArray = new Int32Array(arrayBuffer);
};

function initDebug(debugSharedArrayBuffer: SharedArrayBuffer, world: World) {
  const debugIndexArray = new Uint32Array(debugSharedArrayBuffer, 0, 1);
  const debugVerticesArray = new Float32Array(
    debugSharedArrayBuffer,
    4,
    DefaultBufferSize,
  );
  const debugColorsArray = new Float32Array(
    debugSharedArrayBuffer,
    4 + DefaultBufferSize,
    DefaultBufferSize,
  );

  // TODO: reimplement Debug Drawer
  world.getDebugDrawer(debugIndexArray, debugVerticesArray, debugColorsArray);
}

function addBody({ uuid, matrix, options }: AddBodyMessage) {
  if (freeIndex === -1) return;

  const nextFreeIndex = freeIndexArray[freeIndex]!; // HACK, but we're dealing with C++ logic...
  freeIndexArray[freeIndex] = -1;

  const transform = new Matrix4();
  transform.fromArray(matrix);

  objectMatricesFloatArray.set(
    transform.elements,
    freeIndex * BUFFER_CONFIG.BODY_DATA_SIZE,
  );
  const newBody = new Body(options, transform, world);
  const ptr = getPointer(newBody.physicsBody);
  ptrToIndex[ptr] = freeIndex;

  uuidMap.set(uuid, { body: newBody, index: freeIndex, matrix: transform });

  postMessage({ type: "bodyReady", uuid, index: freeIndex });
  freeIndex = nextFreeIndex;
}

function updateBody({ uuid, options }: UpdateBodyMessage) {
  uuidMap.get(uuid)?.body.update(options);
  uuidMap.get(uuid)?.body.physicsBody?.activate(true);
}

function removeBody({ uuid }: RemoveBodyMessage) {
  if (!uuidMap.has(uuid)) return;
  delete ptrToIndex[getPointer(uuidMap.get(uuid)?.body.physicsBody)];
  uuidMap.get(uuid)?.body.destroy();
  const index = uuidMap.get(uuid)!.index;
  freeIndexArray[index] = freeIndex;
  freeIndex = index;
  uuidMap.delete(uuid);
}

const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function addShapes({ bodyUuid, shapesUuid, options }: AddShapesMessage) {
  if (!uuidMap.has(bodyUuid)) return;

  const targetBody = uuidMap.get(bodyUuid)!.body;
  const physicsShapes = createCollisionShapes(options);
  physicsShapes.forEach((shape) => targetBody.addShape(shape));

  shapes[shapesUuid] = physicsShapes;
}

function addConstraint({
  constraintId,
  bodyUuid,
  targetUuid,
  options,
}: AddConstraintMessage) {
  if (!uuidMap.has(bodyUuid) || !uuidMap.has(targetUuid)) return;

  const constraint = new Constraint(
    options,
    uuidMap.get(bodyUuid)!.body,
    uuidMap.get(targetUuid)!.body,
    world,
  );
  constraints[constraintId] = constraint;
}

function resetDynamicBody({ uuid }: ResetDynamicBodyMessage) {
  if (!uuidMap.has(uuid)) return;
  const body = uuidMap.get(uuid)!.body;
  const index = uuidMap.get(uuid)!.index;
  uuidMap
    .get(uuid)!
    .matrix.fromArray(
      objectMatricesFloatArray,
      index * BUFFER_CONFIG.BODY_DATA_SIZE,
    );
  body.syncToPhysics(true);
  body.physicsBody?.getLinearVelocity().setValue(0, 0, 0);
  body.physicsBody?.getAngularVelocity().setValue(0, 0, 0);
}

function activateBody({ uuid }: ActivateBodyMessage) {
  uuidMap.get(uuid)?.body.physicsBody?.activate();
}

onmessage = async (event: AmmoEvent) => {
  if (event.data.source === "react-devtools-content-script") return;
  if (event.data.type === "init") {
    getPointer = Ammo.getPointer;

    const maxBodies = event.data.maxBodies
      ? event.data.maxBodies
      : BUFFER_CONFIG.MAX_BODIES;

    freeIndexArray = new Int32Array(maxBodies);
    for (let i = 0; i < maxBodies - 1; i++) {
      freeIndexArray[i] = i + 1;
    }
    freeIndexArray[maxBodies - 1] = -1;

    if (event.data.buffer instanceof SharedArrayBuffer) {
      initSharedArrayBuffer(event.data.buffer, maxBodies);
    } else {
      initTransferrables(event.data.buffer);
    }

    world = new World(event.data.worldConfig || {});
    lastTick = performance.now();
    simulationRate =
      event.data.simulationRate === undefined
        ? SIMULATION_RATE
        : event.data.simulationRate;
    self.setTimeout(tick, simulationRate);
    postMessage({ type: "ready" });
  } else if (event.data.type === "transferData") {
    if (event.data.simulationRate !== undefined) {
      simulationRate = event.data.simulationRate;
    }
    objectMatricesFloatArray = event.data.objectMatrices;
    objectMatricesIntArray = new Int32Array(objectMatricesFloatArray.buffer);
  } else {
    messageQueue.push(event.data);
  }
};
