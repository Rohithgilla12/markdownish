mod commands;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_cli::CliExt;

/// Event payload for "open-path" — sent both at launch and at RunEvent::Opened.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OpenPath {
    folder: String,
    file: Option<String>,
}

/// One-shot launch state. The frontend pulls this on mount via `take_launch_folder`.
#[derive(Default)]
struct LaunchState(Mutex<Option<OpenPath>>);

fn resolve_open(p: &Path) -> Option<OpenPath> {
    if p.is_dir() {
        Some(OpenPath { folder: p.to_string_lossy().to_string(), file: None })
    } else if p.is_file() {
        let parent = p.parent()?;
        Some(OpenPath {
            folder: parent.to_string_lossy().to_string(),
            file: Some(p.to_string_lossy().to_string()),
        })
    } else {
        None
    }
}

/// Resolve a possibly-relative path against the user's CWD. CLI args usually come in as
/// relative paths (e.g. `md .`) so we need to make them absolute before emitting.
fn absolutise(raw: &str) -> PathBuf {
    let p = PathBuf::from(raw);
    if p.is_absolute() {
        p
    } else if let Ok(cwd) = std::env::current_dir() {
        cwd.join(p)
    } else {
        p
    }
}

#[tauri::command]
fn take_launch_folder(state: tauri::State<'_, LaunchState>) -> Option<OpenPath> {
    state.0.lock().ok().and_then(|mut s| s.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_cli::init())
        .manage(LaunchState::default())
        .invoke_handler(tauri::generate_handler![
            commands::read_tree,
            commands::read_text_file,
            commands::write_text_file,
            take_launch_folder,
        ])
        .setup(|app| {
            // Read the optional `path` positional argument and stash it for the frontend
            // to claim once the window is ready.
            if let Ok(matches) = app.cli().matches() {
                if let Some(arg) = matches.args.get("path") {
                    if let Some(raw) = arg.value.as_str() {
                        let resolved = absolutise(raw);
                        if let Some(open) = resolve_open(&resolved) {
                            let state = app.state::<LaunchState>();
                            let guard = state.0.lock();
                            if let Ok(mut s) = guard {
                                *s = Some(open);
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .build(context)
        .expect("error while building tauri application");

    app.run(|app_handle: &AppHandle, event| {
        // macOS dispatches `open -a Markdownish ~/folder` (or a *.md file) as a RunEvent::Opened.
        // We resolve the URL into a folder/file pair and push it to the frontend.
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Ok(p) = url.to_file_path() {
                    if let Some(open) = resolve_open(&p) {
                        let _ = app_handle.emit("open-path", open);
                    }
                }
            }
        }
    });
}
