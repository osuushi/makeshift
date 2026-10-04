import type { BodyErosion } from "./body.js";
import type { ErosionWidget } from "./erosion-widget.js";
export class ErosionParameters {
  thickness = 1;
  allowancePercent = 50;
  keepOriginals = true;
  method: "fast" | "accurate" = "fast";
  meshDetail: "coarse" | "standard" | "fine" = "standard";
  maxFaces = 128;
  bind(widget: ErosionWidget, begin: () => boolean, queue: () => void, signal: AbortSignal): void {
    const options = { signal };
    for (const [input, key] of [
      [widget.thickness, "thickness"],
      [widget.allowance, "allowancePercent"],
      [widget.maxFaces, "maxFaces"],
    ] as const) {
      input.addEventListener("focus", begin, options);
      input.addEventListener(
        "input",
        () => {
          if (!begin()) return;
          this[key] = input.value.trim() ? Number(input.value) : NaN;
          queue();
        },
        options,
      );
    }
    widget.method.addEventListener(
      "change",
      () => {
        if (!begin()) return;
        this.method = widget.method.value === "accurate" ? "accurate" : "fast";
        queue();
      },
      options,
    );
    widget.meshDetail.addEventListener(
      "change",
      () => {
        if (!begin()) return;
        this.meshDetail = widget.meshDetail.value as typeof this.meshDetail;
        queue();
      },
      options,
    );
  }
  reset(): void {
    Object.assign(this, new ErosionParameters());
  }
  snapshot() {
    const { thickness, allowancePercent, keepOriginals, method, meshDetail, maxFaces } = this;
    return { thickness, allowancePercent, keepOriginals, method, meshDetail, maxFaces };
  }
  operation(ids: string[]): BodyErosion {
    return {
      ids,
      thickness: this.thickness,
      method: this.method,
      keepOriginals: this.keepOriginals,
      ...(this.method === "accurate"
        ? { allowance: (this.thickness * this.allowancePercent) / 100 }
        : { meshDetail: this.meshDetail, maxFaces: this.maxFaces }),
    };
  }
}
