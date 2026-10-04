/** Observe the real deferred pinch snap without changing scheduling or navigation. */
export async function watchWidgetNavigation(page) {
  await page.evaluate(async () => {
    const { TrackpadSnap } = await import("/trackpad-snap.ts");
    const original = TrackpadSnap.prototype.postpone;
    let current = null;
    TrackpadSnap.prototype.postpone = function (...args) {
      current = this;
      return original.apply(this, args);
    };
    window.widgetNavigationState = () => ({
      observed: current !== null,
      pending: current?.pending ?? false,
      held: current?.held ?? false,
    });
    window.widgetNavigationRestore = () => {
      TrackpadSnap.prototype.postpone = original;
      delete window.widgetNavigationState;
      delete window.widgetNavigationRestore;
    };
  });
}
export async function waitWidgetNavigation(page) {
  await page.waitForFunction(() => {
    const snap = window.widgetNavigationState();
    return snap.observed && !snap.pending && !snap.held && !window.makeshiftInspect().camera.moving;
  });
}
export async function restoreWidgetNavigation(page) {
  await page.evaluate(() => window.widgetNavigationRestore?.());
}
