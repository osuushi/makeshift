import * as THREE from "three";
import { type Affine, affinePoint, identityAffine, requireAffine } from "../model/affine.js";
import type { BenchTab } from "../model/benches.js";
import type { SmartObject } from "../model/smart-object.js";
import type { Vector } from "../sketch/planes.js";

export type TransformMode = "move" | "rotate" | "scale" | "mirror" | "matrix";
interface PlacementChange {
  transform: Affine;
  absolute: boolean;
}

function select(
  choices: readonly { id: string; name: string }[],
  label: string,
): HTMLSelectElement {
  const field = document.createElement("select");
  field.setAttribute("aria-label", label);
  for (const { id, name } of choices) field.add(new Option(name, id));
  return field;
}

export function selectSource(benches: readonly BenchTab[]): Promise<string | null> {
  const field = select(benches, "Source bench");
  return openForm("Insert bench", "Insert linked bench", field, () => field.value || null);
}

function openForm<T>(
  name: string,
  submit: string,
  contents: HTMLElement,
  read: () => T | null,
  clear?: () => void,
): Promise<T | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "smart-object-dialog";
  dialog.setAttribute("aria-label", name);
  const heading = document.createElement("h2");
  heading.textContent = name;
  const form = document.createElement("form");
  const actions = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.textContent = submit;
  actions.append(cancel, apply);
  form.append(contents, actions);
  dialog.append(heading, form);
  return new Promise((resolve) => {
    const finish = (result: T | null) => {
      clear?.();
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancel.onclick = () => finish(null);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const value = read();
      if (value !== null) finish(value);
    };
    document.body.append(dialog);
    dialog.showModal();
  });
}

const modes: { id: TransformMode; name: string }[] = [
  { id: "move", name: "Move" },
  { id: "rotate", name: "Rotate" },
  { id: "scale", name: "Scale" },
  { id: "mirror", name: "Mirror" },
  { id: "matrix", name: "Affine matrix" },
];
const axes = ["X", "Y", "Z"];

export function transformPlacement(
  objects: readonly SmartObject[],
  initial: TransformMode,
  preview: (change: PlacementChange | null) => void,
  duplicate: boolean,
): Promise<PlacementChange | null> {
  const root = document.createElement("div");
  const mode = select(modes, "Transform type");
  mode.value = initial;
  const fields = document.createElement("div");
  const error = document.createElement("p");
  error.setAttribute("role", "status");
  error.hidden = true;
  root.append(mode, fields, error);
  const pivot = affinePoint(objects[0].transform, [0, 0, 0]);
  let values: HTMLInputElement[] = [];
  const mirror = select(
    [
      { id: "2", name: "XY plane" },
      { id: "1", name: "XZ plane" },
      { id: "0", name: "YZ plane" },
    ],
    "Mirror plane",
  );
  const read = (): PlacementChange | null => {
    const kind = mode.value as TransformMode;
    const vector = values.map((field) => field.valueAsNumber);
    try {
      const change = placementChange(
        kind,
        vector,
        pivot,
        objects.length === 1,
        Number(mirror.value),
      );
      error.hidden = true;
      return change;
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
      return null;
    }
  };
  const decorate = () => {
    const kind = mode.value;
    const labels =
      kind === "matrix"
        ? axes.flatMap((row) => [
            ...axes.map((column) => `${row} from ${column}`),
            `${row} offset (mm)`,
          ])
        : axes.map((axis) =>
            kind === "rotate"
              ? `${axis} angle (°)`
              : kind === "scale"
                ? `${axis} factor`
                : `${axis} distance (mm)`,
          );
    const defaults =
      kind === "matrix"
        ? objects.length === 1
          ? objects[0].transform
          : identityAffine
        : Array(3).fill(kind === "scale" ? 1 : 0);
    values = [];
    fields.replaceChildren();
    fields.classList.toggle("affine-matrix", kind === "matrix");
    fields.classList.toggle("transform-vector", kind !== "mirror" && kind !== "matrix");
    if (kind === "mirror") fields.append(mirror);
    else
      labels.forEach((label, i) => {
        const row = document.createElement("label");
        row.textContent = label;
        const field = document.createElement("input");
        field.type = "number";
        field.step = "any";
        field.required = true;
        field.value = String(defaults[i]);
        row.append(field);
        fields.append(row);
        values.push(field);
      });
    preview(read());
  };
  mode.onchange = decorate;
  fields.oninput = () => preview(read());
  decorate();
  return openForm(
    duplicate ? "Duplicate smart objects" : "Transform smart objects",
    duplicate ? "Duplicate" : "Apply transform",
    root,
    read,
    () => preview(null),
  );
}

function placementChange(
  mode: TransformMode,
  values: number[],
  pivot: Vector,
  single: boolean,
  mirrorAxis: number,
): PlacementChange {
  if (mode === "matrix") {
    requireAffine(values);
    return { transform: values, absolute: single };
  }
  if (mode !== "mirror" && !values.every(Number.isFinite))
    throw new Error("Enter finite values for each axis");
  const [x, y, z] = values;
  const matrix = new THREE.Matrix4();
  if (mode === "move") matrix.makeTranslation(x, y, z);
  else {
    if (mode === "rotate")
      matrix.makeRotationFromEuler(
        new THREE.Euler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180),
      );
    else if (mode === "scale") matrix.makeScale(x, y, z);
    else {
      const signs = [0, 1, 2].map((axis) => (axis === mirrorAxis ? -1 : 1));
      matrix.makeScale(signs[0], signs[1], signs[2]);
    }
    const origin = new THREE.Vector3(...pivot);
    matrix.setPosition(origin.clone().sub(origin.applyMatrix4(matrix)));
  }
  const m = matrix.elements;
  const transform: Affine = [
    m[0],
    m[4],
    m[8],
    m[12],
    m[1],
    m[5],
    m[9],
    m[13],
    m[2],
    m[6],
    m[10],
    m[14],
  ];
  requireAffine(transform);
  return { transform, absolute: false };
}
