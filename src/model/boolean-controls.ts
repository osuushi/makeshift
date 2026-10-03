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

export class BooleanControls {
  private widget: BooleanWidget;
  private operands: BooleanOperands;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private bodies: Body[] = [];
  private operation: BodyBoolean = { ids: [], mode: "union", keepOriginals: false };
  private running: Promise<void> | null = null;
  private valid = false;
  private collecting = false;
  private preference = new BooleanPreference();
  private count = 0;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.operands = new BooleanOperands(editor);
    this.widget = new BooleanWidget(
      overlay,
      (mode) =>
        this.change(() => {
          this.operation.mode = mode;
          this.operation.keepOriginals = this.preference.get(mode);
        }),
      () =>
        this.change(() => {
          this.operation.keepOriginals = !this.operation.keepOriginals;
          this.preference.set(this.operation.mode, this.operation.keepOriginals);
        }),
      () =>
        this.change(() => {
          this.bodies.push(this.bodies.shift() as Body);
        }),
      () => {
        void this.finish();
      },
      () => {
        void this.cancel();
      },
    );
    this.widget.collect.onclick = () => this.setCollecting(!this.collecting);
    this.widget.choose = (body) => this.toggleBody(body);
    this.installPicking();
    this.widget.cleanup.onclick = () => void this.finish(true);
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else if (this.collecting) this.setCollecting(false);
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
    this.collecting = this.bodies.length < 2;
    this.lease = this.editor.interactions.acquire(
      "body-boolean",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.operation = { ids: [], mode, keepOriginals: this.preference.get(mode) };
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.operation.ids = this.bodies.map((body) => body.id);
    this.lease.trackHistory(
      this.widget.root,
      () => ({ ids: this.operation.ids, mode: this.operation.mode, collecting: this.collecting }),
      async (operation) => {
        this.collecting = operation.collecting;
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
  private notice(): void {
    const roles = this.operation.mode === "subtract" ? " · first body is the target" : "";
    this.editor.notice = this.collecting
      ? `${this.operation.mode} · click bodies to add/remove${roles} · Done choosing to accept`
      : "Boolean · Change bodies to adjust operands · Enter accepts · Escape cancels";
  }
  private setCollecting(collecting: boolean): void {
    if (this.editor.blocked || !this.lease) return;
    this.collecting = collecting;
    this.notice();
    this.lease.history?.checkpoint();
    this.editor.refresh();
  }
  private toggleBody(body: Body): void {
    if (!this.collecting) return;
    this.change(() => {
      const index = this.bodies.findIndex((b) => b.id === body.id);
      if (index < 0) this.bodies.push(body);
      else this.bodies.splice(index, 1);
    });
    this.lease?.history?.checkpoint();
  }
  private installPicking(): void {
    this.editor.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!this.lease || !this.collecting || event.button || event.metaKey || event.ctrlKey)
          return;
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
    this.operands.show(this.bodies, this.operation.mode);
    this.valid = false;
    this.lease.show(null);
    this.count = 0;
    this.editor.message = "";
    this.notice();
    this.running = this.bodies.length >= 2 ? this.preview() : null;
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
  private async finish(cleanup = false): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease) return false;
    if (this.bodies.length < 2) {
      await this.cancel();
      return true;
    }
    if (this.collecting || !this.valid || !lease.close()) return false;
    const consumed = this.operation.ids.filter(
      (_, i) => !this.operation.keepOriginals || (this.operation.mode === "subtract" && i === 0),
    );
    const retained = new Set(
      this.editor.store.data.bodies?.filter((b) => !consumed.includes(b.id)).map((b) => b.id),
    );
    const success = await this.editor.accept(cleanup);
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
    this.widget.root.hidden = true;
    this.editor.notice = this.editor.message = "";
    this.operands.clear();
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    this.widget.cleanup.disabled = !this.valid || this.editor.blocked;
    if (!this.lease) return;
    const target =
      (this.editor.store.data.bodies ?? []).findIndex((b) => b.id === this.bodies[0]?.id) + 1;
    this.widget.update(
      this.operation,
      `Body ${target}`,
      this.editor.blocked,
      this.valid,
      this.count,
      this.collecting,
      this.bodies,
      (this.editor.store.data.bodies ?? []).flatMap((body, index) =>
        this.editor.visibility.visible(body.id) ? [{ body, number: index + 1 }] : [],
      ),
    );
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
