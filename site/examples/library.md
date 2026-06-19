# CLAUDE.md

A zero-dependency TypeScript library published to npm. Used in browser and Node.

## Stack
- TypeScript strict, ESM-first with a CJS fallback build (tsup)
- Vitest for tests, `@arethetypeswrong/cli` to check the published types
- Changesets for versioning

## Conventions
- Public API is whatever `src/index.ts` exports — treat it as a contract.
- Keep the dependency count at zero. A new dep needs an explicit reason and sign-off.
- Every exported function has a doc comment with one runnable `@example`.
- No Node built-ins in code that ships to the browser path.

## Workflow
- The gate: `pnpm build && pnpm test && pnpm attw`. All three, every time.
- A user-visible change requires a changeset (`pnpm changeset`) in the same PR.
- Commit only when asked. Branch off `main`. Never bump versions by hand.

## Boundaries
- Don't widen the public API surface without asking — fewer exports age better.
- Benchmarks in `bench/` guard hot paths; if you touch them, run `pnpm bench`.
- `dist/` is generated. Never edit it.

## Non-goals (resist unless asked)
- A plugin system
- Framework-specific wrappers (those belong in separate packages)
- Polyfills — document the supported runtimes instead
