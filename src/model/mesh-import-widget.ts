import "./mesh-import.css";
export class MeshImportWidget {
  readonly root = document.createElement("section");
  readonly tolerance = document.createElement("input");
  readonly patches = document.createElement("select");
  readonly units = document.createElement("select");
  readonly view = document.createElement("select");
  readonly status = document.createElement("p");
  readonly title = document.createElement("strong");
  readonly fit = document.createElement("button");
  readonly accept = document.createElement("button");
  readonly cancel = document.createElement("button");
  readonly legend = document.createElement("small");
  constructor(overlay: HTMLElement) {
    this.root.className = "mesh-import-widget";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Import mesh");
    this.tolerance.type = "text";
    this.tolerance.inputMode = "decimal";
    for (const [value, label] of [
      ["1", "Millimeters"],
      ["10", "Centimeters"],
      ["25.4", "Inches"],
      ["1000", "Meters"],
    ])
      this.units.add(new Option(label, value));
    for (const value of [24, 54, 96, 150, 216])
      this.patches.add(new Option(String(value), String(value)));
    this.patches.value = "96";
    for (const [value, label] of [
      ["source", "Source mesh"],
      ["fit", "Fitted solid"],
      ["error", "Deviation"],
    ])
      this.view.add(new Option(label, value));
    this.root.append(this.title);
    this.field("Source units", this.units);
    this.field("Accuracy (mm)", this.tolerance);
    this.field("Face budget", this.patches);
    this.field("Preview", this.view);
    this.status.setAttribute("role", "status");
    this.status.textContent = "Reading mesh…";
    this.fit.textContent = "Fit preview";
    this.accept.textContent = "Accept";
    this.cancel.textContent = "Cancel";
    this.fit.setAttribute("aria-label", "Fit mesh preview");
    this.accept.setAttribute("aria-label", "Accept mesh");
    this.cancel.setAttribute("aria-label", "Cancel mesh import");
    const actions = document.createElement("div");
    actions.className = "mesh-import-actions";
    actions.append(this.fit, this.accept, this.cancel);
    this.legend.className = "mesh-import-legend";
    this.legend.hidden = true;
    this.root.append(this.status, this.legend, actions);
    overlay.append(this.root);
  }
  private field(name: string, input: HTMLInputElement | HTMLSelectElement): void {
    const label = document.createElement("label"),
      title = document.createElement("span");
    title.textContent = name;
    input.setAttribute("aria-label", name);
    label.append(title, input);
    this.root.append(label);
  }
  dispose(): void {
    this.root.remove();
  }
}
