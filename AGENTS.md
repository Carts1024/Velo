# Repository Guidelines

## Project Structure & Module Organization

Velo is a pnpm/Turborepo monorepo. The Next.js app lives in `apps/web`, with routes in `app`, feature code in `features`, utilities in `core`, and static assets in `public`. Shared packages are in `packages`: `backend` contains Convex functions and schema in `convex`, `ui` contains reusable React components and styles in `src`, `stellar` contains Stellar SDK helpers in `src`, and `typescript-config` holds shared TS configs. Soroban registry contract code is in `contracts/registry/src`, with Rust tests in `contracts/registry/tests` and snapshots in `contracts/registry/test_snapshots`. Product and architecture docs are under `docs/prds`.

## Build, Test, and Development Commands

Use `pnpm install` with Node `>=18`.

- `pnpm dev`: runs package development tasks through Turbo; starts the web app and Convex where configured.
- `pnpm build`: runs all package builds through Turbo.
- `pnpm test`: runs all package tests with Turbo caching disabled.
- `pnpm lint:fix`: runs oxlint, oxfmt, generated type steps, and TypeScript checks where defined.
- `pnpm --filter web dev`: starts Next.js on port `3000`.
- `pnpm --filter @repo/backend dev`: starts Convex development.
- `cd contracts/registry && cargo test`: runs Soroban contract tests.

## Coding Style & Naming Conventions

TypeScript and React code use `oxlint` and `oxfmt`; run `pnpm lint:fix` before handoff. Prefer existing module boundaries and workspace imports such as `@repo/ui` and `@repo/stellar`. Use kebab-case for route folders and many component files, PascalCase for React components, and camelCase for functions and variables. Rust contract code follows `cargo fmt` and keeps public types, events, and errors split across `types.rs`, `events.rs`, and `errors.rs`.

## Testing Guidelines

Web and Stellar tests use Node’s built-in test runner with files matching `*.test.ts`. Convex backend tests use Vitest via `pnpm --filter @repo/backend test`. Registry contract behavior is covered by Cargo integration tests and JSON snapshots. Add focused tests next to the feature or package you change, and update snapshots only when behavior intentionally changes.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often with Conventional Commit-style prefixes such as `feat:` and `Refactor`, sometimes with emoji. Keep commits scoped and descriptive, for example `feat: add project contract queries`. Pull requests should include a concise summary, test results, linked issues or PRD references when applicable, and screenshots for visible UI changes.

## Agent-Specific Instructions

Before editing Convex code in `packages/backend/convex`, read `packages/backend/AGENTS.md` and `packages/backend/convex/_generated/ai/guidelines.md`. Do not edit generated files in `convex/_generated` unless the relevant tool regenerated them.
