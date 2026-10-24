/** Shared Entities visibility control, including metadata children. */
export function visibilityIcon(visible: boolean): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible ? "" : '<path d="m3 3 18 18"/>'}</svg>`;
}
