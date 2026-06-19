# Markdownish — Marketing Playbook

> Working notes for taking a tiny, opinionated markdown editor to the people who'd
> actually use it. Brand voice throughout: dry, confident, restrained, a little
> literary. No emoji. No exclamation marks. Let the craft do the shouting.

---

## 0. The one-paragraph reality check

We are **not** first to "a markdown editor for Claude Code." During research three
direct competitors surfaced that the product hadn't accounted for:

| Tool | Angle | Price | Where it's heading |
|---|---|---|---|
| **Wrangle** (wrangleapp.dev) | Markdown editor + embedded terminals + agent session manager | $19 | Drifting toward a lite IDE |
| **Markdossier** | WYSIWYG markdown + LLM token counting + hot-reload | $14.99 | WYSIWYG-first (hides source) |
| **Nimbalyst** (OSS) | All-in-one visual workspace for Claude/Codex | Free | So broad it has no editor identity |
| **Lettera** (Bear team) | Refined native markdown editor | TBD (beta) | Aimed at *writers*, not developers |

This is good news, not bad. A populated category means the demand is real and
validated. We don't need to invent the market — we need to **win a clear lane inside
it.** Our lane is the intersection nobody else occupies:

> **The only one in this category you'd genuinely enjoy reading a 2,000-word spec in
> — that's free, that stays small on purpose, and that was built by someone who runs
> Claude Code all day rather than a startup chasing the trend.**

Focus + editorial beauty + free + authorship. Wrangle can't get smaller. Markdossier
can't show you the source it hides. Lettera can't suddenly care about CLAUDE.md.
We can be all four things at once, and none of them can.

---

## 1. Positioning

**Category:** developer markdown editor for agentic workflows.
**Wedge:** the beautiful, free, focused one — built by a practitioner.
**Proof points, in priority order:**

1. Pins `CLAUDE.md` / `AGENTS.md` / `SKILL.md` / `README.md` automatically.
2. Reloads the instant an agent writes to the open file (the killer demo).
3. `md .` from any terminal.
4. Editorial typography (Vellum & Ink) — the thing screenshots sell on its own.
5. ~3 MB native Tauri binary, sub-second cold start, free forever.

**What we never say:** "first," "revolutionary," "AI-powered." We are the opposite of
hype. The restraint *is* the brand.

---

## 2. Taglines (pick one hero, rotate the rest)

1. The markdown editor your agents write to.
2. Open a folder. Edit a spec. Close the IDE.
3. CLAUDE.md deserves a better editor than VS Code.
4. Markdown, editorial quality, three megabytes.
5. A markdown editor that knows what CLAUDE.md is.
6. One good dark theme. One purpose. One folder at a time.
7. Markdown was always a developer format. The editors forgot.
8. Built for developers who live in terminals, not text editors.
9. The one you actually want to read in.
10. For the age when your agent edits your files and you edit them back.

**Recommended hero:** #1 for the headline, #3 as the HN/Reddit hook, #9 as the
closer. They tell a story in sequence: *what it does → who it's against → why you stay.*

---

## 3. Launch narratives (opening lines that earn upvotes)

**The frustration (HN / X):**
> Every morning I open VS Code, navigate to CLAUDE.md, make a three-line edit, and
> close VS Code. I did that 400 times before I admitted it didn't make sense.

**The observation (Show HN / dev.to):**
> Markdown was invented by a developer, for developers — and every editor built for
> it decided to aim at novelists. CLAUDE.md didn't exist five years ago. It exists
> now. None of the editors know what it is.

**The demo-in-words (X thread opener):**
> I type `md .`. My project folder opens, CLAUDE.md pinned at the top. Claude Code
> is rewriting a section of it right now and I'm watching it update live. I built
> this because I couldn't find it.

---

## 4. The assets to make first (nothing ships without these)

These three do 80% of the work. Make them before any post goes out.

- **The Loop GIF (≤6s):** terminal `md .` → app opens, CLAUDE.md pinned → run an
  agent → watcher fires → reload prompt → new content renders. This is the entire
  pitch in one loop. It goes in every post, the README, and the landing page.
- **The Aesthetic Card:** a single screenshot of a long, dense spec rendered in
  Vellum & Ink. Caption, total: "Markdown editors can look like this." Developers
  reward visible craft.
- **The 50-word origin story**, used verbatim everywhere:
  > I run Claude Code all day, which means I edit a lot of markdown — CLAUDE.md,
  > specs, plans. Opening a whole IDE to fix three lines drove me up the wall, so I
  > built the small thing I wanted. It's free. It's native. It pins the files my
  > agents read. That's the whole story.

---

## 5. The 14-day launch sequence

A specific order, not a grab-bag. Each day has one job.

**Week 1 — seed where the audience already lives.**
- **Day 1** — Ship the landing page + the Loop GIF in the README. Post the GIF as a
  standalone X video: "I got tired of opening VS Code just to edit CLAUDE.md." No
  links in the first tweet; drop the repo in the first reply.
- **Day 2** — r/ClaudeAI post leading with the *file watcher*, the feature that
  resonates hardest with that crowd. Title: "I built a markdown editor that reloads
  when Claude Code writes to the file."
- **Day 3** — r/cursor, reframed for `.cursorrules` and Cursor-adjacent markdown.
- **Day 4** — The Aesthetic Card on X. One image, one line, no link in the post.
- **Day 5** — Surgical: search github.com/anthropics/claude-code discussions for
  "editing CLAUDE.md" / "context file tooling" and leave **one** genuinely helpful
  reply that mentions Markdownish where it fits. Quality over volume — one good
  comment beats ten drive-bys.

**Week 2 — the big swings.**
- **Day 8** — **Show HN**, Tuesday/Wednesday ~8–10am US Eastern. Title: "Show HN: I
  built a markdown editor just for editing CLAUDE.md (it works for everything else
  too)." Lead with the frustration narrative + the Loop GIF. Be in the thread all
  day, reply to everything, never defensive.
- **Day 10** — dev.to technical post: "How I built a 3 MB markdown editor in Tauri."
  Earns Tauri-community backlinks and ranks for "Tauri markdown editor."
- **Day 12** — **Product Hunt**, Tuesday. Tagline: "The markdown editor that knows
  about CLAUDE.md." Line up a hunter with 1k+ dev-tools followers ahead of time.
- **Day 14** — The comparison post: "I tried Lettera, Typora, iA Writer, Wrangle —
  here's what I actually use." Fair to each; becomes the durable search result for
  "markdown editor for Claude Code."

---

## 6. The idea bank (ranked by leverage)

### High leverage / low effort — do these
- **The Loop GIF everywhere.** One asset, infinite reuse. (See §4.)
- **The "built for me, free forever" line**, stated prominently on the site and
  README. Against $14–19 competitors, free-and-honest is a moat developers feel.
- **The aesthetic screenshot drops.** Periodic, zero-copy, pure craft signal.
- **`md .` 60-second video.** The single clearest expression of the product.
- **README easter egg:** a section titled "For people who run Claude Code all day"
  with the `md()` shell function and a pinned-CLAUDE.md screenshot. People screenshot
  *this* and share it.
- **One authentic operator on X.** DM a 20k–200k-follower Claude Code workflow poster
  a free license and "I built this for people like you, no ask." One organic post
  beats a thousand paid impressions.

### High leverage / medium effort
- **CLAUDE.md Hall of Fame.** Curate a repo/site of beautifully crafted CLAUDE.md
  files (with permission, credited). Footer: "Best read in Markdownish." Pure
  community goodwill, perfectly on-target distribution.
- **"Token-count your CLAUDE.md" micro-tool.** A one-afternoon static page: paste a
  file, see word/token counts per model. Quiet link out. Shareable on its own.
- **"How to write a CLAUDE.md that actually works" guide.** Opinionated, genuinely
  useful, SEO-durable, links home.
- **Lettera-launch jiu-jitsu.** When Lettera exits beta, post the same day: "Lettera
  is beautiful. It's for writers. Markdownish is for developers who write markdown
  all day. Different tools, different people." Ride the wave of attention with a
  crisp, non-hostile distinction.

### Worth doing / compounding
- **Build-in-public dev log.** Weekly: one decision, one screenshot, `#buildinpublic`.
- **The manifesto post:** "Every markdown editor is built for writers. This one is
  built for builders." Sharp, opinionated, shareable.
- **Tauri-community angle:** the "3 MB, sub-second" technical flex lands hard with
  engineers who resent 120 MB Electron apps.
- **Agentic-workflow newsletters.** A handful (2k–20k subs) cover Claude Code/Cursor.
  A genuine "I made this" note costs nothing and hits a precise audience.

### Guerrilla / higher variance
- **The "Claude wrote this spec, live" post.** Screen-record an agent authoring a
  rich spec into a watched file as Markdownish renders it in real time. The loop is
  the story: AI writes the markdown, the editor makes it beautiful, you read and
  edit. Perfect product narrative.
- **Sticker/wordmark drop** at a dev meetup or AI hack night — the italic M with the
  foil period reads as a mark, not a logo. Low cost, memorable.

---

## 7. Channels, in priority order

1. **X / dev-Twitter** — the agentic-builder community is small but high-signal and
   loves craft. Primary home for the GIF + aesthetic cards.
2. **r/ClaudeAI, r/cursor** — exact-audience subreddits; lead with the watcher.
3. **Hacker News (Show HN)** — the credibility multiplier; honesty + GIF + native/3MB.
4. **Product Hunt** — a launch-day spike and a durable backlink.
5. **Claude Code GitHub discussions** — surgical, 100%-on-target, one good comment.
6. **dev.to / personal blog** — the durable SEO surface for "markdown editor for
   Claude Code" and "Tauri markdown editor."

---

## 8. What "winning" looks like (modest, honest targets)

- 1,000 GitHub stars in the first month (Show HN + PH + Reddit can realistically do
  this for a tool this concrete).
- The Loop GIF cracks 100k impressions on one platform.
- Top-3 search result for "markdown editor for Claude Code" within ~6 months via the
  comparison + guide posts.
- A steady trickle of "I switched from VS Code for CLAUDE.md" replies — the only
  testimonial that matters.

The goal isn't a unicorn. It's that the right few thousand people find the small good
thing and keep it in their dock. That's a complete success for a tool like this.
