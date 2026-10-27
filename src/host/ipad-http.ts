import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
};
/** Only built frontend assets are public. Document/host access requires the paired socket. */
export async function serveIPad(root: string, request: IncomingMessage, response: ServerResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.startsWith(resolve(root) + sep)) {
      response.writeHead(404).end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", types[extname(path)] ?? "application/octet-stream");
    response.setHeader("Accept-Ranges", "bytes");
    let start = 0,
      end = info.size - 1;
    // WebKit probes byte ranges before playing inline MP4 startup media.
    if (request.headers.range && request.method === "GET") {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = info.size;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
        response.setHeader("Content-Range", `bytes */${info.size}`);
        response.writeHead(416).end();
        return;
      }
      response.statusCode = 206;
      response.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
    }
    response.setHeader("Content-Length", Math.max(0, end - start + 1));
    if (request.method === "HEAD") response.end();
    else
      createReadStream(path, info.size ? { start, end } : undefined)
        .on("error", () => response.destroy())
        .pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}
