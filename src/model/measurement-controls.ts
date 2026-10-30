import type { SketchEditor } from "../sketch/editor.js";
import type { Measurement, MeasurementTarget } from "./measurement.js";
import "./measurement.css";

const ns = "http://www.w3.org/2000/svg";
const number = (value: number) =>
  Math.abs(value) < 1e-7
    ? "0"
    : Number(value.toPrecision(6)).toLocaleString("en-US", { maximumSignificantDigits: 6 });

/** Disposable readout of accepted geometry. Replies never install a model view. */
export class MeasurementControls {
  private root = document.createElement("section");
  private lines = document.createElementNS(ns, "svg");
  private key = "";
  private document: SketchEditor["store"]["data"] | null = null;
  private selectionKey = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private disposed = false;
  private result: Measurement | null = null;
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
    readouts: HTMLElement,
  ) {
    this.root.className = "measurement-readout";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Measurements");
    this.root.setAttribute("aria-live", "polite");
    this.lines.classList.add("measurement-witnesses");
    this.lines.setAttribute("aria-hidden", "true");
    app.append(this.lines);
    readouts.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private targets(): MeasurementTarget[] {
    const e = this.editor;
    if (e.interactions.current || e.isDragging) return [];
    if (e.world.active) {
      const curves = [...e.selectedCurves];
      if (!e.sketch || e.selected.points.length || curves.length < 1 || curves.length > 2)
        return [];
      const sketch = e.sketch.id;
      return curves.map((curve) => ({ kind: "curve", sketch, curve }));
    }
    const targets = e.modeling.targets;
    const plane = e.modeling.referencePlane;
    if (
      targets.length < 1 ||
      targets.length + Number(!!plane) > 2 ||
      (!!plane && !e.visibility.visible(plane)) ||
      targets.some((t) => t.kind !== "face" && t.kind !== "edge" && t.kind !== "profile") ||
      targets.some((t) =>
        t.kind === "profile"
          ? !e.visibility.visible(t.sketch)
          : (t.kind === "face" || t.kind === "edge") &&
            (!e.bodiesVisible || !e.visibility.visible(t.body)),
      )
    )
      return [];
    const result = targets.flatMap<MeasurementTarget>((t) =>
      t.kind === "profile"
        ? [{ kind: "profile", sketch: t.sketch, profile: t.profile.key }]
        : t.kind === "face"
          ? [{ kind: "face" as const, body: t.body, face: t.face }]
          : t.kind === "edge"
            ? [{ kind: "edge" as const, body: t.body, edge: t.edge }]
            : [],
    );
    if (plane) result.push({ kind: "plane", plane });
    return result;
  }
  private update = (): void => {
    const targets = this.targets();
    const selectionKey = JSON.stringify(targets);
    if (this.document === this.editor.store.data && selectionKey === this.selectionKey) {
      this.draw();
      return;
    }
    this.document = this.editor.store.data;
    this.selectionKey = selectionKey;
    // Geometry identity, rather than camera position or hover, invalidates results.
    const key = targets.length
      ? JSON.stringify([
          targets,
          targets.map((t) =>
            t.kind === "curve" || t.kind === "profile"
              ? this.editor.store.data.sketches.find((s) => s.id === t.sketch)
              : t.kind === "plane"
                ? this.editor.store.data.constructionPlanes?.find((p) => p.id === t.plane)
                : this.editor.store.data.bodies?.find((b) => b.id === t.body)?.brep,
          ),
        ])
      : "";
    if (key !== this.key) {
      this.key = key;
      this.result = null;
      clearTimeout(this.timer);
      this.root.hidden = !key;
      this.root.textContent = key ? "Measuring…" : "";
      if (key) this.schedule();
    }
    this.draw();
  };
  private schedule(): void {
    this.timer = setTimeout(() => void this.calculate(), 180);
  }
  private async calculate(): Promise<void> {
    if (this.disposed || !this.key) return;
    if (this.running || this.editor.store.working) {
      this.schedule();
      return;
    }
    const key = this.key;
    this.running = true;
    try {
      const result = await this.editor.store.measure(this.targets());
      if (this.disposed || key !== this.key) return;
      this.result = result;
      this.render(result);
      this.draw();
    } catch (error) {
      if (!this.disposed && key === this.key)
        this.root.textContent = error instanceof Error ? error.message : "Measurement unavailable";
    } finally {
      this.running = false;
    }
  }
  private row(label: string, value: string): void {
    const row = document.createElement("div");
    const title = document.createElement("span"),
      result = document.createElement("strong");
    title.textContent = label;
    result.textContent = value;
    row.append(title, result);
    this.root.append(row);
  }
  private render(result: Measurement): void {
    this.root.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Measurements";
    this.root.append(heading);
    for (const p of result.properties) this.row(p.label, `${number(p.value)} ${p.unit}`);
    for (const [label, value] of [
      ["Minimum gap", result.minimumGap],
      ["Maximum gap", result.maximumGap],
    ] as const)
      if (value) this.row(label, `${result.approximate ? "≈ " : ""}${number(value.value)} mm`);
    if (result.distance) this.row("Shortest distance", `${number(result.distance.value)} mm`);
    if (result.relationships.length) this.row("Relationship", result.relationships.join(" · "));
    if (result.gapReason) this.row("Gap", "Not applicable");
    const note =
      result.gapReason ??
      (result.approximate
        ? "Sampled facing-region gaps; small features or extrema may be missed. Maximum is a lower bound, not a clearance guarantee."
        : "");
    if (note) {
      const help = document.createElement("button");
      help.type = "button";
      help.className = "measurement-help";
      help.textContent = "?";
      help.title = note;
      help.setAttribute("aria-label", `Measurement details: ${note}`);
      heading.append(help);
    }
  }
  private draw(): void {
    this.lines.replaceChildren();
    if (!this.result || !this.key) return;
    const values =
      this.result.minimumGap && this.result.maximumGap
        ? ([
            ["min", this.result.minimumGap],
            ["max", this.result.maximumGap],
          ] as const)
        : this.result.distance
          ? ([["distance", this.result.distance]] as const)
          : [];
    for (const [name, value] of values) {
      const [a, b] = value.points.map((p) => this.editor.world.project(p));
      const line = document.createElementNS(ns, "line");
      for (const [key, val] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
        line.setAttribute(key, String(val));
      line.classList.add(name);
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String((a.x + b.x) / 2 + 7));
      text.setAttribute("y", String((a.y + b.y) / 2 + (name === "max" ? 16 : -7)));
      text.textContent = `${name} ${this.result.approximate && name !== "distance" ? "≈ " : ""}${number(value.value)} mm`;
      this.lines.append(line, text);
    }
  }
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.editor.world.changed.delete(this.update);
    this.root.remove();
    this.lines.remove();
  }
}
