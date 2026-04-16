import { Matrix4, Matrix4Tuple, Mesh, Vector3 } from "three";
import { ShapeOptions } from "@hubs/three-to-ammo";

//#region src/world.d.ts
interface WorldOptions {
  epsilon?: number;
  debugDrawMode?: number;
  maxSubSteps?: number;
  fixedTimeStep?: number;
  gravityConf?: Ammo.btVector3;
  solverIterations?: number;
}
//#endregion
//#region src/body.d.ts
declare enum ActivationState {
  Active = 1,
  IslandSleeping = 2,
  WantsDeactivation = 3,
  DisableDeactivation = 4,
  DisableSimulation = 5
}
type BodyType = "static" | "dynamic" | "kinematic";
interface BodyConfig {
  loadedEvent: string;
  mass: number;
  gravity: {
    x?: number;
    y?: number;
    z?: number;
  };
  linearDamping: number;
  angularDamping: number;
  linearSleepingThreshold: number;
  angularSleepingThreshold: number;
  angularFactor: Vector3;
  activationState: ActivationState;
  type: BodyType;
  emitCollisionEvents: boolean;
  disableCollision: boolean;
  collisionFilterGroup: number;
  collisionFilterMask: number;
  scaleAutoUpdate: boolean;
}
//#endregion
//#region src/constraint.d.ts
interface LockConstraintConfig {
  type: "lock";
}
interface FixedConstraintConfig {
  type: "fixed";
}
interface SpringConstraintConfig {
  type: "spring";
}
interface SliderConstraintConfig {
  type: "slider";
}
interface ConstraintConfigPivots {
  pivot: Vector3;
  targetPivot: Vector3;
}
interface HingeConstraintConfig extends ConstraintConfigPivots {
  type: "hinge";
  axis: Vector3;
  targetAxis: Vector3;
}
interface ConeTwistConstraintConfig extends ConstraintConfigPivots {
  type: "coneTwist";
}
interface PointToPointConstraintConfig extends ConstraintConfigPivots {
  type: "pointToPoint";
}
type ConstraintOptions = LockConstraintConfig | FixedConstraintConfig | SpringConstraintConfig | SliderConstraintConfig | HingeConstraintConfig | ConeTwistConstraintConfig | PointToPointConstraintConfig;
//#endregion
//#region src/workers/ammo.worker.d.ts
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
  vertices: number[][];
  matrices: number[][];
  indexes: number[][];
  matrixWorld: number[];
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
  stepDuration: number;
}
type AmmoMessage = InitMessage | AddBodyMessage | UpdateBodyMessage | RemoveBodyMessage | AddShapesMessage | RemoveShapesMessage | AddConstraintMessage | RemoveConstraintMessage | EnableDebugMessage | ResetDynamicBodyMessage | ActivateBodyMessage | BodyReadyMessage | ReadyMessage | TransferDataMessage;
//#endregion
//#region index.d.ts
interface AmmoWorker extends Omit<Worker, "postMessage"> {
  postMessage: (msg: AmmoMessage) => void;
}
declare const DefaultBufferSize: number;
declare const WorkerHelpers: (ammoWorker: AmmoWorker) => {
  addBody: (uuid: string, mesh: Mesh, options?: {}) => void;
  updateBody: (uuid: string, options: Partial<BodyConfig>) => void;
  removeBody: (uuid: string) => void;
  addShapes: (bodyUuid: string, shapesUuid: string, mesh: Mesh, options: ShapeOptions & {
    includeInvisible?: boolean;
  }) => void;
  removeShapes: (bodyUuid: string, shapesUuid: string) => void;
  addConstraint: (constraintId: string, bodyUuid: string, targetUuid: string, options?: ConstraintOptions | undefined) => void;
  removeConstraint: (constraintId: string) => void;
  enableDebug: (enable: boolean, debugSharedArrayBuffer: SharedArrayBuffer) => void;
  resetDynamicBody: (uuid: string) => void;
  activateBody: (uuid: string) => void;
};
//#endregion
export { AmmoWorker, DefaultBufferSize, WorkerHelpers };
//# sourceMappingURL=index.d.mts.map