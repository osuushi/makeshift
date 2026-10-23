import assert from "node:assert/strict";
import test from "node:test";

test("system default, overrides, denied storage, live OS changes and cross-window preferences", async () => {
  let saved: string | null = null;
  let denied = false;
  const media = {
    matches: true,
    addEventListener: (_: string, callback: () => void) => {
      changed = callback;
    },
  };
  let changed = () => {};
  let storage = (_: { key: string | null; newValue: string | null }) => {};
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const globals = {
    matchMedia: () => media,
    localStorage: {
      getItem: () => {
        if (denied) throw new Error("denied");
        return saved;
      },
      setItem: (_: string, value: string) => {
        if (denied) throw new Error("denied");
        saved = value;
      },
    },
    document: { documentElement: root, querySelector: () => null },
    window: {
      addEventListener: (_: string, callback: typeof storage) => {
        storage = callback;
      },
    },
  };
  const original = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    const url = new URL("../src/preferences/theme.js", import.meta.url).href;
    const theme: typeof import("../src/preferences/theme.js") = await import(`${url}?preferences`);
    assert.equal(theme.themePreference(), "system");
    assert.equal(root.dataset.theme, "dark");
    let notifications = 0;
    const dispose = theme.onThemeChange(() => notifications++);
    media.matches = false;
    changed();
    assert.equal(root.dataset.theme, "light");
    theme.setThemePreference("dark");
    changed();
    assert.equal(root.dataset.theme, "dark");
    assert.equal(saved, "dark");
    const reloaded: typeof theme = await import(`${url}?reload`);
    assert.equal(reloaded.themePreference(), "dark");
    denied = true;
    theme.setThemePreference("light");
    assert.equal(theme.colorTheme(), "light");
    const privateMode: typeof theme = await import(`${url}?private`);
    assert.equal(privateMode.themePreference(), "system");
    storage({ key: "makeshift.theme", newValue: "dark" });
    assert.equal(privateMode.colorTheme(), "dark");
    storage({ key: "makeshift.theme", newValue: "invalid" });
    assert.equal(privateMode.themePreference(), "system");
    storage({ key: null, newValue: null });
    assert.equal(privateMode.colorTheme(), "light");
    assert.equal(notifications, 3);
    dispose();
    Object.defineProperty(globalThis, "matchMedia", { value: undefined, configurable: true });
    const fallback: typeof theme = await import(`${url}?unsupported`);
    assert.equal(fallback.colorTheme(), "light");
    fallback.setThemePreference("dark");
    assert.equal(fallback.colorTheme(), "dark");
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
