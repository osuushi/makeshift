import { type BenchEdit, type BenchTab, type Drawing, singleBench } from "../model/benches.js";
import { type InlineLink, type SmartObject, validateSmartLinks } from "../model/smart-object.js";
import { validName } from "../security/text.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { DocumentStore } from "./document-store.js";

/** The owner keeps one accepted snapshot and history per bench in the open drawing. */
export class DrawingBenches {
  private entries: { tab: BenchTab; store: DocumentStore }[];
  active: string;
  private path: InlineLink[] = [];

  constructor(drawing = singleBench({ units: "mm", sketches: [] })) {
    this.entries = drawing.benches.map(({ id, name, document }) => ({
      tab: { id, name },
      store: this.createStore(id, document),
    }));
    this.active = drawing.activeBench;
  }

  get store() {
    return this.entry(this.editing).store;
  }

  get editing(): string {
    return this.path.at(-1)?.placement.source ?? this.active;
  }

  get inline(): readonly InlineLink[] {
    return this.path;
  }

  get tabs(): BenchTab[] {
    return this.entries.map((entry) => entry.tab);
  }

  snapshot(activeDocument = this.store.data, editing = this.editing): Drawing {
    return {
      activeBench: this.active,
      benches: this.entries.map(({ tab, store }) => ({
        ...tab,
        document: tab.id === editing ? activeDocument : store.data,
      })),
    };
  }

  edit(edit: BenchEdit): void {
    switch (edit.action) {
      case "create": {
        const tab = this.add("Bench", {
          units: "mm",
          sketches: [],
          sketchGrid: this.store.data.sketchGrid,
        });
        this.focus(tab.id);
        break;
      }
      case "switch":
        this.focus(edit.id);
        break;
      case "rename": {
        if (!validName(edit.name)) throw new Error("Enter a valid bench name");
        const entry = this.entry(edit.id);
        entry.tab = { ...entry.tab, name: edit.name.trim() };
        break;
      }
      default:
        throw new Error("Unknown bench command");
    }
  }

  document(id: string): SketchDocument {
    return this.entry(id).store.data;
  }

  relatedDocuments(): { id: string; document: SketchDocument }[] {
    const documents: { id: string; document: SketchDocument }[] = [];
    const seen = new Set<string>();
    const pending = [this.active];
    while (pending.length) {
      const id = pending.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const document = this.document(id);
      if (id !== this.editing) documents.push({ id, document });
      for (const object of document.smartObjects ?? []) pending.push(object.source);
    }
    return documents;
  }

  enter(placement: SmartObject): void {
    this.path = [...this.path, { parent: this.editing, placement }];
  }

  exit(): void {
    this.path = this.path.slice(0, -1);
  }

  focus(id: string): void {
    this.active = this.entry(id).tab.id;
    this.path = [];
  }

  convert(
    source: SketchDocument,
    replacement: (source: string) => SketchDocument,
    operation: HistoryOperation,
  ): void {
    const tab = this.add("Smart Object", source);
    try {
      this.store.accept(replacement(tab.id), operation);
    } catch (error) {
      this.entries.pop();
      throw error;
    }
    this.focus(tab.id);
  }

  private add(prefix: string, document: SketchDocument): BenchTab {
    const id = newId();
    const names = new Set(this.tabs.map(({ name }) => name));
    let number = prefix === "Bench" ? this.entries.length + 1 : 1;
    while (names.has(`${prefix} ${number}`)) number++;
    const tab = { id, name: `${prefix} ${number}` };
    this.entries.push({ tab, store: this.createStore(id, document) });
    return tab;
  }

  private createStore(id: string, document: SketchDocument): DocumentStore {
    return new DocumentStore(document, (candidate) =>
      validateSmartLinks(this.snapshot(candidate, id)),
    );
  }

  private entry(id: string) {
    const entry = this.entries.find(({ tab }) => tab.id === id);
    if (!entry) throw new Error("Drawing bench not found");
    return entry;
  }
}
