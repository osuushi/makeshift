export interface CapturedFixture {
  path: string;
  name: string;
  contents: string;
}

declare global {
  interface Window {
    makeshiftFixtureFile?: { drag(): void; reveal(): void };
    makeshiftFixture?: (snapshot: unknown) => Promise<CapturedFixture>;
  }
}

/** Desktop saves through the host; local web development uses Vite. */
export async function saveFixture(snapshot: unknown): Promise<CapturedFixture> {
  if (window.makeshiftFixture) return window.makeshiftFixture(snapshot);
  const response = await fetch("/__makeshift_fixture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
