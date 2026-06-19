# CLAUDE.md

A Rust CLI published to crates.io and Homebrew. Single binary, no runtime deps.

## Stack
- Rust stable, edition 2021
- `clap` (derive) for args, `anyhow` for errors, `serde` for config
- `assert_cmd` + `insta` snapshots for the CLI surface

## Conventions
- Every subcommand is its own module under `src/cmd/`.
- Errors bubble with `?` and `anyhow::Context` — no `unwrap()` outside tests.
- User-facing output goes through `src/ui.rs`; never `println!` ad hoc.
- Respect `--quiet` and `NO_COLOR`. Exit codes: 0 ok, 1 user error, 2 internal.

## Workflow
- `cargo clippy -- -D warnings` and `cargo test` are the gate. Run both.
- `cargo insta review` after any change to CLI output.
- Commit only when asked; branch off `main`. Update `CHANGELOG.md` in the same PR.

## Boundaries
- The public API is `src/lib.rs` — a breaking change there means a semver major.
- Don't add a dependency without asking; the "no runtime deps" promise is the brand.
- Generated completions live in `completions/`; regenerate, don't hand-edit.

## Non-goals (resist unless asked)
- An interactive TUI mode
- Async — this tool is fast enough synchronous
- Config file formats beyond TOML
