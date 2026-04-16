import { ShapeType } from "@hubs/three-to-ammo";

declare global {
  namespace Ammo {
    interface btCollisionShape {
      type: ShapeType;
      destroy: () => void;
      resources?: any[] | any;
      heightfieldData?: number;
      localTransform: btTransform;
    }
  }
}
