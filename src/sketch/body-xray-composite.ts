import type * as THREE from "three";
import { viewDisplay } from "../preferences/view-display.js";
import { BodyXrayMask } from "./body-xray-mask.js";
import type { World } from "./world.js";
import { XrayComposite } from "./xray-composite.js";

/** One ordinary depth-sorted x-ray layer, blended once against the revealed scene. */
export class BodyXrayComposite {
  private readonly composite = new XrayComposite(new BodyXrayMask());

  render(world: World, render: () => void): void {
    const { bodyXrayOpacity, xrayGlobal } = viewDisplay();
    if (bodyXrayOpacity === 1) {
      render();
      return;
    }
    const bodies: THREE.Object3D[] = [];
    world.scene.traverseVisible((object) => {
      if (object.userData.xrayBody) bodies.push(object);
    });
    if (!bodies.length) {
      render();
      return;
    }
    const revealed = () => {
      const hidden = world.scene.userData.xrayHiddenBodies;
      try {
        world.scene.userData.xrayHiddenBodies = new Set(
          bodies.map((body) => body.userData.xrayBody),
        );
        for (const body of bodies) body.visible = false;
        render();
      } finally {
        world.scene.userData.xrayHiddenBodies = hidden;
        for (const body of bodies) body.visible = true;
      }
    };
    if (bodyXrayOpacity === 0 && xrayGlobal) revealed();
    else this.composite.render(world, render, revealed, "body");
  }

  invalidate(): void {
    this.composite.invalidate();
  }
  dispose(): void {
    this.composite.dispose();
  }
}
