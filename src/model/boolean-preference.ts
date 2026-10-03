import type { BodyBoolean } from "./body.js";

type Mode = BodyBoolean["mode"];
/** Window preferences never participate in document or temporary-edit history. */
export class BooleanPreference {
  private choices = new Map<Mode, boolean>();
  get(mode: Mode): boolean {
    if (!this.choices.has(mode)) {
      let value = false;
      try {
        value = localStorage.getItem(`makeshift.boolean.${mode}.keep-originals`) === "true";
      } catch {
        // Private browsing or unavailable storage still permits this window's choice.
      }
      this.choices.set(mode, value);
    }
    return this.choices.get(mode) ?? false;
  }
  set(mode: Mode, keep: boolean): void {
    this.choices.set(mode, keep);
    try {
      localStorage.setItem(`makeshift.boolean.${mode}.keep-originals`, String(keep));
    } catch {
      // Preserve the in-memory choice if persistence is unavailable.
    }
  }
}
