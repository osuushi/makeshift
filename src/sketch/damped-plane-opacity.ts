/** Exact critically damped spring: target changes preserve opacity and velocity. */
export function dampPlaneOpacity(
  opacity: number,
  velocity: number,
  target: number,
  elapsed: number,
  smoothMilliseconds: number,
): { opacity: number; velocity: number } {
  if (smoothMilliseconds === 0) return { opacity: target, velocity: 0 };
  const time = Math.max(0, elapsed);
  const omega = 2 / smoothMilliseconds;
  const difference = opacity - target;
  const impulse = velocity + omega * difference;
  const decay = Math.exp(-omega * time);
  const next = target + (difference + impulse * time) * decay;
  const nextVelocity = (velocity - omega * impulse * time) * decay;
  if (Math.abs(next - target) < 0.001 && Math.abs(nextVelocity) * smoothMilliseconds < 0.001)
    return { opacity: target, velocity: 0 };
  // A reversed target can leave outward momentum at a physical opacity bound.
  if (next < 0 || next > 1) return { opacity: Math.max(0, Math.min(1, next)), velocity: 0 };
  return { opacity: next, velocity: nextVelocity };
}
