import type { AmmoMessage } from "./src/workers/ammo.worker";

export interface AmmoWorker extends Omit<Worker, "postMessage"> {
  postMessage: (msg: AmmoMessage, transfer?: Transferable[]) => void;
}

import { iterateGeometries } from "@hubs/three-to-ammo";
import type { ShapeOptions } from "@hubs/three-to-ammo";
import { Matrix4, Mesh } from "three";
import type { ConstraintOptions } from "./src/constraint";
import type { BodyConfig } from "./src/body";
import AmmoInit from "@hubs/ammo.js";
await AmmoInit();

export const DefaultBufferSize = 3 * 1000000;

export const WorkerHelpers = function (ammoWorker: AmmoWorker) {
  const transform = new Matrix4();
  const inverse = new Matrix4();

  const addBody = function (uuid: string, mesh: Mesh, options = {}) {
    if (!mesh.parent) return; // HACK ???
    inverse.copy(mesh.parent.matrixWorld).invert();
    transform.multiplyMatrices(inverse, mesh.matrixWorld);
    ammoWorker.postMessage({
      type: "addBody",
      uuid,
      matrix: transform.elements,
      options,
    });
  };

  const removeBody = function (uuid: string) {
    ammoWorker.postMessage({
      type: "removeBody",
      uuid,
    });
  };

  const prepareGeometry = (mesh: Mesh, includeInvisible?: boolean) => {
    if (!mesh.parent) {
      console.warn(`Failed to prepare Geometry! Mesh ${mesh} has no parent!`);
      return { vertices: [], matrices: [], indexes: [] };
    }
    inverse.copy(mesh.parent.matrix).invert();
    transform.multiplyMatrices(inverse, mesh.parent.matrix);
    const vertices: number[][] = [];
    const matrices: number[][] = [];
    const indexes: number[][] = [];

    mesh.updateMatrixWorld(true);
    iterateGeometries({
      root: mesh,
      includeInvisible: includeInvisible,
      cb: (vertexArray, matrix, index) => {
        vertices.push(vertexArray);
        matrices.push(matrix);
        indexes.push(index);
      },
    });
    return { vertices: vertices, matrices: matrices, indexes: indexes };
  };

  const addShapes = (
    bodyUuid: string,
    shapesUuid: string,
    options: ShapeOptions,
  ) => {
    ammoWorker.postMessage({
      type: "addShapes",
      bodyUuid,
      shapesUuid,
      options: options,
    });
  };

  const removeShapes = function (bodyUuid: string, shapesUuid: string) {
    ammoWorker.postMessage({
      type: "removeShapes",
      bodyUuid,
      shapesUuid,
    });
  };

  const addConstraint = function (
    constraintId: string,
    bodyUuid: string,
    targetUuid: string,
    options?: ConstraintOptions | undefined,
  ) {
    ammoWorker.postMessage({
      type: "addConstraint",
      constraintId,
      bodyUuid,
      targetUuid,
      options,
    });
  };

  const removeConstraint = function (constraintId: string) {
    ammoWorker.postMessage({
      type: "removeConstraint",
      constraintId,
    });
  };

  const updateBody = function (uuid: string, options: Partial<BodyConfig>) {
    ammoWorker.postMessage({
      type: "updateBody",
      uuid,
      options,
    });
  };

  const enableDebug = function (
    enable: boolean,
    debugSharedArrayBuffer: SharedArrayBuffer,
  ) {
    ammoWorker.postMessage({
      type: "enableDebug",
      enable,
      debugSharedArrayBuffer,
    });
  };

  const resetDynamicBody = function (uuid: string) {
    ammoWorker.postMessage({
      type: "resetDynamicBody",
      uuid,
    });
  };

  const activateBody = function (uuid: string) {
    ammoWorker.postMessage({
      type: "activateBody",
      uuid,
    });
  };

  return {
    addBody,
    updateBody,
    removeBody,
    prepareGeometry,
    addShapes,
    removeShapes,
    addConstraint,
    removeConstraint,
    enableDebug,
    resetDynamicBody,
    activateBody,
  };
};
