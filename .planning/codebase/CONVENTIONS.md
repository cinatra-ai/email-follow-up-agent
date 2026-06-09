# Coding Conventions

**Analysis Date:** 2026-06-09

## Overview

This is a content-only Cinatra agent extension. It ships no TypeScript `src/` — the primary authored files are `skills/email-follow-up/SKILL.md` (prompt instructions), `cinatra/oas.json` (agent surface spec), and `extension-kind-gate.mjs` (CI gate script). Conventions below reflect the actual files present.

## Naming Patterns

**Files:**
- Kebab-case for all file and directory names: `email-follow-up/`, `extension-kind-gate.mjs`, `oas.json`
- Agent skill directories match the package slug: `skills/email-follow-up/`
- Cinatra sidecar files live under `cinatra/`: `cinatra/oas.json`

**Package:**
- Scoped npm package name pattern: `@cinatra-ai/<slug>-agent` (e.g., `@cinatra-ai/email-follow-up-agent`)
- Workflow packages follow `@<scope>/<slug>-workflow` — enforced by `extension-kind-gate.mjs` via `WORKFLOW_PACKAGE_NAME_RE`

**OAS / Agent spec fields:**
- `camelCase` for input/output titles: `draftBundleRef`, `followUpDays`, `agent_run_id` (snake_case for injected runtime field)
- `kebab-case` for node `id` and `$component_ref` values: `email-follow-up-flow`, `followup`
- TypeHint strings use namespaced `@scope/package:type` format: `@cinatra-ai/campaigns:email-followup-bundle`

**Functions (extension-kind-gate.mjs):**
- camelCase exported functions: `parseArgs`, `validateAgent`, `validateWorkflow`, `validateWorkflowPackageShape`, `validateBpmnSanity`, `findWorkflowSidecars`, `runGate`
- camelCase internal helpers: `walkLlmStrings`, `scanOasString`, `wordBoundary`
- Constants in SCREAMING_SNAKE_CASE: `LLM_VISIBLE_FIELDS`, `BANNED_PRIMITIVES`, `BANNED_TYPEHINTS`, `BPMN_MODEL_NS`, `WORKFLOW_PACKAGE_NAME_RE`

## Code Style

**Formatting:**
- No explicit Prettier or ESLint config detected in this repo; style is consistent with the monorepo source it was extracted from.
- Indentation: 2 spaces (observed in `extension-kind-gate.mjs` and JSON files)
- Trailing commas in arrays/objects

**Module system:**
- ESM throughout — `package.json` declares `"type": "module"`
- `extension-kind-gate.mjs` uses `import { ... } from "node:fs"` / `"node:path"` (node: prefix protocol)
- No CommonJS `require()` in source files (CI scripts use inline `require()` in shell `node -e` one-liners only)

**TypeScript config (`tsconfig.json`):**
- Target: `ES2023`, module: `ESNext`, moduleResolution: `bundler`
- `strict: true` but `noImplicitAny: false`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `isolatedModules: true`
- Output to `dist/`, roots from `src/` (no `src/` exists yet — content-only repo)

## Import Organization

**Order (in `extension-kind-gate.mjs`):**
1. Node built-ins with `node:` prefix (`node:fs`, `node:path`)
2. No third-party or internal imports — zero external dependencies by design

**Path Aliases:**
- None — standalone repo with no module aliases

## Error Handling

**Patterns (in `extension-kind-gate.mjs`):**
- Validation functions are pure: they return `string[]` error arrays rather than throwing.
- Early return on fatal condition (e.g., missing file stops further checks).
- `try/catch` around I/O operations; errors cast via `err instanceof Error ? err.message : String(err)`.
- `process.exit(1)` on violations; `process.exit(0)` on success — no thrown exceptions escape `main()`.
- The gate is intentionally fail-open for unknown `cinatra.kind` values (returns `{ errors: [] }`).

Example pattern from `extension-kind-gate.mjs`:
```js
try {
  parsed = JSON.parse(readFileSync(oasPath, "utf8"));
} catch (err) {
  errors.push(`cinatra/oas.json failed to parse: ${err instanceof Error ? err.message : String(err)}`);
  return errors;
}
```

## Logging

**Framework:** `console.log` / `console.error` (no logging library)

**Patterns:**
- Success messages go to `stdout` via `console.log` with a leading `✓` prefix
- Failure messages go to `stderr` via `console.error` with a leading `✗` prefix and bullet `•` per error
- CI steps use `echo` and `::error::` GitHub Actions annotations

## Comments

**When to Comment:**
- Module-level block comments explain WHY something exists and its design constraints (see `extension-kind-gate.mjs` header)
- Section dividers use `// ----...----` lines with a label
- Inline comments explain non-obvious rules (e.g., regex rationale, fail-open logic)
- `//` comments in JSON (`package.json` `"//": "..."` key) used for human notes

**JSDoc/TSDoc:**
- JSDoc-style `/** ... */` used for exported functions in `extension-kind-gate.mjs`
- No `@param`/`@returns` annotations — relies on TypeScript types (when present)

## Function Design

**Size:** Functions are small and single-purpose. `validateBpmnSanity` is the largest at ~70 lines due to regex walking complexity.

**Parameters:** Functions accept primitives or plain objects; no class instances. Pure functions preferred (input → output, no side effects).

**Return Values:** Validation functions return `string[]` (empty = pass). The `runGate` function returns `{ kind, errors }`.

## Module Design

**Exports:** `extension-kind-gate.mjs` exports all public functions explicitly for testability; `main()` is not exported. Guarded invocation:
```js
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) { main(); }
```

**Barrel Files:** Not applicable — single script file, no module index.

## SKILL.md Prompt Conventions

- Written in imperative markdown with `## Steps` and `## [Section]` headings
- Each step is numbered and prefixed `STEP N —`
- Inputs and outputs defined in a `## Inputs` section with inline type annotations
- Negative rules use "Do NOT" / "Never" phrasing
- Quality standards expressed as bullet lists under `## [Topic] quality standards`
- Greeting placeholders used instead of literal contact names (audience: technical)

---

*Convention analysis: 2026-06-09*
