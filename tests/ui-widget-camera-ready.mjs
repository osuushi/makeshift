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
export async function waitWidgetNavigation(page, requirePinch = false) {
  // Ordinary pans are unrecorded and schedule no snap; pinch still must be observed.
  await page.waitForFunction((requirePinch) => {
    const snap = window.widgetNavigationState();
    const camera = window.makeshiftInspect().camera;
    return (
      (!requirePinch || snap.observed) &&
      !snap.pending &&
      !snap.held &&
      !camera.moving &&
      !camera.navigationPending
    );
  }, requirePinch);
}
export async function restoreWidgetNavigation(page) {
  await page.evaluate(() => window.widgetNavigationRestore?.());
}
