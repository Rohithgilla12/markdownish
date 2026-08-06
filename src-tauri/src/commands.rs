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
    let name = p.file_name().unwrap_or_default().to_string_lossy();
    if name == ".cursorrules" || name == ".windsurfrules" {
        return true;
    }
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTS.iter().any(|m| m.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn walk(path: &Path) -> Option<FileNode> {
    let name = path.file_name()?.to_string_lossy().to_string();
    if name.starts_with('.') && name != ".cursorrules" && name != ".windsurfrules" {
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

/// Write raw bytes to an arbitrary path chosen by the user via the native
/// save dialog. Exports (HTML/PNG/ePub) land outside the opened folder, so
/// they go through a Rust command rather than the scoped JS fs plugin —
/// the path is already user-blessed by the save dialog. No self-write
/// suppression: export targets are never inside the watched folder.
#[tauri::command]
pub fn write_export_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

const SUPPRESSION_TTL: Duration = Duration::from_secs(5);

/// Records (path, mtime) pairs for each successful self-initiated write
/// so the JS-side watcher can drop the resulting filesystem event
/// instead of treating it as an external change. Entries expire after
/// 5 seconds — that's the only capacity bound, because a fixed-count
/// cap would lose entries during a large batch replace before the
/// watcher's 200ms debounce gets a chance to check them. Matching is
/// exact path+mtime; an external write that lands on the same path
/// with the same mtime within the TTL would be incorrectly
/// suppressed, but filesystem mtime resolution plus the short window
/// makes this vanishingly unlikely.
#[derive(Default)]
pub struct SuppressionState(Mutex<VecDeque<(String, u128, Instant)>>);

impl SuppressionState {
    fn record(&self, path: &str, mtime: u128) {
        if let Ok(mut q) = self.0.lock() {
            let now = Instant::now();
            q.retain(|(_, _, t)| now.duration_since(*t) < SUPPRESSION_TTL);
            q.push_back((path.to_string(), mtime, now));
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
    if name.starts_with('.') && name != ".cursorrules" && name != ".windsurfrules" {
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Replacement {
    pub offset: u32,
    pub length: u32,
    pub text: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    pub path: String,
    pub expected_mtime: u128,
    /// Must be sorted by `offset` DESCENDING so each splice doesn't
    /// invalidate the offsets of edits that haven't applied yet.
    pub replacements: Vec<Replacement>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReplaceOutcome {
    #[serde(rename_all = "camelCase")]
    Ok { path: String, new_mtime: u128, replaced: u32 },
    #[serde(rename_all = "camelCase")]
    StaleMtime { path: String, actual_mtime: u128 },
    #[serde(rename_all = "camelCase")]
    IoError { path: String, message: String },
}

fn apply_one_file(
    edit: &FileEdit,
    suppression: &SuppressionState,
) -> ReplaceOutcome {
    let actual_mtime = match mtime_of(&edit.path) {
        Ok(m) => m,
        Err(e) => {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: e,
            };
        }
    };
    if actual_mtime != edit.expected_mtime {
        return ReplaceOutcome::StaleMtime {
            path: edit.path.clone(),
            actual_mtime,
        };
    }
    let mut content = match fs::read_to_string(&edit.path) {
        Ok(c) => c,
        Err(e) => {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: e.to_string(),
            };
        }
    };

    // Each replacement consumes [offset, offset+length). The caller
    // guarantees descending offset order; if they didn't, splice
    // boundaries would shift and we'd corrupt the file. Defend against
    // that explicitly rather than trusting input.
    let mut last_start: Option<u32> = None;
    for r in &edit.replacements {
        if let Some(prev) = last_start {
            if r.offset + r.length > prev {
                return ReplaceOutcome::IoError {
                    path: edit.path.clone(),
                    message: "Replacements not sorted by descending offset".into(),
                };
            }
        }
        let start = r.offset as usize;
        let end = start + r.length as usize;
        if end > content.len()
            || !content.is_char_boundary(start)
            || !content.is_char_boundary(end)
        {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: format!("Replacement out of bounds at offset {}", r.offset),
            };
        }
        content.replace_range(start..end, &r.text);
        last_start = Some(r.offset);
    }

    let tmp_path = format!("{}.tmp~", edit.path);
    if let Err(e) = fs::write(&tmp_path, &content) {
        return ReplaceOutcome::IoError {
            path: edit.path.clone(),
            message: e.to_string(),
        };
    }
    if let Err(e) = fs::rename(&tmp_path, &edit.path) {
        let _ = fs::remove_file(&tmp_path);
        return ReplaceOutcome::IoError {
            path: edit.path.clone(),
            message: e.to_string(),
        };
    }

    let new_mtime = match mtime_of(&edit.path) {
        Ok(m) => m,
        Err(e) => {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: e,
            };
        }
    };
    suppression.record(&edit.path, new_mtime);
    ReplaceOutcome::Ok {
        path: edit.path.clone(),
        new_mtime,
        replaced: edit.replacements.len() as u32,
    }
}

#[tauri::command]
pub fn replace_in_files(
    edits: Vec<FileEdit>,
    state: tauri::State<'_, SuppressionState>,
) -> Vec<ReplaceOutcome> {
    edits
        .iter()
        .map(|e| apply_one_file(e, &state))
        .collect()
}

#[cfg(test)]
mod tests {
    //! Regression tests for the watcher suppression state and the
    //! search + replace helpers. Lives in-module so we can poke at the
    //! private surfaces (`SuppressionState::record`/`matches`,
    //! `build_pattern`, `build_snippet`, `collect_md_files`,
    //! `apply_one_file`) without smuggling them through Tauri's
    //! `State<_>` extractor.
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn default_opts() -> SearchOpts {
        SearchOpts {
            case_sensitive: false,
            regex: false,
            whole_word: false,
        }
    }

    #[test]
    fn record_then_matches() {
        let state = SuppressionState::default();
        state.record("/tmp/a.md", 42);
        assert!(state.matches("/tmp/a.md", 42));
        assert!(!state.matches("/tmp/b.md", 42));
        assert!(!state.matches("/tmp/a.md", 43));
    }

    #[test]
    fn ttl_eviction_on_read() {
        let state = SuppressionState::default();
        state
            .0
            .lock()
            .unwrap()
            .push_back(("p".into(), 1, Instant::now() - Duration::from_secs(10)));
        assert!(!state.matches("p", 1));
        assert!(
            state.0.lock().unwrap().is_empty(),
            "expired entry should have been purged on read"
        );
    }

    #[test]
    fn regression_no_count_cap_on_bulk_replace() {
        // Regression for commit a17121c: the previous implementation
        // capped the deque at 32 entries, which would silently drop
        // the oldest self-write records during a bulk replace and
        // cause the watcher to surface them as external changes.
        let state = SuppressionState::default();
        for i in 0..100u128 {
            state.record(&format!("p{}", i), i + 1);
        }
        assert!(
            state.matches("p0", 1),
            "earliest entry must survive — the 32-entry cap that ate it is gone"
        );
        assert!(state.matches("p99", 100));
    }

    #[test]
    fn plain_text_is_escaped() {
        let re = build_pattern(
            "foo.bar",
            &SearchOpts {
                case_sensitive: true,
                regex: false,
                whole_word: false,
            },
        )
        .unwrap();
        assert!(re.is_match("foo.bar"));
        assert!(!re.is_match("fooxbar"));
    }

    #[test]
    fn case_insensitive_by_default() {
        let re = build_pattern("FOO", &default_opts()).unwrap();
        assert!(re.is_match("foo"));
    }

    #[test]
    fn whole_word_wraps_in_boundaries() {
        let re = build_pattern(
            "cat",
            &SearchOpts {
                case_sensitive: true,
                regex: false,
                whole_word: true,
            },
        )
        .unwrap();
        assert!(re.is_match("cat sat"));
        assert!(!re.is_match("scatter"));
    }

    #[test]
    fn regex_passthrough() {
        let re = build_pattern(
            r"\d+",
            &SearchOpts {
                case_sensitive: true,
                regex: true,
                whole_word: false,
            },
        )
        .unwrap();
        assert!(re.is_match("abc123"));
    }

    #[test]
    fn invalid_regex_returns_err() {
        let err = build_pattern(
            "(unclosed",
            &SearchOpts {
                case_sensitive: true,
                regex: true,
                whole_word: false,
            },
        )
        .unwrap_err();
        assert!(err.starts_with("Invalid regex"), "got: {}", err);
    }

    #[test]
    fn short_line_no_ellipses() {
        let line = "hello world";
        let start = line.find("world").unwrap();
        let end = start + "world".len();
        let (snippet, _, _) = build_snippet(line, start, end);
        assert_eq!(snippet, line);
        assert!(!snippet.contains('…'));
    }

    #[test]
    fn long_line_with_leading_and_trailing_ellipses() {
        let line = "a".repeat(200);
        let (snippet, _, _) = build_snippet(&line, 100, 101);
        assert!(snippet.starts_with('…'));
        assert!(snippet.ends_with('…'));
    }

    #[test]
    fn utf16_offsets_handle_multibyte() {
        // 🎉 is a 4-byte UTF-8 codepoint that occupies TWO UTF-16
        // code units (a surrogate pair). The snippet offsets must
        // count UTF-16 units so JS textarea/DOM consumers can use
        // them as-is.
        let line = "🎉 happy hat";
        let start = line.find("hat").unwrap();
        let end = start + "hat".len();
        let (snippet, sm_start, sm_end) = build_snippet(line, start, end);
        // Short line, so the snippet is the line verbatim with no
        // ellipsis decoration.
        assert_eq!(snippet, line);
        // "🎉" = 2 UTF-16 units, " happy " = 7 UTF-16 units, so
        // "hat" begins at 9 and spans 3 units.
        assert_eq!(sm_start, 9);
        assert_eq!(sm_end, 12);
    }

    #[test]
    fn collect_md_files_walks_markdown_only() {
        // tempfile names its dirs `.tmpXXXX` on some platforms, which
        // our hidden-file filter rejects. Stage the fixtures inside a
        // non-dotted child directory so the walker actually descends.
        let dir = tempdir().unwrap();
        let root_buf = dir.path().join("project");
        fs::create_dir_all(&root_buf).unwrap();
        let root = root_buf.as_path();
        fs::write(root.join("a.md"), "").unwrap();
        fs::write(root.join("b.txt"), "").unwrap();
        fs::write(root.join(".hidden.md"), "").unwrap();
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested/c.markdown"), "").unwrap();
        fs::write(root.join("nested/d.mdx"), "").unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("node_modules/pkg/e.md"), "").unwrap();

        let mut out = Vec::new();
        collect_md_files(root, &mut out);

        let mut names: Vec<String> = out
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["a.md", "c.markdown", "d.mdx"]);
    }

    #[test]
    fn apply_one_file_applies_descending_replacements() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.md");
        fs::write(&path, "hello world goodbye").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mtime = mtime_of(&path_str).unwrap();

        let edit = FileEdit {
            path: path_str.clone(),
            expected_mtime: mtime,
            replacements: vec![
                Replacement {
                    offset: 12,
                    length: 7,
                    text: "FAREWELL".into(),
                },
                Replacement {
                    offset: 6,
                    length: 5,
                    text: "WORLD".into(),
                },
            ],
        };

        let suppression = SuppressionState::default();
        match apply_one_file(&edit, &suppression) {
            ReplaceOutcome::Ok { replaced, .. } => assert_eq!(replaced, 2),
            other => panic!("expected Ok, got {:?}", serde_json::to_string(&other)),
        }
        let after = fs::read_to_string(&path).unwrap();
        assert_eq!(after, "hello WORLD FAREWELL");
    }

    #[test]
    fn apply_one_file_stale_mtime_returns_stale_outcome() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.md");
        fs::write(&path, "hello world").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let real_mtime = mtime_of(&path_str).unwrap();

        let edit = FileEdit {
            path: path_str.clone(),
            expected_mtime: 0,
            replacements: vec![Replacement {
                offset: 0,
                length: 5,
                text: "HELLO".into(),
            }],
        };

        match apply_one_file(&edit, &SuppressionState::default()) {
            ReplaceOutcome::StaleMtime { actual_mtime, .. } => {
                assert_eq!(actual_mtime, real_mtime);
            }
            other => panic!("expected StaleMtime, got {:?}", serde_json::to_string(&other)),
        }
        // File should be untouched.
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello world");
    }

    #[test]
    fn apply_one_file_out_of_bounds_offset_returns_io_error() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.md");
        fs::write(&path, "abc").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mtime = mtime_of(&path_str).unwrap();

        let edit = FileEdit {
            path: path_str,
            expected_mtime: mtime,
            replacements: vec![Replacement {
                offset: 5,
                length: 1,
                text: "x".into(),
            }],
        };

        match apply_one_file(&edit, &SuppressionState::default()) {
            ReplaceOutcome::IoError { message, .. } => {
                assert!(
                    message.contains("out of bounds"),
                    "expected out-of-bounds message, got: {}",
                    message
                );
            }
            other => panic!("expected IoError, got {:?}", serde_json::to_string(&other)),
        }
    }

    #[test]
    fn apply_one_file_ascending_offset_order_is_rejected() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.md");
        fs::write(&path, "hello world").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mtime = mtime_of(&path_str).unwrap();

        let edit = FileEdit {
            path: path_str,
            expected_mtime: mtime,
            replacements: vec![
                Replacement {
                    offset: 0,
                    length: 5,
                    text: "HELLO".into(),
                },
                Replacement {
                    offset: 6,
                    length: 5,
                    text: "WORLD".into(),
                },
            ],
        };

        match apply_one_file(&edit, &SuppressionState::default()) {
            ReplaceOutcome::IoError { message, .. } => {
                assert!(
                    message.contains("sorted by descending"),
                    "expected descending-order message, got: {}",
                    message
                );
            }
            other => panic!("expected IoError, got {:?}", serde_json::to_string(&other)),
        }
    }

    #[test]
    fn apply_one_file_records_self_write_on_success() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.md");
        fs::write(&path, "abc").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mtime = mtime_of(&path_str).unwrap();

        let edit = FileEdit {
            path: path_str.clone(),
            expected_mtime: mtime,
            replacements: vec![Replacement {
                offset: 0,
                length: 1,
                text: "A".into(),
            }],
        };

        let suppression = SuppressionState::default();
        let new_mtime = match apply_one_file(&edit, &suppression) {
            ReplaceOutcome::Ok { new_mtime, .. } => new_mtime,
            other => panic!("expected Ok, got {:?}", serde_json::to_string(&other)),
        };
        assert!(
            suppression.matches(&path_str, new_mtime),
            "successful self-write must be recorded so the watcher can suppress its echo"
        );
    }
}
