import { convertFileSrc } from "@tauri-apps/api/core";

const EXTERNAL_PROTO_RE = /^(https?|data|blob|asset|tauri):/i;

/**
 * Resolve an <img src> from a rendered markdown file so it can actually load.
 *
 * Markdown images come in three flavours:
 *   - `https://…`               → already absolute, return as-is
 *   - `/Users/me/pic.png`       → absolute filesystem path, convert via asset://
 *   - `docs/img/pic.png`        → relative to the current file's directory
 *
 * Tauri's asset:// protocol wraps a real filesystem path and lets the webview
 * load it. `convertFileSrc` does that wrapping. The `assetProtocol` block in
 * tauri.conf.json must be enabled for the call to actually return a usable URL.
 */
export function resolveImageSrc(currentFilePath: string, src: string | undefined): string | undefined {
  if (!src) return src;
  const trimmed = src.trim();
  if (!trimmed) return src;
  if (EXTERNAL_PROTO_RE.test(trimmed)) return trimmed;

  // Absolute filesystem path — go straight to asset:// without resolution.
  if (trimmed.startsWith("/")) {
    return convertFileSrc(trimmed);
  }

  // Strip a leading `./` and walk parents for `..`.
  const baseDir = currentFilePath.replace(/[^/\\]+$/, "");
  const parts: string[] = [];
  for (const part of (baseDir + trimmed).split(/[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  const absolute = (baseDir.startsWith("/") ? "/" : "") + parts.join("/");
  return convertFileSrc(absolute);
}
