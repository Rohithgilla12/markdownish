import type React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const INTERACTIVE = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "LABEL",
  "DETAILS",
  "SUMMARY",
]);

/**
 * Window-drag handler for `onMouseDown`.
 *
 * Tauri 2's `data-tauri-drag-region` attribute is the documented path but
 * doesn't reliably wire up under the macOS Overlay title-bar style — clicks
 * on the marked region pass through without starting a drag.
 *
 * The docs also describe a manual fallback using `appWindow.startDragging()`,
 * which is what this helper implements. Apply with `onMouseDown={onDrag}` on
 * any container you want draggable. Clicks that originate from interactive
 * descendants (button, anchor, input, textarea, etc.) are skipped so they
 * still receive their normal click events.
 *
 * Double-click on a drag region toggles maximize, matching native macOS chrome.
 */
export function onDrag(e: React.MouseEvent) {
  if (e.buttons !== 1) return;

  // Walk up from the event target to currentTarget. If any element along
  // the way is interactive, this click is "for" that element — don't drag.
  let el = e.target as HTMLElement | null;
  const stop = e.currentTarget as HTMLElement;
  while (el && el !== stop) {
    if (INTERACTIVE.has(el.tagName)) return;
    // role="button" without a <button> tag — Sidebar's folder picker, etc.
    if (el.getAttribute("role") === "button") return;
    el = el.parentElement;
  }

  if (e.detail === 2) {
    void getCurrentWindow().toggleMaximize();
  } else {
    void getCurrentWindow().startDragging();
  }
}
