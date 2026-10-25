import * as THREE from "three";
import type { SketchEditor } from "../src/sketch/editor.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { NavigationHistory } from "../src/sketch/navigation-history.js";
import { SelectionHistory } from "../src/sketch/selection-history.js";
import type { SelectionTarget } from "../src/sketch/selection-target.js";
import type { World } from "../src/sketch/world.js";

export function navigationSelectionFixture() {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  camera.position.set(55, -70, 65);
  camera.up.set(0, 0, 1);
  const world = {
    camera,
    target: new THREE.Vector3(),
    height: 80,
    workspace: null as World["workspace"],
    orbit: { active: false },
    cameraTransitioning: false,
    draw: () => {
      history.observe();
      navigation.settled();
    },
    cancelCameraMotion: () => {
      world.cameraTransitioning = false;
    },
  };
  const navigation = new NavigationHistory(world as unknown as World);
  const modeling = { targets: [] as ModelingTarget[] };
  const editor = {
    world: { ...world, navigation },
    modeling,
    selected: { targets: [] as SelectionTarget[] },
    store: { busy: false, scriptRunning: false, syncSelection: () => {} },
    interactions: { current: null },
  };
  // Keep the collaborator and editor on the same mutable World for the test.
  Object.assign(world, { navigation });
  editor.world = world as typeof editor.world;
  const history = new SelectionHistory(editor as unknown as SketchEditor);
  history.connectNavigation();
  return { world, navigation, history, modeling, selected: editor.selected };
}
