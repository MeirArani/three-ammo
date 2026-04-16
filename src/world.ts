const EPS = 10e-6;

import { AmmoDebugConstants, AmmoDebugDrawer } from "@hubs/ammo-debug-drawer";

export const GRAVITY = -9.8;

export interface WorldOptions {
  epsilon?: number;
  debugDrawMode?: number;
  maxSubSteps?: number;
  fixedTimeStep?: number;
  gravityConf?: Ammo.btVector3;
  solverIterations?: number;
}

export default class World extends EventTarget {
  dispatcher: Ammo.btCollisionDispatcher;
  broadphase = new Ammo.btDbvtBroadphase();
  solver = new Ammo.btSequentialImpulseConstraintSolver();
  physicsWorld: Ammo.btDiscreteDynamicsWorld;
  debugDrawer: AmmoDebugDrawer | undefined;
  object3Ds = new Map<number, any>();
  collisions = new Map<number, number[]>();
  epsilon: number;
  debugDrawMode: number;
  maxSubSteps: number;
  fixedTimeStep: number;
  collisionConfiguration: Ammo.btDefaultCollisionConfiguration;

  constructor({
    epsilon = EPS,
    debugDrawMode = 0,
    maxSubSteps = 4,
    fixedTimeStep = 1 / 60,
    gravityConf,
    solverIterations = 10,
  }: {
    epsilon?: number;
    debugDrawMode?: number;
    maxSubSteps?: number;
    fixedTimeStep?: number;
    gravityConf?: Ammo.btVector3;
    solverIterations?: number;
  }) {
    super();
    this.epsilon = epsilon;
    this.debugDrawMode = debugDrawMode;
    this.maxSubSteps = maxSubSteps;
    this.fixedTimeStep = fixedTimeStep;
    this.collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    this.dispatcher = new Ammo.btCollisionDispatcher(
      this.collisionConfiguration,
    );
    this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(
      this.dispatcher,
      this.broadphase,
      this.solver,
      this.collisionConfiguration,
    );
    this.physicsWorld.setForceUpdateAllAabbs(false);
    const gravity = new Ammo.btVector3(0, GRAVITY, 0);
    if (gravityConf) {
      gravity.setValue(gravityConf.x(), gravityConf.y(), gravityConf.z());
    }
    this.physicsWorld.setGravity(gravity);
    Ammo.destroy(gravity);
    this.physicsWorld.getSolverInfo().set_m_numIterations(solverIterations);
  }

  isDebugEnabled() {
    return this.debugDrawMode !== 0;
  }

  addBody(body: Ammo.btRigidBody, obj: any, group: number, mask: number) {
    this.physicsWorld.addRigidBody(body, group, mask);
    this.object3Ds.set(Ammo.getPointer(body), obj);
  }

  removeBody(body: Ammo.btRigidBody) {
    this.physicsWorld.removeRigidBody(body);
    const bodyptr = Ammo.getPointer(body);
    this.object3Ds.delete(bodyptr);
    this.collisions.delete(bodyptr);
  }

  updateBody(body: Ammo.btRigidBody) {
    if (this.object3Ds.has(Ammo.getPointer(body))) {
      const shape = body.getCollisionShape();
      this.physicsWorld.updateSingleAabb(body);
    }
  }

  step(deltaTime: number) {
    this.physicsWorld.stepSimulation(
      deltaTime,
      this.maxSubSteps,
      this.fixedTimeStep,
    );

    for (const arr of this.collisions.values()) {
      arr.length = 0;
    }

    const numManifolds = this.dispatcher.getNumManifolds();
    for (let i = 0; i < numManifolds; i++) {
      const persistentManifold = this.dispatcher.getManifoldByIndexInternal(i);
      const numContacts = persistentManifold.getNumContacts();
      const body0ptr = Ammo.getPointer(persistentManifold.getBody0()); // FIX ! back to ammo.getPointer()
      const body1ptr = Ammo.getPointer(persistentManifold.getBody1());

      for (let j = 0; j < numContacts; j++) {
        const manifoldPoint = persistentManifold.getContactPoint(j);
        const distance = manifoldPoint.getDistance();
        if (distance <= this.epsilon) {
          if (!this.collisions.has(body0ptr)) {
            this.collisions.set(body0ptr, []);
          }
          if (!this.collisions.get(body0ptr)?.includes(body1ptr)) {
            this.collisions.get(body0ptr)!.push(body1ptr);
          }
          if (!this.collisions.has(body1ptr)) {
            this.collisions.set(body1ptr, []);
          }
          if (!this.collisions.get(body1ptr)?.includes(body0ptr)) {
            this.collisions.get(body1ptr)!.push(body0ptr);
          }
          break;
        }
      }
    }

    // TODO: Renable Debug Drawer
    if (this.debugDrawer) {
      this.debugDrawer.update();
    }
  }

  destroy() {
    Ammo.destroy(this.collisionConfiguration);
    Ammo.destroy(this.dispatcher);
    Ammo.destroy(this.broadphase);
    Ammo.destroy(this.solver);
    Ammo.destroy(this.physicsWorld);
    Ammo.destroy(this.debugDrawer);
  }

  // TODO: Renable debug drawer
  getDebugDrawer(
    debugIndexArray: Uint32Array | null,
    debugMatricesArray: Float32Array,
    debugColorsArray: Float32Array,
    options?: { debugDrawMode: number },
  ) {
    if (!this.debugDrawer) {
      options = options || { debugDrawMode: 0 };
      options.debugDrawMode = options.debugDrawMode || this.debugDrawMode;
      this.debugDrawer = new AmmoDebugDrawer(
        debugIndexArray,
        debugMatricesArray,
        debugColorsArray,
        this.physicsWorld,
        options,
      );
    }

    return this.debugDrawer;
  }
}
