import World from "./world";
import { Vector3 } from "three";
import type Body from "./body";

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

export type ConstraintOptions =
  | LockConstraintConfig
  | FixedConstraintConfig
  | SpringConstraintConfig
  | SliderConstraintConfig
  | HingeConstraintConfig
  | ConeTwistConstraintConfig
  | PointToPointConstraintConfig;

/**
 * @return {Ammo.btTypedConstraint}
 */
export default class Constraint {
  physicsConstraint:
    | Ammo.btGeneric6DofConstraint
    | Ammo.btFixedConstraint
    | Ammo.btSliderConstraint
    | Ammo.btHingeConstraint
    | Ammo.btPoint2PointConstraint
    | null;

  world: World;

  constructor(
    constraintConfig: ConstraintOptions | undefined,
    body: Body,
    targetBody: Body,
    world: World,
  ) {
    if (!body.physicsBody)
      throw new Error("Could not create Constraint! Physics Body not found!");
    if (!targetBody.physicsBody)
      throw new Error(
        "Could not create Constraint! Target Physics Body not found!",
      );

    this.world = world;

    const bodyTransform = body.physicsBody
      .getCenterOfMassTransform()
      .inverse()
      .op_mul(targetBody.physicsBody.getWorldTransform());
    const targetTransform = new Ammo.btTransform();
    targetTransform.setIdentity();

    switch (constraintConfig?.type) {
      //TODO: test and verify all other constraint types
      case "fixed":
        //btFixedConstraint does not seem to debug render
        bodyTransform.setRotation(
          body.physicsBody.getWorldTransform().getRotation(),
        );
        targetTransform.setRotation(
          targetBody.physicsBody.getWorldTransform().getRotation(),
        );
        this.physicsConstraint = new Ammo.btFixedConstraint(
          body.physicsBody,
          targetBody.physicsBody,
          bodyTransform,
          targetTransform,
        );
        break;
      case "spring":
        this.physicsConstraint = new Ammo.btGeneric6DofSpringConstraint(
          body.physicsBody,
          targetBody.physicsBody,
          bodyTransform,
          targetTransform,
          true,
        );
        //TODO: enableSpring, setStiffness and setDamping
        break;
      case "slider":
        //TODO: support setting linear and angular limits
        const sliderConstraint = new Ammo.btSliderConstraint(
          body.physicsBody,
          targetBody.physicsBody,
          bodyTransform,
          targetTransform,
          true,
        );
        sliderConstraint.setLowerLinLimit(-1);
        sliderConstraint.setUpperLinLimit(1);
        this.physicsConstraint = sliderConstraint;
        break;
      case "hinge": {
        const pivot = new Ammo.btVector3(
          constraintConfig.pivot.x,
          constraintConfig.pivot.y,
          constraintConfig.pivot.z,
        );
        const targetPivot = new Ammo.btVector3(
          constraintConfig.targetPivot.x,
          constraintConfig.targetPivot.y,
          constraintConfig.targetPivot.z,
        );

        const axis = new Ammo.btVector3(
          constraintConfig.axis.x,
          constraintConfig.axis.y,
          constraintConfig.axis.z,
        );
        const targetAxis = new Ammo.btVector3(
          constraintConfig.targetAxis.x,
          constraintConfig.targetAxis.y,
          constraintConfig.targetAxis.z,
        );

        this.physicsConstraint = new Ammo.btHingeConstraint(
          body.physicsBody,
          targetBody.physicsBody,
          pivot,
          targetPivot,
          axis,
          targetAxis,
          true,
        );

        Ammo.destroy(pivot);
        Ammo.destroy(targetPivot);
        Ammo.destroy(axis);
        Ammo.destroy(targetAxis);
        break;
      }
      case "coneTwist":
        const pivotTransform = new Ammo.btTransform();
        pivotTransform.setIdentity();
        pivotTransform
          .getOrigin()
          .setValue(
            constraintConfig.targetPivot.x,
            constraintConfig.targetPivot.y,
            constraintConfig.targetPivot.z,
          );
        this.physicsConstraint = new Ammo.btConeTwistConstraint(
          body.physicsBody,
          pivotTransform,
        );
        Ammo.destroy(pivotTransform);
        break;
      case "pointToPoint":
        const pivot = new Ammo.btVector3(
          constraintConfig.pivot.x,
          constraintConfig.pivot.y,
          constraintConfig.pivot.z,
        );
        const targetPivot = new Ammo.btVector3(
          constraintConfig.targetPivot.x,
          constraintConfig.targetPivot.y,
          constraintConfig.targetPivot.z,
        );

        this.physicsConstraint = new Ammo.btPoint2PointConstraint(
          body.physicsBody,
          targetBody.physicsBody,
          pivot,
          targetPivot,
        );

        Ammo.destroy(pivot);
        Ammo.destroy(targetPivot);
        break;
      default:
        const lockConstraint = new Ammo.btGeneric6DofConstraint(
          body.physicsBody,
          targetBody.physicsBody,
          bodyTransform,
          targetTransform,
          true,
        );
        const zero = new Ammo.btVector3(0, 0, 0);
        const lowerSliderlimit = new Ammo.btVector3(0, 1, 0);
        const upperSliderLimit = new Ammo.btVector3(0, 1, 0);
        //TODO: allow these to be configurable
        lockConstraint.setLinearLowerLimit(lowerSliderlimit);
        lockConstraint.setLinearUpperLimit(upperSliderLimit);
        lockConstraint.setAngularLowerLimit(zero);
        lockConstraint.setAngularUpperLimit(zero);
        Ammo.destroy(zero);
        Ammo.destroy(lowerSliderlimit);
        Ammo.destroy(upperSliderLimit);
        this.physicsConstraint = lockConstraint;
        break;
    }

    Ammo.destroy(targetTransform);

    this.world.physicsWorld.addConstraint(this.physicsConstraint, false);
  }

  destroy() {
    if (!this.physicsConstraint) return;

    this.world.physicsWorld.removeConstraint(this.physicsConstraint);
    Ammo.destroy(this.physicsConstraint);
    this.physicsConstraint = null;
  }
}

// export default Constraint;
