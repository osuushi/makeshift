---
name: makeshift-previews
description: Show images, documents, diagrams or small interactive apps in the Makeshift document window, and collect detailed user input for the agent or scripts.
---

Use this for showing images to the user (Blender renders, generated or processed
images), annotated diagrams, document previews, and custom input such as a bearing
profile editor. Create ordinary static HTML/CSS/JavaScript in the drawing workspace.
One pane per desktop document; opening replaces the current pane. The default content
size is 640×480 CSS pixels. Design responsively. Users can drag its header, resize,
collapse and close it. No build system is required.

Quick presets (paths are resolved by the CLI, copied into the workspace):

    makeshift preview '{"action":"image","path":"render.png","title":"Rendered bearing"}'
    makeshift preview '{"action":"annotate","path":"diagram.png"}'

Custom apps: create `preview/index.html` and local assets, then:

    makeshift preview '{"action":"open","directory":"preview","title":"Bearing profile"}'

The directory must be inside this drawing's workspace. Local relative assets work;
network access, Node, CAD APIs, external navigation and device permissions are unavailable.
Render documents as HTML or images. Avoid remote fonts/libraries. This is a static
app, not a server. The API available in the page is:

    const data = await window.preview.read(); // {} if data.json is absent
    await window.preview.write({profile: points, note: "ready"});
    const unsubscribe = window.preview.onTrigger(async (name, detail) => {
      if (name === "data") render(await window.preview.read());
    });

Writes replace the complete JSON value atomically (1 MiB maximum); await them and
show save errors. Store durable input on change, not just at unload. `data.json` in
the app directory is ordinary JSON: agents can inspect it, and scripts can read it
directly without routing input through the model. No geometry changes occur until
a separate modeling script consumes the input. Files travel with the drawing on
Save, outside geometry Undo. Coordinate image annotations are normalized 0–1.

Controls (use sequential calls):

    makeshift preview '{"action":"read"}'
    makeshift preview '{"action":"reload"}'
    makeshift preview '{"action":"trigger","name":"data"}'
    makeshift preview '{"action":"trigger","name":"custom","detail":{"value":2}}'
    makeshift preview '{"action":"eval","code":"document.title"}'
    makeshift preview '{"action":"screenshot"}'
    makeshift preview '{"action":"close"}'

Reload after editing source. After a script edits data.json, trigger `data` so the
page rereads it. Coordinate file edits with user editing; whole-value writes are
last-writer-wins. Eval runs only inside the preview page. Screenshot returns a
PNG path at the current content size, including while collapsed, preserving live
page state. Open that PNG with your image viewer to inspect what the user sees.
Screenshots are temporary launch files; copy into the workspace if needed later.
Closing/replacing a document closes the pane. Reopen from its saved app directory.
