export function nativeSettings(): { open(): Promise<void> } | undefined {
  return (window as Window & { makeshiftSettings?: { open(): Promise<void> } }).makeshiftSettings;
}
