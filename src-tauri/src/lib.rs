mod commands;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_cli::CliExt;

use commands::{resolve_open, OpenPath};

/// One-shot launch state. The frontend pulls this on mount via `take_launch_folder`.
#[derive(Default)]
struct LaunchState(Mutex<Option<OpenPath>>);

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
            commands::create_text_file,
            commands::stat_mtime,
            commands::resolve_path,
            take_launch_folder,
        ])
        .setup(|app| {
            // Build the main window with the *standard* macOS title bar.
            //
            // Earlier versions used TitleBarStyle::Overlay so the traffic
            // lights sat on top of the sidebar — but Overlay disables the
            // OS-native drag behaviour and forces every drag region to be
            // implemented in JavaScript, which never worked reliably.
            // Going back to the system title bar restores native drag and
            // double-click-to-maximise for free. The visual difference is
            // just a thin chrome strip at the top; the rest of the Vellum
            // aesthetic continues below it.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Markdownish")
                .inner_size(1280.0, 820.0)
                .min_inner_size(720.0, 480.0)
                .resizable(true)
                .visible(true)
                .focused(true)
                .build()?;

            // CLI launch arg — read and stash for the frontend to claim on mount.
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
