mod commands;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_cli::CliExt;

use commands::{resolve_open, OpenPath};

/// One-shot launch state. The frontend pulls this on mount via `take_launch_folder`.
#[derive(Default)]
struct LaunchState(Mutex<Option<OpenPath>>);

/// Resolve a possibly-relative path against the user's CWD. CLI args usually come in as
/// relative paths (e.g. `md .`) so we need to make them absolute before resolving.
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(LaunchState::default())
        .invoke_handler(tauri::generate_handler![
            commands::read_tree,
            commands::read_text_file,
            commands::write_text_file,
            commands::stat_mtime,
            commands::resolve_path,
            take_launch_folder,
        ])
        .setup(|app| {
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
