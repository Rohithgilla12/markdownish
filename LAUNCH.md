# Launch copy — ready to paste

Turnkey post text for each channel. Strategy and timing live in
[MARKETING.md](./MARKETING.md); this is just the words. Swap `loop.gif` and the
release URL for the live ones before posting. Brand voice: dry, restrained, no
emoji, no exclamation marks.

---

## The 50-word origin story (use verbatim, everywhere)

> I run Claude Code all day, which means I edit a lot of markdown — CLAUDE.md,
> specs, plans. Opening a whole IDE to fix three lines drove me up the wall, so I
> built the small thing I wanted. It's free. It's native. It pins the files my
> agents read.

---

## Hacker News — Show HN

**Title** (≤80 chars, no "I built"):
> Show HN: A markdown editor that pins CLAUDE.md and reloads when agents write

**Body:**
> I run Claude Code most of the day, which means I'm constantly editing markdown —
> CLAUDE.md, AGENTS.md, specs, plans. Opening VS Code to fix three lines in a
> config file never felt right, so I built a small editor for exactly that loop.
>
> It auto-pins CLAUDE.md / AGENTS.md / SKILL.md / README.md to the top of the
> sidebar, watches the folder so that when an agent rewrites the open file it
> reloads (silently if you have no unsaved changes, with a prompt if you do), and
> opens from any terminal with `md .`. There's a split live preview, KaTeX,
> outline, document stats, and export to PDF/HTML/PNG/EPUB.
>
> It's built in Tauri 2 (Rust + React), so the binary is ~3 MB and cold start is
> under a second. Apple Silicon only, signed and notarized, free, auto-updating.
>
> The scope is deliberately small — no vim mode, no plugins, no second brain, no
> diff view. If I want those I have an IDE. This is the thing I reach for between
> agent runs.
>
> Source and a .dmg: https://github.com/Rohithgilla12/markdownish
>
> Happy to talk about the Tauri choices, the file-watcher debouncing, or why every
> markdown editor seems to be built for novelists instead of developers.

*Post Tue/Wed ~8–10am US Eastern. Sit in the thread all day. Never defensive.*

---

## X / Twitter — launch thread

**1/**
> I got tired of opening VS Code just to edit CLAUDE.md.
>
> So I built a tiny native markdown editor for the files you actually edit between
> agent runs. It pins them. It reloads when an agent writes. `md .` from anywhere.
>
> [attach loop.gif]

**2/**
> CLAUDE.md, AGENTS.md, SKILL.md, README.md auto-pin to the top of the sidebar the
> moment they exist. The files you reach for are one glance away — not buried in a
> tree.

**3/**
> A file watcher sees the moment Claude Code rewrites the open file. No unsaved
> work? It reloads silently. Mid-edit? It asks first. It never clobbers you.

**4/**
> It's Tauri, not Electron. ~3 MB binary, sub-second cold start. Split live
> preview, KaTeX math, outline, doc stats, export to PDF/HTML/PNG/EPUB. One good
> walnut-and-copper dark theme.

**5/**
> Free. Apple Silicon. Signed, notarized, auto-updating. Built by one person who
> runs Claude Code all day, for everyone who does the same.
>
> Grab it: github.com/Rohithgilla12/markdownish

---

## r/ClaudeAI (and adapt for r/cursor)

**Title:**
> I built a markdown editor that reloads when Claude Code writes to the file

**Body:**
> I kept opening a full IDE just to edit CLAUDE.md, so I made a small native editor
> for it. The part that's most useful day-to-day: it watches the folder, so when
> Claude Code rewrites the open file on disk, the editor reloads it — silently if
> you have nothing unsaved, with a prompt if you do, so it never overwrites your
> edits.
>
> It also auto-pins CLAUDE.md / AGENTS.md / SKILL.md / README.md, opens from the
> terminal with `md .`, and has a split live preview that's genuinely nice to read
> long specs in. Free, Apple Silicon, ~3 MB.
>
> github.com/Rohithgilla12/markdownish — would love feedback on what would make it
> fit your workflow better. (For r/cursor: reframe around `.cursorrules` and
> cursor-adjacent markdown.)

---

## Product Hunt

**Name:** Markdownish
**Tagline:** The markdown editor that knows about CLAUDE.md
**First comment:**
> Hi PH. I run Claude Code all day and got tired of opening VS Code to edit three
> lines of CLAUDE.md. Markdownish is the small native editor I wanted: it pins your
> agent context files, reloads when an agent writes to them, opens with `md .`, and
> has a split preview that's actually pleasant to read in. Tauri-built, ~3 MB,
> free, Apple Silicon. Ask me anything about the build.

---

## The comparison-post angle (durable SEO)

**Working title:** "I tried Lettera, Typora, iA Writer, and Wrangle — here's what
I actually use for CLAUDE.md."

Be genuinely fair to each. Land the point that most markdown editors are built for
writers; the few built for agentic workflows trend toward IDE complexity or hide
the source. Markdownish's lane: focused, source-visible, beautiful, free.
