// Geometry suites use a moving document fixture. Lifecycle suites use raw Pages
// to assert that New/Open preserve the previous window and its accepted state.
const fixtures = new WeakMap();
export function documentTestPage(page, session) {
  const fixture = { page, session, listeners: [], timeout: 30000 };
  const proxy = new Proxy(page, {
    get(_target, property) {
      if (property === "addInitScript")
        return (script, argument) => fixture.page.context().addInitScript(script, argument);
      if (property === "setDefaultTimeout")
        return (timeout) => {
          fixture.timeout = timeout;
          fixture.page.setDefaultTimeout(timeout);
        };
      if (property === "on")
        return (event, listener) => {
          fixture.listeners.push([event, listener]);
          fixture.page.on(event, listener);
          return proxy;
        };
      const value = fixture.page[property];
      return typeof value === "function" ? value.bind(fixture.page) : value;
    },
  });
  fixtures.set(proxy, fixture);
  return proxy;
}
export function documentFixture(page) {
  return fixtures.get(page);
}
export async function followDocument(page, next) {
  const fixture = fixtures.get(page);
  if (!fixture) throw new Error("Expected a moving Electron document fixture");
  const previous = fixture.page;
  const viewport = previous.viewportSize();
  next.setDefaultTimeout(fixture.timeout);
  if (viewport) await next.setViewportSize(viewport);
  fixture.page = next;
  for (const [event, listener] of fixture.listeners) next.on(event, listener);
  await next.waitForFunction(() => !!window.makeshiftInspect);
  // This fixture deliberately drops the previous case through ordinary Close.
  // Native lifecycle tests control their own prompts instead.
  if (previous !== next && !previous.isClosed()) {
    const closed = previous.waitForEvent("close");
    await previous
      .evaluate(() => window.makeshiftDocument.command("close"))
      .catch((error) => {
        if (!previous.isClosed()) throw error;
      });
    await closed;
  }
}
