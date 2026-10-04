import {
  AlwaysStencilFunc,
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ReplaceStencilOp,
  Vector3,
} from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { ImportedMesh } from "./mesh-import.js";

export class MeshImportView {
  readonly bounds = new Box3();
  private sourceMaterial = new MeshStandardMaterial({
    color: 0x94a7bb,
    side: DoubleSide,
    roughness: 0.75,
  });
  private errorMaterial = new MeshBasicMaterial({
    vertexColors: true,
    side: DoubleSide,
    toneMapped: false,
  });
  private drawing: Mesh<BufferGeometry, MeshStandardMaterial | MeshBasicMaterial> = new Mesh(
    new BufferGeometry(),
    this.sourceMaterial,
  );
  private originalDepth: SketchEditor["world"]["depthBounds"];
  constructor(private editor: SketchEditor) {
    for (const material of [this.sourceMaterial, this.errorMaterial]) {
      material.stencilWrite = true;
      material.stencilRef = 2;
      material.stencilWriteMask = 6;
      material.stencilFunc = AlwaysStencilFunc;
      material.stencilZPass = ReplaceStencilOp;
    }
    this.originalDepth = editor.world.depthBounds;
    editor.world.depthBounds = () => this.originalDepth().clone().union(this.bounds);
    this.drawing.visible = false;
    editor.world.scene.add(this.drawing);
  }
  set(mesh: ImportedMesh, scale: number, errors?: number[], tolerance = 1): void {
    const geometry = new BufferGeometry(),
      positions: number[] = [],
      colors: number[] = [];
    this.bounds.makeEmpty();
    for (const p of mesh.vertices)
      this.bounds.expandByPoint(new Vector3(...p).multiplyScalar(scale));
    const low = new Color("#246db5"),
      high = new Color("#e69720");
    for (const f of mesh.triangles)
      for (const id of f) {
        positions.push(...mesh.vertices[id].map((v) => v * scale));
        if (errors)
          colors.push(
            ...low
              .clone()
              .lerp(high, Math.min(1, errors[id] / tolerance))
              .toArray(),
          );
      }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    if (errors) geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.drawing.geometry.dispose();
    this.drawing.geometry = geometry;
    this.drawing.material = errors ? this.errorMaterial : this.sourceMaterial;
  }
  frame(): void {
    const world = this.editor.world,
      center = this.bounds.getCenter(new Vector3());
    const size = this.bounds.getSize(new Vector3()).length();
    const direction = world.camera.position.clone().sub(world.target).normalize();
    world.target.copy(center);
    world.camera.position.copy(center).addScaledVector(direction, size * 2);
    world.height = Math.max(0.001, size * 1.4);
    world.requestDraw();
  }
  show(value: boolean): void {
    this.drawing.visible = value;
  }
  clear(): void {
    this.drawing.visible = false;
    this.bounds.makeEmpty();
    this.drawing.geometry.dispose();
    this.drawing.geometry = new BufferGeometry();
  }
  dispose(): void {
    this.clear();
    this.drawing.geometry.dispose();
    this.sourceMaterial.dispose();
    this.errorMaterial.dispose();
    this.editor.world.scene.remove(this.drawing);
    this.editor.world.depthBounds = this.originalDepth;
  }
}
