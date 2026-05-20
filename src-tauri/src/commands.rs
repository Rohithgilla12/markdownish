use serde::Serialize;
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};

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
pub fn write_text_file(
    path: String,
    contents: String,
    state: tauri::State<'_, SuppressionState>,
) -> Result<u128, String> {
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    let mtime = mtime_of(&path)?;
    state.record(&path, mtime);
    Ok(mtime)
}

/// Create a new file. Fails if the file already exists — the caller is
/// expected to disambiguate the name before retrying. Parent directories
/// are created on demand so `docs/new-spec.md` works without a separate
/// mkdir round-trip.
#[tauri::command]
pub fn create_text_file(
    path: String,
    contents: String,
    state: tauri::State<'_, SuppressionState>,
) -> Result<u128, String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("File already exists: {}", path));
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    let mtime = mtime_of(&path)?;
    state.record(&path, mtime);
    Ok(mtime)
}

#[tauri::command]
pub fn stat_mtime(path: String) -> Result<u128, String> {
    mtime_of(&path)
}

const SUPPRESSION_TTL: Duration = Duration::from_secs(5);
const SUPPRESSION_MAX: usize = 32;

/// Records (path, mtime) pairs for each successful self-initiated write
/// so the JS-side watcher can drop the resulting filesystem event
/// instead of treating it as an external change. Entries expire after
/// 5 seconds. Matching is exact path+mtime; an external write that
/// happens to land on the same path with the same mtime within the
/// TTL would be incorrectly suppressed, but filesystem mtime
/// resolution plus the short window makes this vanishingly unlikely.
#[derive(Default)]
pub struct SuppressionState(Mutex<VecDeque<(String, u128, Instant)>>);

impl SuppressionState {
    fn record(&self, path: &str, mtime: u128) {
        if let Ok(mut q) = self.0.lock() {
            let now = Instant::now();
            q.push_back((path.to_string(), mtime, now));
            while q.len() > SUPPRESSION_MAX {
                q.pop_front();
            }
        }
    }

    fn matches(&self, path: &str, mtime: u128) -> bool {
        if let Ok(mut q) = self.0.lock() {
            let now = Instant::now();
            q.retain(|(_, _, t)| now.duration_since(*t) < SUPPRESSION_TTL);
            return q.iter().any(|(p, m, _)| p == path && *m == mtime);
        }
        false
    }
}

#[tauri::command]
pub fn is_self_write(
    path: String,
    mtime: u128,
    state: tauri::State<'_, SuppressionState>,
) -> bool {
    state.matches(&path, mtime)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOpts {
    pub case_sensitive: bool,
    pub regex: bool,
    pub whole_word: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u32,
    pub col: u32,
    pub offset: u32,
    pub length: u32,
    pub snippet: String,
    pub snippet_match_start: u32,
    pub snippet_match_end: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub mtime: u128,
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub files: Vec<FileMatches>,
    pub truncated_files: bool,
    pub request_id: u64,
    pub cancelled: bool,
}

#[derive(Default)]
pub struct SearchState(pub Mutex<u64>);

const MAX_MATCHES_PER_FILE: usize = 200;
const MAX_FILES: usize = 50;
const SNIPPET_RADIUS: usize = 60;

fn build_pattern(query: &str, opts: &SearchOpts) -> Result<regex::Regex, String> {
    let escaped: String;
    let pattern_body = if opts.regex {
        query
    } else {
        escaped = regex::escape(query);
        escaped.as_str()
    };
    let with_word = if opts.whole_word {
        format!(r"\b(?:{})\b", pattern_body)
    } else {
        pattern_body.to_string()
    };
    let final_pattern = if opts.case_sensitive {
        with_word
    } else {
        format!("(?i){}", with_word)
    };
    regex::Regex::new(&final_pattern).map_err(|e| format!("Invalid regex: {}", e))
}

fn collect_md_files(root: &Path, out: &mut Vec<PathBuf>) {
    let Some(name) = root.file_name().map(|n| n.to_string_lossy().to_string()) else {
        return;
    };
    if name.starts_with('.') {
        return;
    }
    if root.is_dir() {
        if matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
            return;
        }
        let Ok(entries) = fs::read_dir(root) else { return };
        for entry in entries.flatten() {
            collect_md_files(&entry.path(), out);
        }
    } else if is_markdown(root) {
        out.push(root.to_path_buf());
    }
}

/// Build a one-line snippet centred on a match. Returns the snippet plus
/// the match's start/end offsets *within the snippet*, both measured in
/// UTF-16 code units (which is what the JS textarea / browser DOM use).
fn build_snippet(line: &str, match_start: usize, match_end: usize) -> (String, u32, u32) {
    let start = match_start.saturating_sub(SNIPPET_RADIUS);
    let end = (match_end + SNIPPET_RADIUS).min(line.len());

    let mut snippet_start = start;
    while snippet_start > 0 && !line.is_char_boundary(snippet_start) {
        snippet_start -= 1;
    }
    let mut snippet_end = end;
    while snippet_end < line.len() && !line.is_char_boundary(snippet_end) {
        snippet_end += 1;
    }
    let snippet = &line[snippet_start..snippet_end];
    let utf16_len = |s: &str| s.encode_utf16().count() as u32;
    let prefix_in_snippet_bytes = match_start - snippet_start;
    let match_bytes = match_end - match_start;
    let before = utf16_len(&snippet[..prefix_in_snippet_bytes]);
    let mlen = utf16_len(&snippet[prefix_in_snippet_bytes..prefix_in_snippet_bytes + match_bytes]);

    let mut decorated = String::with_capacity(snippet.len() + 2);
    if snippet_start > 0 {
        decorated.push('…');
    }
    decorated.push_str(snippet);
    if snippet_end < line.len() {
        decorated.push('…');
    }
    let lead = if snippet_start > 0 { 1 } else { 0 };
    (decorated, before + lead, before + lead + mlen)
}

#[tauri::command]
pub fn search_folder(
    folder: String,
    query: String,
    opts: SearchOpts,
    request_id: u64,
    state: tauri::State<'_, SearchState>,
) -> Result<SearchResult, String> {
    if let Ok(mut current) = state.0.lock() {
        if request_id > *current {
            *current = request_id;
        }
    }

    let mut result = SearchResult {
        files: Vec::new(),
        truncated_files: false,
        request_id,
        cancelled: false,
    };

    if query.is_empty() {
        return Ok(result);
    }

    let pattern = build_pattern(&query, &opts)?;

    let root = Path::new(&folder);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder));
    }

    let mut files = Vec::new();
    collect_md_files(root, &mut files);

    let is_stale = |state: &tauri::State<'_, SearchState>| -> bool {
        state
            .0
            .lock()
            .map(|g| *g != request_id)
            .unwrap_or(false)
    };

    for path in files {
        if is_stale(&state) {
            result.cancelled = true;
            return Ok(result);
        }
        let Ok(content) = fs::read_to_string(&path) else { continue };
        let mtime = mtime_of(&path.to_string_lossy()).unwrap_or(0);

        let mut file_matches: Vec<SearchMatch> = Vec::new();
        let mut truncated_file = false;

        for m in pattern.find_iter(&content) {
            if file_matches.len() >= MAX_MATCHES_PER_FILE {
                truncated_file = true;
                break;
            }
            let start = m.start();
            let end = m.end();
            let preceding = &content[..start];
            let line_idx = preceding.matches('\n').count() as u32 + 1;
            let line_start = preceding.rfind('\n').map(|i| i + 1).unwrap_or(0);
            let line_end = content[start..].find('\n').map(|i| start + i).unwrap_or(content.len());
            let line = &content[line_start..line_end];
            let in_line_start = start - line_start;
            let in_line_end = end - line_start;
            let col_utf16 = line[..in_line_start].encode_utf16().count() as u32 + 1;

            let (snippet, sm_start, sm_end) = build_snippet(line, in_line_start, in_line_end);

            file_matches.push(SearchMatch {
                line: line_idx,
                col: col_utf16,
                offset: start as u32,
                length: (end - start) as u32,
                snippet,
                snippet_match_start: sm_start,
                snippet_match_end: sm_end,
            });
        }

        if !file_matches.is_empty() {
            if result.files.len() >= MAX_FILES {
                result.truncated_files = true;
                break;
            }
            result.files.push(FileMatches {
                path: path.to_string_lossy().to_string(),
                mtime,
                matches: file_matches,
                truncated: truncated_file,
            });
        }
    }

    Ok(result)
}
