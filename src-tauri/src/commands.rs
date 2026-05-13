use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
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
    // Skip dotfiles (CLAUDE.md spec Phase 8) — `.git`, `.DS_Store`, `.vscode`, etc.
    if name.starts_with('.') {
        return None;
    }

    if path.is_dir() {
        // Skip a few directories that are almost never useful to surface in a markdown editor.
        if matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
            return None;
        }

        let mut children: Vec<FileNode> = fs::read_dir(path)
            .ok()?
            .filter_map(|e| e.ok())
            .filter_map(|e| walk(&e.path()))
            .collect();

        // Directories first, then files; both case-insensitive alphabetical.
        children.sort_by(|a, b| {
            (b.is_dir as u8)
                .cmp(&(a.is_dir as u8))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        // Prune directories that contain no markdown — a typical project root has hundreds of
        // folders we don't care about. Keeps the tree clean without an explicit filter UI.
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

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}
