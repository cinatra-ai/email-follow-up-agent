# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- JSON — Agent flow definition (`cinatra/oas.json`), package manifest (`package.json`)
- Markdown — Skill prompt (`skills/email-follow-up/SKILL.md`), documentation (`README.md`)

**Secondary:**
- TypeScript — Configured via `tsconfig.json` (ES2023 target, ESNext modules); no `src/` directory exists in this repo — TypeScript is configured for when sources are added within the cinatra monorepo context
- JavaScript (ESM) — CI validation utility (`extension-kind-gate.mjs`)

## Runtime

**Environment:**
- Node.js 24 (specified in `.github/workflows/ci.yml`)

**Package Manager:**
- pnpm (via corepack, enforced in CI)
- Lockfile: not committed (CI uses `--no-frozen-lockfile`)

## Frameworks

**Core:**
- Cinatra Agent Platform (`cinatra.ai/v1`) — proprietary flow runtime that executes this agent; flow defined in `cinatra/oas.json` using agentspec version 26.1.0

**Testing:**
- Not applicable — no test files present; tests run in cinatra monorepo context

**Build/Dev:**
- TypeScript compiler (`tsc`) — configured via `tsconfig.json`, target ES2023, module ESNext, bundler resolution
- corepack + pnpm — dependency management in CI

## Key Dependencies

**Critical:**
- `@cinatra-ai/reviewer-agent` `^0.1.0` — runtime agent dependency declared in `package.json` under `cinatra.agentDependencies`; provides the human-in-the-loop approval UI screen (`@cinatra-ai/reviewer-agent:output`)

**Infrastructure:**
- No npm `dependencies` or `devDependencies` declared; this is a source-mirror repo whose host-internal `@cinatra-ai/*` peers are resolved by the cinatra monorepo

## Configuration

**Environment:**
- `CINATRA_BASE_URL` — runtime-injected template variable used in `cinatra/oas.json` as the LLM bridge endpoint (`{{CINATRA_BASE_URL}}/api/llm-bridge`)
- `.npmrc` — present (existence noted; contents not read)

**Build:**
- `tsconfig.json` — standalone strict TypeScript config; targets `src/` directory (not present in this extracted repo)
- `cinatra/oas.json` — primary agent flow definition (agentspec 26.1.0)
- `extension-kind-gate.mjs` — zero-dependency CI validation script for agent OAS shape

## Platform Requirements

**Development:**
- Node.js 24+
- corepack/pnpm for dependency management
- Cinatra monorepo provides all `@cinatra-ai/*` peer packages; this repo is not standalone-installable

**Production:**
- Cinatra AI platform runtime (cloud-hosted)
- LLM bridge endpoint via `CINATRA_BASE_URL`
- OpenAI API (preferred provider `openai`, preferred model `gpt-5.5`) — invoked by platform runtime

---

*Stack analysis: 2026-06-09*
