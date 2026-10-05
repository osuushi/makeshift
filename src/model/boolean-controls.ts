import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Body, BodyBoolean } from "./body.js";
import { BodyPickProbe } from "./body-picking.js";
import { bodyCenter } from "./body-placement.js";
import { BooleanOperands } from "./boolean-operands.js";
import { BooleanPreference } from "./boolean-preference.js";
import { booleanStart } from "./boolean-start.js";
import { BooleanWidget } from "./boolean-widget.js";
import type { EntityViewer } from "./entity-viewer.js";

export class BooleanControls {
  private widget: BooleanWidget;
  private operands: BooleanOperands;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private bodies: Body[] = [];
  private operation: BodyBoolean = { ids: [], mode: "union", keepOriginals: false };
  private running: Promise<void> | null = null;
  private valid = false;
  private targetId: string | null = null;
  private preference = new BooleanPreference();
  private count = 0;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private entities: EntityViewer,
  ) {
    this.operands = new BooleanOperands(editor);
    this.widget = new BooleanWidget(
      overlay,
      (mode) =>
        this.change(() => {
          this.operation.mode = mode;
          this.targetId ??= this.bodies[0]?.id ?? null;
          this.operation.keepOriginals = this.preference.get(mode);
        }),
      () =>
        this.change(() => {
          this.operation.keepOriginals = !this.operation.keepOriginals;
          this.preference.set(this.operation.mode, this.operation.keepOriginals);
        }),
      () => {
        void this.finish();
      },
      () => {
        void this.cancel();
      },
    );
    this.installPicking();
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { signal: this.abort.signal, capture: true },
    );
    editor.world.changed.add(this.update);
  }
  start = (mode: BodyBoolean["mode"]): void => {
    if (this.editor.blocked || this.editor.world.active || this.editor.interactions.current) return;
    const resolution = booleanStart(this.editor);
    if (!resolution.available) return;
    this.bodies = resolution.inputs;
    this.targetId = this.bodies[0]?.id ?? null;
    this.lease = this.editor.interactions.acquire(
      "body-boolean",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.entities.sourcePicker = {
      choose: (target) => {
        const body = this.editor.store.data.bodies?.find(
          (b) => target.kind === "body" && b.id === target.body,
        );
        if (body) this.toggleBody(body);
      },
      hover: () => {},
      selected: (target) => target.kind === "body" && this.bodies.some((b) => b.id === target.body),
      available: (target) => target.kind === "body" && this.editor.visibility.visible(target.body),
      role: (target) => (target.kind === "body" ? this.role(target.body) : undefined),
    };
    this.operation = { ids: [], mode, keepOriginals: this.preference.get(mode) };
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.operation.ids = this.bodies.map((body) => body.id);
    this.lease.trackHistory(
      this.widget.root,
      () => ({ ids: this.operation.ids, mode: this.operation.mode, target: this.targetId }),
      async (operation) => {
        this.targetId = operation.target;
        this.operation = {
          ids: operation.ids,
          mode: operation.mode,
          keepOriginals: this.preference.get(operation.mode),
        };
        this.bodies = operation.ids.flatMap(
          (id) => this.editor.store.data.bodies?.filter((body) => body.id === id) ?? [],
        );
        this.change(() => {});
        await this.running;
      },
    );
    this.change(() => {});
  };
  private role(id: string): "target" | "tool" | "input" | undefined {
    if (!this.bodies.some((body) => body.id === id)) return undefined;
    return this.operation.mode === "subtract"
      ? id === this.targetId
        ? "target"
        : "tool"
      : "input";
  }
  private toggleBody(body: Body): void {
    this.change(() => {
      const index = this.bodies.findIndex((b) => b.id === body.id);
      if (index < 0) {
        this.bodies.push(body);
        if (this.operation.mode === "subtract" || !this.targetId) this.targetId = body.id;
      } else if (this.operation.mode === "subtract" && body.id === this.targetId) {
        this.targetId = null;
      } else {
        this.bodies.splice(index, 1);
        if (body.id === this.targetId) this.targetId = null;
      }
      if (this.targetId)
        this.bodies.sort((a, b) => Number(b.id === this.targetId) - Number(a.id === this.targetId));
    });
    this.lease?.history?.checkpoint();
  }
  private installPicking(): void {
    this.editor.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!this.lease || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.editor.blocked) return;
        const candidate = this.lease.candidate;
        this.lease.show(null);
        const hit = new BodyPickProbe(this.editor, {
          x: event.clientX,
          y: event.clientY,
        }).faces()[0];
        this.lease.show(candidate);
        const body = this.editor.store.data.bodies?.find((b) => b.id === hit?.body);
        if (body) this.toggleBody(body);
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  private change(change: () => void): void {
    if (this.editor.blocked || this.lease?.phase !== "editing") return;
    change();
    this.operation.ids = this.bodies.map((b) => b.id);
    this.operands.show(this.bodies, this.operation.mode, this.targetId);
    this.valid = false;
    this.lease.show(null);
    this.count = 0;
    this.editor.message = "";
    this.editor.notice = "";
    this.running =
      this.bodies.length >= 2 && (this.operation.mode !== "subtract" || this.targetId)
        ? this.preview()
        : null;
    this.editor.refresh();
  }
  private async preview(): Promise<void> {
    const success = await this.editor.store.request({
      kind: "boolean-bodies",
      operation: this.operation,
    });
    if (this.lease?.phase !== "editing") return;
    this.valid = success;
    if (success) {
      const candidate = this.editor.store.candidate;
      this.lease.show(candidate);
      const retained =
        this.editor.store.data.bodies?.filter(
          (b) =>
            !this.operation.ids.includes(b.id) ||
            (this.operation.keepOriginals &&
              (this.operation.mode !== "subtract" || b.id !== this.operation.ids[0])),
        ).length ?? 0;
      this.count = (candidate?.bodies?.length ?? 0) - retained;
    }
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease) return false;
    if (this.bodies.length < 2) {
      await this.cancel();
      return true;
    }
    if (!this.valid || !lease.close()) return false;
    const consumed = this.operation.ids.filter(
      (_, i) => !this.operation.keepOriginals || (this.operation.mode === "subtract" && i === 0),
    );
    const retained = new Set(
      this.editor.store.data.bodies?.filter((b) => !consumed.includes(b.id)).map((b) => b.id),
    );
    const success = await this.editor.accept();
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    if (success)
      this.editor.modeling.targets =
        this.editor.store.data.bodies
          ?.filter((b) => !retained.has(b.id))
          .map((b) => ({ kind: "body", body: b.id })) ?? [];
    this.end(lease);
    return success;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.entities.sourcePicker = null;
    this.widget.root.hidden = true;
    this.editor.notice = this.editor.message = "";
    this.operands.clear();
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) return;
    this.widget.update(this.operation, this.editor.blocked, this.valid, this.count);
    const p = this.bodies.length
      ? this.editor.world.project(bodyCenter(this.bodies))
      : { x: innerWidth / 2, y: 80 };
    const entities = this.widget.root.parentElement?.parentElement?.querySelector(".entity-viewer");
    const bounds = entities?.getBoundingClientRect();
    const left = bounds?.width ? bounds.right + 12 : 16;
    this.widget.root.style.maxWidth = `${Math.max(200, innerWidth - left - 16)}px`;
    const half = this.widget.root.offsetWidth / 2;
    this.widget.root.style.left = `${Math.max(left + half, Math.min(innerWidth - half - 16, p.x))}px`;
    this.widget.root.style.top = `${Math.max(70, Math.min(innerHeight - this.widget.root.offsetHeight - 16, p.y + 90))}px`;
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
    this.operands.dispose();
  }
}
