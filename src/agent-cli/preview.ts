import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { request } from "./request.js";

/** Presets copy assets with the CLI caller's permissions, never through host IPC. */
export async function runPreview(json: string | undefined): Promise<unknown> {
  if (!json)
    throw new Error('Usage: makeshift preview \'{"action":"open","directory":"preview"}\'');
  const input = JSON.parse(json);
  if (input.action !== "image" && input.action !== "annotate") return request("preview", json);
  if (typeof input.path !== "string") throw new Error("Expected an image path.");
  const extension = extname(input.path).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(extension))
    throw new Error("Use PNG, JPEG, WebP, GIF or SVG.");
  const directory = join(process.cwd(), "previews", randomUUID());
  await mkdir(directory, { recursive: true });
  await copyFile(resolve(input.path), join(directory, `image${extension}`));
  await writeFile(join(directory, "index.html"), imagePage(extension, input.action === "annotate"));
  return request(
    "preview",
    JSON.stringify({ action: "open", directory, title: input.title ?? "Image" }),
  );
}

export function imagePage(extension: string, annotate: boolean): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
html,body{height:100%}body{margin:0;font:14px system-ui;background:#fafafa;color:#222;display:flex;flex-direction:column;align-items:center;justify-content:center}main{${annotate ? "" : "width:100%;height:100%;"}position:relative;min-height:0;max-width:100%;display:flex;align-items:center;justify-content:center}img{display:block;max-width:100vw;max-height:${annotate ? "calc(100vh - 140px)" : "100vh"};${annotate ? "width:auto;height:auto" : "width:100%;height:100%;object-fit:contain"}}footer{box-sizing:border-box;width:100%;flex:none}svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none}footer{padding:12px}textarea{width:95%;min-height:50px}
</style><main><img src="image${extension}" alt="Preview image">${annotate ? '<svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Draw annotations"></svg>' : ""}</main>
${
  annotate
    ? `<footer>Draw on the image; add a note.<br><textarea aria-label="Annotation note"></textarea><button>Clear marks</button><output aria-live="polite"></output></footer>
<script>
const svg=document.querySelector('svg'), note=document.querySelector('textarea'), status=document.querySelector('output');
let data={strokes:[],note:''}, active=null;
function render(){svg.replaceChildren();for(const points of data.strokes){const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',points.map(p=>p.join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#e33');line.setAttribute('stroke-width','.005');svg.append(line)}note.value=data.note}
async function save(){status.textContent='Saving…';try{await preview.write(data);status.textContent='Saved'}catch(e){status.textContent=e.message}}
async function read(){const value=await preview.read();data={strokes:value.strokes??[],note:value.note??''};render()}
function point(e){const r=svg.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.x)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.y)/r.height))]}
svg.onpointerdown=e=>{svg.setPointerCapture(e.pointerId);active=[point(e)];data.strokes.push(active);render()};
svg.onpointermove=e=>{if(active){active.push(point(e));render()}};
svg.onpointerup=svg.onpointercancel=()=>{active=null;save()};
note.oninput=()=>{data.note=note.value;save()};document.querySelector('button').onclick=()=>{data.strokes=[];render();save()};
preview.onTrigger(name=>{if(name==='data')read().catch(e=>status.textContent=e.message)});read().catch(e=>status.textContent=e.message);
</script>`
    : ""
}`;
}
