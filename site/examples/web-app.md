# CLAUDE.md

A Next.js 15 app. Keep this tight — every line is re-read on every turn.

## Stack
- Next.js 15 (App Router), React 19, TypeScript strict
- Tailwind v4 + shadcn/ui
- Drizzle ORM + Postgres (Neon)
- pnpm, Node 22 LTS

## Conventions
- Server Components by default. `"use client"` only when you need state or effects.
- Data access lives in `lib/db/queries/`, never inline in components.
- Co-locate tests as `*.test.ts` next to the file. Vitest.
- No barrel `index.ts` re-export files — import from the source path.
- Prefer obvious code over clever code. Match the surrounding file's style.

## Workflow
- `pnpm typecheck && pnpm test` must pass before you claim anything works.
- Commit only when asked. Branch off `main` first. Conventional commits, lowercase.
- One migration per schema change: `pnpm db:generate`, never hand-edit SQL.

## Boundaries
- Don't touch `app/(marketing)/` — that's a separate design system.
- Secrets come from `.env.local`; never read or print them.
- Ask before adding a dependency or a new top-level route group.

## Non-goals (resist unless asked)
- New abstractions for a single caller
- Reformatting untouched files
- "While I'm here" refactors
