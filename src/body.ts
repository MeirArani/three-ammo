import { Matrix4, Quaternion, Vector3 } from "three";
import World from "./world";

import { type ShapeType } from "@hubs/three-to-ammo";

export enum ActivationState {
  Active = 1,
  IslandSleeping = 2,
  WantsDeactivation = 3,
  DisableDeactivation = 4,
  DisableSimulation = 5,
}

export enum CollisionFlag {
  StaticObject = 1,
  KinematicObject = 2,
  NoContactResponse = 4,
  CustomMaterialCallback = 8, //this allows per-triangle material (friction/restitution)
  CharacterObject = 16,
  DisableVisualizeObject = 32, //disable debug drawing
  DisableSPUCollisionProcessing = 64, //disable parallel/SPU processing
}

const RIGID_BODY_FLAGS = {
  NONE: 0,
  DISABLE_WORLD_GRAVITY: 1,
};

export type BodyType = "static" | "dynamic" | "kinematic";

function almostEqualsVector3(epsilon: number, u: Vector3, v: Vector3) {
  return (
    Math.abs(u.x - v.x) < epsilon &&
    Math.abs(u.y - v.y) < epsilon &&
    Math.abs(u.z - v.z) < epsilon
  );
}

function almostEqualsBtVector3(
  epsilon: number,
  u: Ammo.btVector3,
  v: Ammo.btVector3,
) {
  return (
    Math.abs(u.x() - v.x()) < epsilon &&
    Math.abs(u.y() - v.y()) < epsilon &&
    Math.abs(u.z() - v.z()) < epsilon
  );
}

function almostEqualsQuaternion(epsilon: number, u: Quaternion, v: Quaternion) {
  return (
    (Math.abs(u.x - v.x) < epsilon &&
      Math.abs(u.y - v.y) < epsilon &&
      Math.abs(u.z - v.z) < epsilon &&
      Math.abs(u.w - v.w) < epsilon) ||
    (Math.abs(u.x + v.x) < epsilon &&
      Math.abs(u.y + v.y) < epsilon &&
      Math.abs(u.z + v.z) < epsilon &&
      Math.abs(u.w + v.w) < epsilon)
  );
}

export interface BodyConfig {
  loadedEvent: string;
  mass: number;
  gravity: { x?: number; y?: number; z?: number };
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

/**
 * Initializes a body component, assigning it to the physics system and binding listeners for
 * parsing the elements geometry.
 */
export default class Body {
  loadedEvent: string;
  mass: number;
  gravity: Ammo.btVector3;
  linearDamping: number;
  angularDamping: number;
  linearSleepingThreshold: number;
  angularSleepingThreshold: number;
  angularFactor = new Vector3(1, 1, 1);
  activationState: ActivationState;
  type: BodyType;
  emitCollisionEvents: boolean;
  disableCollision: boolean;
  collisionFilterGroup: number;
  collisionFilterMask: number;
  scaleAutoUpdate: boolean;
  matrix: Matrix4;
  world: World;
  shapes: Ammo.btCollisionShape[] = [];
  localScaling = new Ammo.btVector3();
  prevScale = new Vector3(1, 1, 1);
  prevNumChildShapes = 0;
  msTransform = new Ammo.btTransform();
  rotation: Ammo.btQuaternion;
  motionState: Ammo.btDefaultMotionState;
  localInertia = new Ammo.btVector3(0, 0, 0);
  compoundShape = new Ammo.btCompoundShape(true);
  rbInfo: Ammo.btRigidBodyConstructionInfo;
  physicsBody: Ammo.btRigidBody | undefined;
  shapesChanged = false;
  polyHedralFeaturesInitialized = false;
  triMesh: Ammo.btTriangleMesh | undefined;

  constructor(bodyConfig: Partial<BodyConfig>, matrix: Matrix4, world: World) {
    this.loadedEvent = bodyConfig.loadedEvent || "";
    this.mass = bodyConfig.mass || 1;
    const worldGravity = world.physicsWorld.getGravity();

    this.msTransform.setIdentity();
    this.motionState = new Ammo.btDefaultMotionState(this.msTransform);
    this.gravity = new Ammo.btVector3(
      bodyConfig.gravity?.x || worldGravity.x(),
      bodyConfig.gravity?.y || worldGravity.y(),
      bodyConfig.gravity?.z || worldGravity.z(),
    );
    this.linearDamping = bodyConfig.linearDamping || 0.01;
    this.angularDamping = bodyConfig.angularDamping || 0.01;
    this.linearSleepingThreshold = bodyConfig.linearSleepingThreshold || 1.6;
    this.angularSleepingThreshold = bodyConfig.angularSleepingThreshold || 2.5;
    if (bodyConfig.angularFactor) {
      this.angularFactor.copy(bodyConfig.angularFactor);
    }
    this.activationState = bodyConfig.activationState || ActivationState.Active;
    this.type = bodyConfig.type || "dynamic";
    this.emitCollisionEvents = bodyConfig.emitCollisionEvents || false;
    this.disableCollision = bodyConfig.disableCollision || false;
    this.collisionFilterGroup = bodyConfig.collisionFilterGroup || 1; //32-bit mask
    this.collisionFilterMask = bodyConfig.collisionFilterMask || 1; //32-bit mask
    this.scaleAutoUpdate = bodyConfig.scaleAutoUpdate || true;

    this.matrix = matrix;
    this.world = world;

    /**
     * Parses an element's geometry and component metadata to create an Ammo body instance for the component.
     */

    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();

    this.matrix.decompose(pos, quat, scale);

    this.localScaling.setValue(scale.x, scale.y, scale.z);
    this.msTransform.setIdentity();
    this.rotation = new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w);

    this.msTransform.getOrigin().setValue(pos.x, pos.y, pos.z);
    this.msTransform.setRotation(this.rotation);

    this.compoundShape.setLocalScaling(this.localScaling);

    this.rbInfo = new Ammo.btRigidBodyConstructionInfo(
      this.mass,
      this.motionState,
      this.compoundShape,
      this.localInertia,
    );
    this.physicsBody = new Ammo.btRigidBody(this.rbInfo);
    this.physicsBody.setActivationState(this.activationState);
    this.physicsBody.setSleepingThresholds(
      this.linearSleepingThreshold,
      this.angularSleepingThreshold,
    );

    this.physicsBody.setDamping(this.linearDamping, this.angularDamping);

    const angularFactor = new Ammo.btVector3(
      this.angularFactor.x,
      this.angularFactor.y,
      this.angularFactor.z,
    );
    this.physicsBody.setAngularFactor(angularFactor);
    Ammo.destroy(angularFactor);

    if (
      !almostEqualsBtVector3(
        0.001,
        this.gravity,
        this.world.physicsWorld.getGravity(),
      )
    ) {
      this.physicsBody.setGravity(this.gravity);
      this.physicsBody.setFlags(RIGID_BODY_FLAGS.DISABLE_WORLD_GRAVITY);
    }

    this.updateCollisionFlags();

    this.world.addBody(
      this.physicsBody,
      this.matrix,
      this.collisionFilterGroup,
      this.collisionFilterMask,
    );

    // TODO Is this dead code?
    // if (this.emitCollisionEvents) {
    //   this.world.addEventListener(this.physicsBody);
    // }
  }

  /**
   * Updates the body when shapes have changed. Should be called whenever shapes are added/removed or scale is changed.
   */
  updateShapes() {
    const needsPolyhedralInitialization: ShapeType[] = [
      "hull",
      "hacd",
      "vhacd",
    ];
    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();
    let updated = false;
    this.matrix.decompose(pos, quat, scale);
    if (
      this.scaleAutoUpdate &&
      this.prevScale &&
      !almostEqualsVector3(0.001, scale, this.prevScale)
    ) {
      this.prevScale.copy(scale);
      updated = true;

      this.localScaling.setValue(
        this.prevScale.x,
        this.prevScale.y,
        this.prevScale.z,
      );
      this.compoundShape.setLocalScaling(this.localScaling);
    }

    if (this.shapesChanged) {
      this.shapesChanged = false;
      updated = true;
      if (this.type === "dynamic") {
        this.updateMass();
      }

      if (this.physicsBody) this.world.updateBody(this.physicsBody);
    }

    //call initializePolyhedralFeatures for hull shapes if debug is turned on and/or scale changes
    if (
      this.world.isDebugEnabled() &&
      (updated || !this.polyHedralFeaturesInitialized)
    ) {
      this.shapes
        .filter((shape) => needsPolyhedralInitialization.includes(shape.type))
        .forEach((needsPolyInit) => {
          (
            needsPolyInit as Ammo.btConvexHullShape
          ).initializePolyhedralFeatures(0);
        });
    }
    this.polyHedralFeaturesInitialized = true;
  }

  /**
   * Update the configuration of the body.
   */
  update(bodyConfig: Partial<BodyConfig>) {
    if (!this.physicsBody) return;
    if (
      (bodyConfig.type && bodyConfig.type !== this.type) ||
      (bodyConfig.disableCollision &&
        bodyConfig.disableCollision !== this.disableCollision)
    ) {
      if (bodyConfig.type) this.type = bodyConfig.type;
      if (bodyConfig.disableCollision)
        this.disableCollision = bodyConfig.disableCollision;
      this.updateCollisionFlags();
    }

    if (
      bodyConfig.activationState &&
      bodyConfig.activationState !== this.activationState
    ) {
      this.activationState = bodyConfig.activationState;
      this.physicsBody.forceActivationState(this.activationState + 1); // BUG ???
      if (this.activationState === ActivationState.Active) {
        this.physicsBody.activate(true);
      }
    }

    if (
      (bodyConfig.collisionFilterGroup &&
        bodyConfig.collisionFilterGroup !== this.collisionFilterGroup) ||
      (bodyConfig.collisionFilterMask &&
        bodyConfig.collisionFilterMask !== this.collisionFilterMask)
    ) {
      if (bodyConfig.collisionFilterGroup)
        this.collisionFilterGroup = bodyConfig.collisionFilterGroup;
      if (bodyConfig.collisionFilterMask)
        this.collisionFilterMask = bodyConfig.collisionFilterMask;
      const broadphaseProxy = this.physicsBody.getBroadphaseProxy();
      broadphaseProxy.set_m_collisionFilterGroup(this.collisionFilterGroup);
      broadphaseProxy.set_m_collisionFilterMask(this.collisionFilterMask);
      this.world.broadphase
        .getOverlappingPairCache()
        .removeOverlappingPairsContainingProxy(
          broadphaseProxy,
          this.world.dispatcher,
        ); // HACK: Technically hidden in C++ inheritence??
    }

    if (
      (bodyConfig.linearDamping &&
        bodyConfig.linearDamping != this.linearDamping) ||
      (bodyConfig.angularDamping &&
        bodyConfig.angularDamping != this.angularDamping)
    ) {
      if (bodyConfig.linearDamping)
        this.linearDamping = bodyConfig.linearDamping;
      if (bodyConfig.angularDamping)
        this.angularDamping = bodyConfig.angularDamping;
      this.physicsBody.setDamping(this.linearDamping, this.angularDamping);
    }

    if (bodyConfig.gravity) {
      this.gravity.setValue(
        bodyConfig.gravity.x || this.gravity.x(),
        bodyConfig.gravity.y || this.gravity.y(),
        bodyConfig.gravity.z || this.gravity.z(),
      );
      if (
        !almostEqualsBtVector3(
          0.001,
          this.gravity,
          this.physicsBody.getGravity(),
        )
      ) {
        if (
          !almostEqualsBtVector3(
            0.001,
            this.gravity,
            this.world.physicsWorld.getGravity(),
          )
        ) {
          this.physicsBody.setFlags(RIGID_BODY_FLAGS.DISABLE_WORLD_GRAVITY);
        } else {
          this.physicsBody.setFlags(RIGID_BODY_FLAGS.NONE);
        }
        this.physicsBody.setGravity(this.gravity);
      }
    }

    if (
      (bodyConfig.linearSleepingThreshold &&
        bodyConfig.linearSleepingThreshold != this.linearSleepingThreshold) ||
      (bodyConfig.angularSleepingThreshold &&
        bodyConfig.angularSleepingThreshold != this.angularSleepingThreshold)
    ) {
      if (bodyConfig.linearSleepingThreshold)
        this.linearSleepingThreshold = bodyConfig.linearSleepingThreshold;
      if (bodyConfig.angularSleepingThreshold)
        this.angularSleepingThreshold = bodyConfig.angularSleepingThreshold;
      this.physicsBody.setSleepingThresholds(
        this.linearSleepingThreshold,
        this.angularSleepingThreshold,
      );
    }

    if (
      bodyConfig.angularFactor &&
      !almostEqualsVector3(0.001, bodyConfig.angularFactor, this.angularFactor)
    ) {
      this.angularFactor.copy(bodyConfig.angularFactor);
      const angularFactor = new Ammo.btVector3(
        this.angularFactor.x,
        this.angularFactor.y,
        this.angularFactor.z,
      );
      this.physicsBody.setAngularFactor(angularFactor);
      Ammo.destroy(angularFactor);
    }

    //TODO: support dynamic update for other properties
  }

  /**
   * Removes the component and all physics and scene side effects.
   */
  destroy() {
    if (this.triMesh) Ammo.destroy(this.triMesh);
    if (this.localScaling) Ammo.destroy(this.localScaling);

    this.shapes.forEach((shape) => {
      this.compoundShape.removeChildShape(shape);
    });
    if (this.compoundShape) Ammo.destroy(this.compoundShape);

    if (this.physicsBody) {
      this.world.removeBody(this.physicsBody);
      Ammo.destroy(this.physicsBody);
      delete this.physicsBody;
    }
    Ammo.destroy(this.rbInfo);
    Ammo.destroy(this.msTransform);
    Ammo.destroy(this.motionState);
    Ammo.destroy(this.localInertia);
    Ammo.destroy(this.rotation);
    Ammo.destroy(this.gravity);
  }

  /**
   * Updates the rigid body's position, velocity, and rotation, based on the scene.
   */
  syncToPhysics(setCenterOfMassTransform?: boolean) {
    const pos = new Vector3(),
      quat = new Quaternion(),
      scale = new Vector3(),
      q = new Quaternion(),
      v = new Vector3();
    const body = this.physicsBody;
    if (!body) return;

    this.motionState.getWorldTransform(this.msTransform);

    this.matrix.decompose(pos, quat, scale);

    const position = this.msTransform.getOrigin();
    v.set(position.x(), position.y(), position.z());

    const quaternion = this.msTransform.getRotation();
    q.set(quaternion.x(), quaternion.y(), quaternion.z(), quaternion.w());

    if (
      !almostEqualsVector3(0.001, pos, v) ||
      !almostEqualsQuaternion(0.001, quat, q)
    ) {
      if (!this.physicsBody?.isActive()) {
        this.physicsBody?.activate(true);
      }
      this.msTransform.getOrigin().setValue(pos.x, pos.y, pos.z);
      this.rotation.setValue(quat.x, quat.y, quat.z, quat.w);
      this.msTransform.setRotation(this.rotation);
      this.motionState.setWorldTransform(this.msTransform);

      if (this.type === "static" || setCenterOfMassTransform) {
        this.physicsBody?.setCenterOfMassTransform(this.msTransform);
      }
    }
  }

  /**
   * Updates the scene object's position and rotation, based on the physics simulation.
   */
  syncFromPhysics() {
    const pos = new Vector3(),
      quat = new Quaternion(),
      scale = new Vector3();

    this.motionState.getWorldTransform(this.msTransform);
    const position = this.msTransform.getOrigin();
    const quaternion = this.msTransform.getRotation();

    const body = this.physicsBody;

    if (!body) return;
    this.matrix.decompose(pos, quat, scale);
    pos.set(position.x(), position.y(), position.z());
    quat.set(quaternion.x(), quaternion.y(), quaternion.z(), quaternion.w());
    this.matrix.compose(pos, quat, scale);
  }

  addShape(collisionShape: Ammo.btCollisionShape) {
    if (collisionShape.type === "mesh" && this.type !== "static") {
      console.warn("non-static mesh colliders not supported");
      return;
    }

    this.shapes.push(collisionShape);
    const minAABB = new Ammo.btVector3();
    const maxAABB = new Ammo.btVector3();
    const worldT = this.physicsBody?.getWorldTransform();
    this.compoundShape.addChildShape(
      collisionShape.localTransform,
      collisionShape,
    );
    this.shapesChanged = true;
    this.updateShapes();
  }

  removeShape(collisionShape: Ammo.btCollisionShape) {
    const index = this.shapes.indexOf(collisionShape);
    if (this.compoundShape && this.shapes.includes(collisionShape)) {
      this.compoundShape.removeChildShape(collisionShape);
      this.shapesChanged = true;
      this.shapes.splice(index, 1);
      this.updateShapes();
    }
  }

  updateMass() {
    const mass = this.type === "static" ? 0 : this.mass;
    this.compoundShape.calculateLocalInertia(mass, this.localInertia);
    this.physicsBody?.setMassProps(mass, this.localInertia);
    this.physicsBody?.updateInertiaTensor();
  }

  updateCollisionFlags() {
    let flags = this.disableCollision ? 4 : 0;
    switch (this.type) {
      case "static":
        flags |= CollisionFlag.StaticObject;
        break;
      case "kinematic":
        flags |= CollisionFlag.KinematicObject;
        break;
      default:
        this.physicsBody?.applyGravity();
        break;
    }
    this.physicsBody?.setCollisionFlags(flags);

    this.updateMass();

    // TODO: enable CCD if dynamic?
    // this.physicsBody.setCcdMotionThreshold(0.001);
    // this.physicsBody.setCcdSweptSphereRadius(0.001);

    if (this.physicsBody) this.world.updateBody(this.physicsBody);
  }

  getVelocity() {
    return this.physicsBody?.getLinearVelocity();
  }
}

export const castGenericShape = (shape: Ammo.btCollisionShape) => {
  switch (shape.type) {
    case "box":
      return Ammo.castObject(shape, Ammo.btBoxShape);
    case "capsule":
      return Ammo.castObject(shape, Ammo.btCapsuleShape);
    case "cone":
      return Ammo.castObject(shape, Ammo.btConeShape);
    case "cylinder":
      return Ammo.castObject(shape, Ammo.btCylinderShape);
    case "sphere":
      return Ammo.castObject(shape, Ammo.btSphereShape);
    case "hull":
    case "hacd":
    case "vhacd":
      return Ammo.castObject(shape, Ammo.btConvexHullShape);
    case "heightfield":
      return Ammo.castObject(shape, Ammo.btHeightfieldTerrainShape);
    case "mesh":
      return Ammo.castObject(shape, Ammo.btBvhTriangleMeshShape);
  }
};
