use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// A normalised "open this" payload — used for CLI args, RunEvent::Opened,
/// and dropped file paths from drag-and-drop. If `path` is a file, we open
/// its parent folder and select the file; if it's a folder, we open it
/// directly.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenPath {
    pub folder: String,
    pub file: Option<String>,
}

pub fn resolve_open(p: &Path) -> Option<OpenPath> {
    if p.is_dir() {
        Some(OpenPath {
            folder: p.to_string_lossy().to_string(),
            file: None,
        })
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

#[tauri::command]
pub fn resolve_path(path: String) -> Option<OpenPath> {
    resolve_open(Path::new(&path))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRead {
    pub content: String,
    pub mtime: u128,
}

const MARKDOWN_EXTS: &[&str] = &["md", "mdx", "markdown"];

fn is_markdown(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTS.iter().any(|m| m.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn walk(path: &Path) -> Option<FileNode> {
    let name = path.file_name()?.to_string_lossy().to_string();
    if name.starts_with('.') {
        return None;
    }

    if path.is_dir() {
        if matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
            return None;
        }

        let mut children: Vec<FileNode> = fs::read_dir(path)
            .ok()?
            .filter_map(|e| e.ok())
            .filter_map(|e| walk(&e.path()))
            .collect();

        children.sort_by(|a, b| {
            (b.is_dir as u8)
                .cmp(&(a.is_dir as u8))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        if children.is_empty() {
            return None;
        }

        Some(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: true,
            children,
        })
    } else if is_markdown(path) {
        Some(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: false,
            children: Vec::new(),
        })
    } else {
        None
    }
}

#[tauri::command]
pub fn read_tree(path: String) -> Result<FileNode, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    walk(p).ok_or_else(|| format!("No markdown files found in {}", path))
}

/// Returns the last-modified time of a file as milliseconds since the UNIX epoch.
fn mtime_of(path: &str) -> Result<u128, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    let dur = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    Ok(dur.as_millis())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<FileRead, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mtime = mtime_of(&path).unwrap_or(0);
    Ok(FileRead { content, mtime })
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<u128, String> {
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    mtime_of(&path)
}

#[tauri::command]
pub fn stat_mtime(path: String) -> Result<u128, String> {
    mtime_of(&path)
}
