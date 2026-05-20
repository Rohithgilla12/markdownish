import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { watchImmediate, type UnwatchFn } from "@tauri-apps/plugin-fs";

const MARKDOWN_EXTS = [".md", ".mdx", ".markdown"];
const SKIP_SEGMENTS = new Set(["node_modules", "target", "dist", "build"]);
const DEBOUNCE_MS = 200;

export type WatcherEvent =
  | { kind: "create"; path: string; mtime: number }
  | { kind: "modify"; path: string; mtime: number }
  | { kind: "remove"; path: string };

function pathMatters(path: string): boolean {
  const segments = path.split(/[\\/]/);
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.startsWith(".")) return false;
    if (SKIP_SEGMENTS.has(seg)) return false;
  }
  const last = segments[segments.length - 1] ?? "";
  return MARKDOWN_EXTS.some((ext) => last.toLowerCase().endsWith(ext));
}

type RawEvent = {
  type: unknown;
  paths?: string[];
};

/**
 * Normalises a `tauri-plugin-fs` notify event into one of our high-level
 * kinds. Returns null for events we don't care about (touches without
 * data changes, dir-only events, access events, etc.).
 */
function classify(ev: RawEvent): "create" | "modify" | "remove" | null {
  const t = ev.type;
  if (typeof t === "string") {
    if (t === "any") return "modify";
    return null;
  }
  if (t && typeof t === "object") {
    const obj = t as Record<string, unknown>;
    if ("create" in obj) return "create";
    if ("remove" in obj) return "remove";
    if ("modify" in obj) {
      const mod = obj.modify as Record<string, unknown> | undefined;
      if (mod && "kind" in mod) {
        const kind = mod.kind;
        if (kind === "rename") {
          // notify reports rename as a modify; we treat each affected path
          // independently — the OS will fire a separate remove on the old
          // path and a create on the new one in the recursive watch.
          return "modify";
        }
      }
      return "modify";
    }
  }
  return null;
}

export function useFolderWatcher(
  folder: string | null,
  onEvent: (ev: WatcherEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!folder) return;

    let cancelled = false;
    let unwatch: UnwatchFn | null = null;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const fire = (path: string, kind: "create" | "modify" | "remove") => {
      const existing = pending.get(path);
      if (existing) clearTimeout(existing);
      pending.set(
        path,
        setTimeout(async () => {
          pending.delete(path);
          if (cancelled) return;

          if (kind === "remove") {
            onEventRef.current({ kind: "remove", path });
            return;
          }

          try {
            const mtime = await invoke<number>("stat_mtime", { path });
            if (cancelled) return;
            const isSelf = await invoke<boolean>("is_self_write", { path, mtime });
            if (cancelled || isSelf) return;
            onEventRef.current({ kind, path, mtime });
          } catch {
            // File vanished between event and stat — surface as a remove
            // so an open tab still gets the deletion treatment.
            if (!cancelled) onEventRef.current({ kind: "remove", path });
          }
        }, DEBOUNCE_MS),
      );
    };

    (async () => {
      try {
        unwatch = await watchImmediate(
          folder,
          (event) => {
            const raw = event as unknown as RawEvent;
            const kind = classify(raw);
            if (!kind) return;
            const paths = raw.paths ?? [];
            for (const p of paths) {
              if (!pathMatters(p)) continue;
              fire(p, kind);
            }
          },
          { recursive: true },
        );
        if (cancelled && unwatch) {
          unwatch();
          unwatch = null;
        }
      } catch (err) {
        console.error("useFolderWatcher: failed to start watch", err);
      }
    })();

    return () => {
      cancelled = true;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      if (unwatch) unwatch();
    };
  }, [folder]);
}
