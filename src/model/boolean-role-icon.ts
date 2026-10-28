/** Symmetric geometry avoids font-dependent baselines and symbol metrics. */
export function booleanRoleIcon(target: boolean): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" focusable="false"><path d="M5 12H19${target ? "M12 5V19" : ""}"/></svg>`;
}
