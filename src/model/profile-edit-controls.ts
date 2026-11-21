import { completeInteraction } from "../sketch/complete-interaction.js";
import { curveBounds } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { planarFraming } from "../sketch/profile-framing.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { type CameraState, captureCamera } from "./camera-state.js";
import { profileReferences } from "./profile-edit-references.js";
import { flatProfileCap, type ProfileSelection } from "./revolved-profile.js";
import "./profile-edit.css";

interface ProfileViewport {
  selection: SketchEditor["modeling"]["targets"];
  camera: CameraState;
  section: SketchEditor["world"]["crossSection"];
}

function confirmDiscard(): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.className = "profile-discard";
  dialog.setAttribute("aria-label", "Discard profile changes?");
  dialog.innerHTML = `<h2>Discard profile changes?</h2>
    <form method="dialog">
      <button value="keep" autofocus>Keep editing</button>
      <button value="discard">Discard changes</button>
    </form>`;
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(dialog.returnValue === "discard");
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}

export class ProfileEditControls {
  private readonly keys = new AbortController();
  private group = document.createElement("div");
  private apply = document.createElement("button");
  private cancel = document.createElement("button");
  private align = document.createElement("button");
  private feedback = document.createElement("span");
  private disposeTool: () => void;
  private disposeAlign: () => void;
  private disposeReferences: () => void;
  private previous?: ProfileViewport;
  private closing = false;
  private previewDelay?: ReturnType<typeof setTimeout>;
  private previewSlow = false;

  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    const tools = toolCatalog(editor);
    this.disposeTool = tools.register({
      id: "edit-profile",
      category: "Solid",
      label: "Edit Profile",
      description: "Edit the contour of a turned body or through-bore",
      aliases: ["revolve profile", "lathe profile", "edit revolution"],
      reason: () =>
        idleReason(editor) ??
        (this.selection() ? null : "Select a turned body or one of its faces in Modeling"),
      run: () => this.begin(),
    });
    this.disposeAlign = tools.register({
      id: "look-at-profile",
      category: "View",
      label: "Look at Profile",
      description: "Align the camera with the active profile plane",
      aliases: ["head on", "normal to profile"],
      shortcut: "⌘Enter",
      finishEdit: false,
      reason: () => (editor.store.profileEdit ? idleReason(editor) : "Open Edit Profile first"),
      run: () => this.lookAtProfile(),
    });
    this.group.className = "profile-edit-controls";
    this.group.setAttribute("role", "group");
    this.group.setAttribute("aria-label", "Edit Profile");
    this.feedback.setAttribute("aria-live", "polite");
    this.apply.type = this.cancel.type = this.align.type = "button";
    this.apply.textContent = "Apply";
    this.cancel.textContent = "Cancel";
    this.align.textContent = "Look at Profile";
    this.apply.onclick = () => void this.finish(true);
    this.cancel.onclick = editor.cancelProfileEdit = () => void this.finish(false);
    this.align.onclick = () => void tools.invoke("look-at-profile");
    this.group.append(this.feedback, this.apply, this.cancel, this.align);
    this.disposeReferences = profileReferences(editor, overlay);
    overlay.append(this.group);
    editor.world.canExitWorkspace = () => !editor.store.profileEdit;
    editor.world.fullSketchSection = () => !!editor.store.profileEdit;
    editor.world.changed.add(this.update);
    onModelKeydown(this.enter, { signal: this.keys.signal });
    this.update();
  }

  private enter = (event: KeyboardEvent): void => {
    const e = this.editor;
    if (
      event.key !== "Enter" ||
      event.defaultPrevented ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      !e.store.profileEdit ||
      e.interactions.current ||
      e.isDragging ||
      e.pointMenu ||
      e.world.orbit.active ||
      (event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, button, a, [contenteditable], [role=button]",
        ))
    )
      return;
    event.preventDefault();
    void this.finish(true);
  };

  private selection(): ProfileSelection | null {
    const e = this.editor;
    if (e.world.active || e.store.profileEdit) return null;
    const [first, ...rest] = e.modeling.targets;
    if (!first) return null;
    if (first.kind === "body" && !rest.length) return { body: first.body, faces: [] };
    if (first.kind !== "face") return null;
    const faces = [first.face];
    for (const target of rest) {
      if (target.kind !== "face" || target.body !== first.body) return null;
      faces.push(target.face);
    }
    return { body: first.body, faces };
  }

  private async begin(): Promise<boolean> {
    const e = this.editor;
    const selection = this.selection();
    if (!selection) return false;
    const previous = this.viewport();
    if (!(await e.store.request({ kind: "begin-profile-edit", selection }))) return false;
    return this.showProfile(previous);
  }

  reopen(): void {
    if (!this.showProfile(this.viewport())) throw new Error("Could not restore Edit Profile");
  }

  private viewport(): ProfileViewport {
    const e = this.editor;
    return {
      selection: e.modeling.targets.slice(),
      camera: captureCamera(e.world),
      section: e.world.crossSection,
    };
  }

  private showProfile(previous: ProfileViewport): boolean {
    const e = this.editor;
    const profile = e.store.profileEdit;
    if (!profile) return false;
    this.previous = previous;
    const { sketch, height } = profile;
    const points = sketch.curves.flatMap(curveBounds);
    const radius = Math.max(...points.map((point) => Math.abs(point.x)));
    const framing = planarFraming(e, sketch.plane, [...points, { x: -radius, y: height / 2 }]);
    e.world.crossSection = null;
    e.modeling.targets = [];
    e.modeling.alternatives = [];
    e.modeling.hover = null;
    e.tool = "select";
    e.world.navigation.withoutRecording(() =>
      e.world.enterWorkspace(
        { key: "Edit Profile", frame: sketch.plane, sketchId: sketch.id },
        framing,
      ),
    );
    const sides = sketch.curves.filter((curve) => !flatProfileCap(curve));
    e.select(sides.map((curve) => curve.id));
    e.world.canvas.focus();
    e.refresh();
    return true;
  }

  private lookAtProfile(): boolean {
    const { world } = this.editor;
    const { workspace } = world;
    if (!workspace || world.orbit.active) return false;
    world.navigation.withoutRecording(() => world.enterWorkspace(workspace));
    world.canvas.focus();
    return true;
  }

  private async finish(apply: boolean): Promise<void> {
    const e = this.editor;
    const profile = e.store.profileEdit;
    if (!profile || this.closing || e.blocked || e.isDragging) return;
    this.closing = true;
    try {
      if (
        !apply &&
        (profile.canUndo || profile.canRedo || profile.draft) &&
        !(await confirmDiscard())
      ) {
        e.world.canvas.focus();
        return;
      }
      if (apply) {
        if (!(await completeInteraction(e)) || e.store.profileEdit?.error) return;
      } else await e.interactions.cancel();
      const finished = await e.store.request({
        kind: apply ? "apply-profile-edit" : "cancel-profile-edit",
      });
      if (!finished) return;
      const applied = apply ? e.store.appliedProfile : undefined;
      const body = e.store.acceptedData.bodies?.find((body) => body.id === applied?.body);
      const previous = this.previous;
      this.previous = undefined;
      e.world.crossSection = previous?.section ?? null;
      e.world.navigation.withoutRecording(() => {
        e.world.exit();
        if (previous) e.world.animateCamera(previous.camera);
      });
      const selection = previous?.selection ?? [];
      const surviving = body
        ? selection.filter(
            (target) =>
              target.kind === "face" && body.faces.some((face) => face.id === target.face),
          )
        : selection;
      e.modeling.targets =
        body && !surviving.length ? [{ kind: "body", body: body.id }] : surviving;
      if (applied?.removedDimples) e.notice = this.removed(applied.removedDimples);
      e.world.canvas.focus();
    } finally {
      this.closing = false;
      e.refresh();
    }
  }

  private removed(count: number): string {
    return `${count} ${count === 1 ? "dimple" : "dimples"} removed`;
  }

  private update = (): void => {
    const e = this.editor;
    const profile = e.store.profileEdit;
    this.group.hidden = !profile || !e.world.active;
    this.updatePreviewProgress(!!profile?.pending && !this.group.hidden);
    if (this.group.hidden || !profile) return;
    const unavailable = this.closing || e.blocked || e.isDragging;
    this.apply.disabled = unavailable || !!profile.error;
    this.cancel.disabled = unavailable;
    this.align.disabled = unavailable || !!idleReason(e);
    const text =
      profile.error ||
      (profile.pending
        ? this.previewSlow
          ? "Updating solid…"
          : ""
        : profile.removedDimples
          ? this.removed(profile.removedDimples)
          : "");
    if (this.feedback.textContent !== text) this.feedback.textContent = text;
    this.feedback.hidden = !text;
    this.feedback.classList.toggle("profile-error", !!profile.error);
  };

  private updatePreviewProgress(pending: boolean): void {
    if (!pending) {
      clearTimeout(this.previewDelay);
      this.previewDelay = undefined;
      this.previewSlow = false;
    } else if (!this.previewDelay && !this.previewSlow) {
      this.previewDelay = setTimeout(() => {
        this.previewDelay = undefined;
        this.previewSlow = true;
        this.update();
      }, 500);
    }
  }

  dispose(): void {
    clearTimeout(this.previewDelay);
    this.keys.abort();
    this.editor.world.changed.delete(this.update);
    this.disposeTool();
    this.disposeAlign();
    this.disposeReferences();
    this.group.remove();
  }
}
