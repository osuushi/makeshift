import { type BenchEdit, type BenchTab, type Drawing, singleBench } from "../model/benches.js";
import { validName } from "../security/text.js";
import { newId } from "../sketch/document.js";
import { DocumentStore } from "./document-store.js";

/** The owner keeps one accepted snapshot and history per bench in the open drawing. */
export class DrawingBenches {
  private entries: { tab: BenchTab; store: DocumentStore }[];
  active: string;

  constructor(drawing = singleBench({ units: "mm", sketches: [] })) {
    this.entries = drawing.benches.map(({ id, name, document }) => ({
      tab: { id, name },
      store: new DocumentStore(document),
    }));
    this.active = drawing.activeBench;
  }

  get store() {
    return this.entry(this.active).store;
  }

  get tabs(): BenchTab[] {
    return this.entries.map((entry) => entry.tab);
  }

  snapshot(activeDocument = this.store.data): Drawing {
    return {
      activeBench: this.active,
      benches: this.entries.map(({ tab, store }) => ({
        ...tab,
        document: tab.id === this.active ? activeDocument : store.data,
      })),
    };
  }

  edit(edit: BenchEdit): void {
    switch (edit.action) {
      case "create": {
        const names = new Set(this.tabs.map(({ name }) => name));
        let number = this.entries.length + 1;
        while (names.has(`Bench ${number}`)) number++;
        const tab = { id: newId(), name: `Bench ${number}` };
        const store = new DocumentStore({
          units: "mm",
          sketches: [],
          sketchGrid: this.store.data.sketchGrid,
        });
        this.entries.push({ tab, store });
        this.active = tab.id;
        break;
      }
      case "switch":
        this.active = this.entry(edit.id).tab.id;
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

  private entry(id: string) {
    const entry = this.entries.find(({ tab }) => tab.id === id);
    if (!entry) throw new Error("Drawing bench not found");
    return entry;
  }
}
