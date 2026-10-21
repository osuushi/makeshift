/** One deliberate two-finger twist becomes one quarter turn, until the gesture ends. */
export class QuarterTurn {
  private angle = 0;
  private fired = false;
  constructor(private readonly threshold = Math.PI / 18) {}
  reset(): void {
    this.angle = 0;
    this.fired = false;
  }
  update(radians: number): number {
    if (this.fired || !Number.isFinite(radians)) return 0;
    this.angle += radians;
    if (Math.abs(this.angle) < this.threshold) return 0;
    this.fired = true;
    return (Math.sign(this.angle) * Math.PI) / 2;
  }
}
