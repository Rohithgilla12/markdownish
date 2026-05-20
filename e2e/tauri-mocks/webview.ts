// Mock for `@tauri-apps/api/webview`. Browsers don't fire Tauri's
// `onDragDropEvent`, so we just hand back a no-op subscription.
import "./_window";

type UnlistenFn = () => void;

type DragDropPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

type WebviewLike = {
  onDragDropEvent: (
    cb: (event: { payload: DragDropPayload }) => void,
  ) => Promise<UnlistenFn>;
};

export function getCurrentWebview(): WebviewLike {
  return {
    onDragDropEvent: async (_cb) => () => {},
  };
}
