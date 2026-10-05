/** Parameter checkpoints for one temporary interaction, never accepted document snapshots. */
export class InteractionHistory<T> {
  private entries: T[];
  private index = 0;
  private restoring = false;
  constructor(
    private read: () => T,
    private restore: (value: T) => void | Promise<void>,
    private changedHistory: () => void = () => {},
  ) {
    this.entries = [structuredClone(read())];
  }
  private get changed(): boolean {
    return JSON.stringify(this.read()) !== JSON.stringify(this.entries[this.index]);
  }
  get canUndo(): boolean {
    return !this.restoring && (this.index > 0 || this.changed);
  }
  get canRedo(): boolean {
    return !this.restoring && !this.changed && this.index < this.entries.length - 1;
  }
  checkpoint(): void {
    if (this.restoring || !this.changed) return;
    this.entries.splice(this.index + 1);
    this.entries.push(structuredClone(this.read()));
    this.index++;
    this.changedHistory();
  }
  async navigate(direction: "undo" | "redo"): Promise<void> {
    if (this.restoring) return;
    this.checkpoint();
    const next = this.index + (direction === "undo" ? -1 : 1);
    if (next < 0 || next >= this.entries.length) return;
    this.changedHistory();
    this.restoring = true;
    try {
      await this.restore(structuredClone(this.entries[next]));
      this.index = next;
    } finally {
      this.restoring = false;
    }
  }
}
