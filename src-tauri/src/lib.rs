mod commands;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
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
            commands::stat_mtime,
            commands::resolve_path,
            take_launch_folder,
        ])
        .setup(|app| {
            // Build the main window programmatically. We declared `"windows": []`
            // in tauri.conf.json so we can apply the macOS-specific title-bar
            // tweaks here — the declarative JSON path doesn't wire up the
            // `traffic_light_position` adjustment that keeps drag regions
            // working under the Overlay style.
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Markdownish")
                .inner_size(1280.0, 820.0)
                .min_inner_size(720.0, 480.0)
                .resizable(true)
                .visible(true)
                .focused(true);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true)
                // Nudge the traffic lights inward so they sit comfortably
                // inside the app's content and leave clean drag area around
                // them — matches Linear, Slack, and noti-peek's chrome.
                .traffic_light_position(tauri::LogicalPosition::new(18.0, 18.0));

            let _window = win_builder.build()?;

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
