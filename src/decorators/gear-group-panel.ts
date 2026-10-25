import { entityRows } from "../model/entity-presentation.js";
import { onDecoratorDisplayChange } from "../preferences/decorator-display.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { appendDecoratorDisplay } from "./display-control.js";
import { faceKey } from "./edits.js";
import { gearColor } from "./gear-colors.js";
import { gearGroupMembers, gearGroupProblem } from "./gear-group.js";
import { gearGroupColorControl } from "./gear-group-color-control.js";
import { groupEligible } from "./gear-group-geometry.js";
import { gearDefinition } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

/** Saved membership remains discoverable even with no decorated face selected. */
export function gearGroupPanel(editor: SketchEditor, parent: HTMLElement): () => void {
  const root = document.createElement("section");
  root.className = "decorator-panel gear-groups";
  root.setAttribute("aria-label", "Gear groups");
  parent.prepend(root);
  let key = "",
    expanded: string | null = null;
  let shownDocument = editor.store.data;
  const update = () => {
    const gears = (editor.store.data.decorators ?? []).filter(
      (d) => d.definition === gearDefinition,
    );
    root.hidden =
      !gears.length ||
      !!editor.world.active ||
      editor.interactions.current?.kind === "tag-membership";
    const next = JSON.stringify([
      gears,
      editor.modeling.targets,
      editor.store.busy,
      expanded,
      !!editor.interactions.current,
    ]);
    if (next === key && shownDocument === editor.store.data) return;
    key = next;
    shownDocument = editor.store.data;
    root.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Gear groups";
    root.append(heading);
    const seen = new Set<string>();
    for (const gear of gears) {
      const id = gear.gearGroup ?? gear.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const members = gearGroupMembers(editor.store.data, gear);
      const label = `Gears ${seen.size}`;
      const select = control(
        `${label} · ${members.length} ${members.length === 1 ? "gear" : "gears"}`,
        () => {
          expanded = expanded === id ? null : id;
          editor.modeling.targets = members.flatMap((d) =>
            d.faces.map((f) => ({ kind: "face" as const, ...f })),
          );
          key = "";
          editor.refresh();
        },
      );
      select.setAttribute("aria-expanded", String(expanded === id));
      const swatch = document.createElement("span");
      swatch.className = "gear-group-swatch";
      swatch.style.backgroundColor = gearColor(gear, gears);
      select.prepend(swatch);
      root.append(select);
      if (expanded === id) {
        appendMembers(root, editor, members);
        root.append(gearGroupColorControl(editor, gear, label));
        appendDecoratorDisplay(root, editor, members, `${label} display`);
      }
      appendGroupActions(root, editor, gear, members, label, control);
    }
    appendNewGroup(root, editor, gears, control);
  };
  const control = (label: string, action: () => unknown) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = editor.store.busy || !!editor.interactions.current;
    button.onclick = () =>
      void toolCatalog(editor).activate({ finishEdit: true, reason: () => null, run: action });
    return button;
  };
  editor.world.changed.add(update);
  const disposeDisplay = onDecoratorDisplayChange(() => {
    key = "";
    update();
  });
  update();
  return () => {
    editor.world.changed.delete(update);
    disposeDisplay();
    root.remove();
  };
}

function appendMembers(root: HTMLElement, editor: SketchEditor, members: DecoratorInstance[]) {
  const list = document.createElement("ul");
  list.setAttribute("aria-label", "Gear group members");
  for (const member of members) {
    const item = document.createElement("li");
    const body = editor.store.data.bodies?.find((b) => b.id === member.faces[0].body);
    const cylinder = body?.faces.find((f) => f.id === member.faces[0].face)?.cylinder;
    const name =
      entityRows(
        editor.store.data,
        (editor.store.data.bodies ?? []).map((b) => b.id),
        "Body",
      ).find((row) => row.id === body?.id)?.name ?? "Missing body";
    item.textContent = `${name} · ${member.faces.length} ${member.faces.length === 1 ? "face" : "faces"}${cylinder ? ` · target Ø${Number((2 * cylinder.radius).toFixed(3))} mm · fitted Ø${Number((2 * (member.gearPitchRadius ?? cylinder.radius)).toFixed(3))} mm · ${member.settings.teeth} teeth` : ""}`;
    list.append(item);
  }
  root.append(list);
}

function appendGroupActions(
  root: HTMLElement,
  editor: SketchEditor,
  gear: DecoratorInstance,
  members: DecoratorInstance[],
  label: string,
  control: (label: string, action: () => unknown) => HTMLButtonElement,
) {
  const problem = gearGroupProblem(editor.store.data, gear);
  if (problem) {
    const note = document.createElement("p");
    note.className = "decorator-warning";
    note.textContent = problem;
    root.append(note);
  }
  const selected = editor.modeling.targets.flatMap((t) =>
    t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
  );
  const current = new Set(members.flatMap((d) => d.faces.map(faceKey)));
  if (
    groupEligible(editor.store.data, gear) &&
    selected.length &&
    selected.length === editor.modeling.targets.length &&
    selected.some((f) => !current.has(faceKey(f)))
  ) {
    root.append(
      control(`Add selection to ${label}`, () =>
        editor.store.request({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: [
              ...members.flatMap((d) => d.faces),
              ...selected.filter((f) => !current.has(faceKey(f))),
            ],
            gearGroup: gear.gearGroup,
          },
        }),
      ),
    );
  }
}

function appendNewGroup(
  root: HTMLElement,
  editor: SketchEditor,
  gears: DecoratorInstance[],
  control: (label: string, action: () => unknown) => HTMLButtonElement,
) {
  const selected = editor.modeling.targets.flatMap((t) =>
    t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
  );
  if (
    selected.length &&
    selected.length === editor.modeling.targets.length &&
    gears.some(
      (d) =>
        groupEligible(editor.store.data, d) &&
        d.faces.some((f) => selected.some((s) => faceKey(s) === faceKey(f))),
    )
  )
    root.append(
      control("New gear group from selection", () =>
        editor.store.request({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: selected,
            newGearGroup: true,
          },
        }),
      ),
    );
}
