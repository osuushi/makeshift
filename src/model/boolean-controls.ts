import { fastTrimChecks } from "../preferences/experimental-settings.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Body, BodyBoolean } from "./body.js";
import { bodyCenter } from "./body-placement.js";
import { BooleanOperands } from "./boolean-operands.js";
import { BooleanPicking } from "./boolean-picking.js";
import { BooleanPreference } from "./boolean-preference.js";
import { BooleanRoleWidgets } from "./boolean-role-widgets.js";
import {
  booleanConsumes,
  booleanRequirement,
  booleanTargets,
  cycleBooleanBody,
  flipBooleanRole,
} from "./boolean-selection.js";
import { booleanStart } from "./boolean-start.js";
import { BooleanWidget } from "./boolean-widget.js";
import type { EntityViewer } from "./entity-viewer.js";

export class BooleanControls {
  private widget: BooleanWidget;
  private roles: BooleanRoleWidgets;
  private picking: BooleanPicking;
  private operands: BooleanOperands;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private bodies: Body[] = [];
  private operation: BodyBoolean = { ids: [], mode: "union", keepOriginals: false };
  private running: Promise<void> | null = null;
  private valid = false;
  private preference = new BooleanPreference();
  private count = 0;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    entities: EntityViewer,
  ) {
    this.operands = new BooleanOperands(editor);
    this.roles = new BooleanRoleWidgets(editor, overlay, (id) => this.flipRole(id));
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
      () => {
        void this.finish();
      },
      () => {
        void this.cancel();
      },
    );
    this.picking = new BooleanPicking(editor, entities, this.abort.signal, {
      active: () => !!this.lease,
      operation: () => this.operation,
      toggle: (body) => this.toggleBody(body),
      flip: (id) => this.flipRole(id),
    });
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        if (
          event.key === "Enter" &&
          event.target instanceof Element &&
          event.target.closest(".boolean-role-widget")
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { signal: this.abort.signal, capture: true },
    );
    editor.world.changed.add(this.update);
  }
  async reopen(operation: BodyBoolean): Promise<void> {
    this.start(operation.mode, operation);
    if (!this.lease) throw new Error("Cannot restore Boolean inputs");
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted Boolean");
    this.editor.world.canvas.focus();
  }
  start = (mode: BodyBoolean["mode"], restored?: BodyBoolean): void => {
    if (this.editor.blocked || this.editor.world.active || this.editor.interactions.current) return;
    const resolution = booleanStart(this.editor);

    this.bodies = restored
      ? restored.ids.flatMap(
          (id) => this.editor.store.data.bodies?.filter((body) => body.id === id) ?? [],
        )
      : resolution.available
        ? resolution.inputs
        : [];
    if (restored && this.bodies.length !== restored.ids.length) return;

    this.lease = this.editor.interactions.acquire(
      "body-boolean",
      () => this.cancel(),
      () => this.finish(true),
      {
        selectsLocally: () => true,
        navigation: "when-released",
        settled: async () => {
          await this.running;
        },
      },
    );
    if (!this.lease) return;
    this.picking.begin();
    this.operation = restored
      ? structuredClone(restored)
      : {
          ids: [],
          targetIds: this.bodies.slice(0, 1).map((body) => body.id),
          mode,
          keepOriginals: this.preference.get(mode),
          experimentalTrimFiltering: fastTrimChecks(),
        };

    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.operation.ids = this.bodies.map((body) => body.id);
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        ids: this.operation.ids,
        mode: this.operation.mode,
        targetIds: this.operation.targetIds,
        experimentalTrimFiltering: this.operation.experimentalTrimFiltering,
      }),
      async (operation) => {
        this.operation = {
          ids: operation.ids,
          targetIds: operation.targetIds,
          mode: operation.mode,
          keepOriginals: this.preference.get(operation.mode),
          experimentalTrimFiltering: operation.experimentalTrimFiltering,
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
  private flipRole(id: string): void {
    this.change(() => {
      this.operation = flipBooleanRole(this.operation, id);
    });
    this.lease?.history?.checkpoint();
  }
  private toggleBody(body: Body): void {
    this.change(() => {
      this.operation = cycleBooleanBody(this.operation, body.id);
      this.bodies = this.operation.ids.flatMap(
        (id) => this.editor.store.data.bodies?.filter((body) => body.id === id) ?? [],
      );
    });
    this.lease?.history?.checkpoint();
  }
  private change(change: () => void): void {
    if (this.editor.blocked || this.lease?.phase !== "editing") return;
    change();
    this.lease.toolId = this.operation.mode;
    this.operation.ids = this.bodies.map((b) => b.id);
    this.editor.modeling.targets = this.operation.ids.map((body) => ({ kind: "body", body }));
    this.operands.show(this.bodies, this.operation.mode, booleanTargets(this.operation));
    this.valid = false;
    this.lease.show(null);
    this.count = 0;
    this.editor.message = "";
    this.editor.notice = "";
    this.running = !booleanRequirement(this.operation) ? this.preview() : null;
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
        this.editor.store.data.bodies?.filter((b) => !booleanConsumes(this.operation, b.id))
          .length ?? 0;
      this.count = (candidate?.bodies?.length ?? 0) - retained;
    }
    this.editor.refresh();
  }
  private async finish(discardIncomplete = false): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease) return false;
    if (discardIncomplete && booleanRequirement(this.operation)) {
      await this.cancel();
      return true;
    }
    if (!this.valid || !lease.close()) return false;
    const consumed = this.operation.ids.filter((id) => booleanConsumes(this.operation, id));
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
    this.picking.end();
    this.widget.root.hidden = true;
    this.editor.notice = this.editor.message = "";
    this.operands.clear();
    this.roles.clear();
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) return;
    this.roles.update(this.operation, this.bodies);
    this.widget.update(
      this.operation,
      this.editor.blocked,
      this.valid,
      this.count,
      this.bodies.length
        ? this.editor.world.project(bodyCenter(this.bodies))
        : { x: innerWidth / 2, y: 80 },
      booleanRequirement(this.operation) ??
        (!this.valid && !this.editor.blocked ? this.editor.message || "" : ""),
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
    this.roles.dispose();
    this.operands.dispose();
  }
}
