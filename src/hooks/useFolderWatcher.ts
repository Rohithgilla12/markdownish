import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { watchImmediate, type UnwatchFn } from "@tauri-apps/plugin-fs";

const MARKDOWN_EXTS = [".md", ".mdx", ".markdown"];
const SKIP_SEGMENTS = new Set(["node_modules", "target", "dist", "build"]);
const DEBOUNCE_MS = 200;
/** Structural events coalesce harder — a `git checkout` fires hundreds. */
const TREE_DEBOUNCE_MS = 250;

/** An event about one specific markdown file, fanned out to open tabs. */
export type FileEvent =
  | { kind: "create"; path: string; mtime: number }
  | { kind: "modify"; path: string; mtime: number }
  | { kind: "remove"; path: string };

export type WatcherEvent =
  | FileEvent
  /** Something appeared/vanished/moved under the folder — re-read the tree. */
  | { kind: "tree" };

function splitPath(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

/**
 * Segments of `path` below `root`, or null if `path` isn't under `root`.
 *
 * Only the part *below* the watched folder may be filtered on. Checking the
 * whole absolute path meant a single dot-prefixed ancestor — opening
 * `~/.claude/skills`, say — matched the hidden-file rule and dropped every
 * event for the entire folder.
 */
function relativeSegments(path: string, root: string): string[] | null {
  const p = splitPath(path);
  const r = splitPath(root);
  if (p.length <= r.length) return null;
  for (let i = 0; i < r.length; i++) {
    if (p[i] !== r[i]) return null;
  }
  return p.slice(r.length);
}

/** True if none of the segments are hidden or in a build/vendor directory. */
function isVisible(segments: string[]): boolean {
  return segments.every((seg) => !seg.startsWith(".") && !SKIP_SEGMENTS.has(seg));
}

function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTS.some((ext) => lower.endsWith(ext));
}

type RawEvent = {
  type: unknown;
  paths?: string[];
};

let warnedUnknown = false;

type Classified = {
  kind: "create" | "modify" | "remove";
  /**
   * Whether the event could have changed the *shape* of the tree rather than
   * just the bytes of a file we already know about. Structural events trigger
   * a `read_tree`; they're evaluated for directories and non-markdown paths
   * too, because macOS FSEvents coalesces aggressively — a
   * `mkdir docs && mv notes.md docs/` can surface as a bare directory event
   * with no per-file follow-up. A stale sidebar is worse than a spare
   * `read_tree`.
   */
  structural: boolean;
};

/**
 * Normalises a `tauri-plugin-fs` notify event into one of our high-level
 * kinds. Returns null for events we don't care about (touches without
 * data changes, access events, etc.).
 */
function classify(ev: RawEvent): Classified | null {
  const t = ev.type;
  if (typeof t === "string") {
    // `any` carries no detail, so assume the worst on both axes.
    if (t === "any") return { kind: "modify", structural: true };
    return null;
  }
  if (t && typeof t === "object") {
    const obj = t as Record<string, unknown>;
    if ("create" in obj) return { kind: "create", structural: true };
    if ("remove" in obj) return { kind: "remove", structural: true };
    if ("modify" in obj) {
      const mod = obj.modify as Record<string, unknown> | undefined;
      // notify reports renames as a modify. Each affected path is handled
      // independently — the OS fires a separate event for the old and new
      // names in a recursive watch — but either way the tree moved.
      const renamed = mod?.kind === "rename";
      return { kind: "modify", structural: renamed };
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
    let treeTimer: ReturnType<typeof setTimeout> | null = null;

    const fireTree = () => {
      if (treeTimer) clearTimeout(treeTimer);
      treeTimer = setTimeout(() => {
        treeTimer = null;
        if (!cancelled) onEventRef.current({ kind: "tree" });
      }, TREE_DEBOUNCE_MS);
    };

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
        // The fs plugin scope-checks `watch`, and the capability file can't
        // name a folder that's only known at runtime. Widen the scope to
        // exactly this folder first, or the watch is rejected outright.
        await invoke("allow_folder", { path: folder });
      } catch (err) {
        console.error("useFolderWatcher: could not extend fs scope", err);
      }
      if (cancelled) return;

      try {
        unwatch = await watchImmediate(
          folder,
          (event) => {
            const raw = event as unknown as RawEvent;
            const classified = classify(raw);
            if (!classified) {
              if (!warnedUnknown && raw.paths && raw.paths.length > 0) {
                warnedUnknown = true;
                console.warn(
                  "useFolderWatcher: unrecognised plugin event shape — events with paths are being dropped. The plugin schema may have changed.",
                  raw,
                );
              }
              return;
            }
            const paths = raw.paths ?? [];
            for (const p of paths) {
              const segments = relativeSegments(p, folder);
              if (!segments || !isVisible(segments)) continue;

              if (classified.structural) fireTree();

              const name = segments[segments.length - 1] ?? "";
              if (isMarkdown(name)) fire(p, classified.kind);
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
      if (treeTimer) clearTimeout(treeTimer);
      if (unwatch) unwatch();
    };
  }, [folder]);
}
