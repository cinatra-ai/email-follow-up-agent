# Testing Patterns

**Analysis Date:** 2026-06-09

## Overview

This is a content-only Cinatra agent extension (no `src/` TypeScript). The primary testable artifact is `extension-kind-gate.mjs`, a self-contained Node.js CI gate script. No test framework, test files, or test runner configuration exist in this repo. Testing of the agent's LLM behavior is owned by the cinatra monorepo.

## Test Framework

**Runner:** Not applicable — no test runner configured in this repo.

**Assertion Library:** Not applicable.

**Run Commands:**
```bash
# No test script in package.json.
# CI runs the gate directly:
node extension-kind-gate.mjs --package-root .
```

## Test File Organization

**Location:** No test files exist in this repo (`*.test.*`, `*.spec.*` — none found).

**Naming:** Not applicable.

## CI Gate (Functional Validation)

While there are no unit tests, `extension-kind-gate.mjs` functions as both the implementation AND the validation layer for the extension's correctness contract. It is exercised directly in CI.

**CI job: `kind-gates`** (`.github/workflows/ci.yml`, line 129):
```yaml
- name: Agent OAS validation gate
  run: node extension-kind-gate.mjs --package-root .
```

**What the gate validates:**
- `cinatra/oas.json` parses as valid JSON
- No retired CRM primitives (`lists_list`, `contacts_get`, etc.) appear in LLM-visible OAS fields (`system`, `user`, `description`)
- No banned entity typeHints (`@cinatra-ai/entity-accounts:account`, `@cinatra-ai/entity-contacts:contact`)
- No `objects_list` over CRM entity types (retired read path)

**CI job: `build`** (`.github/workflows/ci.yml`, line 22):
- Validates `package.json` first-party dependency shape (no `@cinatra-ai/*` in deps/devDeps)
- Skips install/typecheck/test for source-mirror repos (those with host-internal optional peers)
- Runs `npm pack --dry-run` to validate publish payload shape

## Testable Functions in extension-kind-gate.mjs

These exported functions are pure and independently testable without a framework:

| Function | File | Input | Output |
|----------|------|-------|--------|
| `parseArgs(argv)` | `extension-kind-gate.mjs` | `string[]` | `{ packageRoot }` |
| `validateAgent(packageRoot)` | `extension-kind-gate.mjs` | directory path | `string[]` errors |
| `validateWorkflowPackageShape(pkg)` | `extension-kind-gate.mjs` | parsed JSON obj | `string[]` errors |
| `validateBpmnSanity(xml)` | `extension-kind-gate.mjs` | XML string | `string[]` errors |
| `findWorkflowSidecars(packageRoot)` | `extension-kind-gate.mjs` | directory path | `string[]` paths |
| `validateWorkflow(packageRoot)` | `extension-kind-gate.mjs` | directory path | `string[]` errors |
| `runGate(packageRoot)` | `extension-kind-gate.mjs` | directory path | `{ kind, errors }` |

If tests are added, they should import these functions directly via ESM:
```js
import { validateBpmnSanity, validateWorkflowPackageShape } from "./extension-kind-gate.mjs";
```

## Mocking

**Framework:** Not applicable — no tests exist.

**If tests were added:** I/O-heavy functions (`validateAgent`, `validateWorkflow`, `findWorkflowSidecars`) depend on `node:fs` reads. These would require either temp directories with fixture files or mocking `node:fs` using Node's `--experimental-vm-modules` or a mock library.

**Pure functions** (`validateBpmnSanity`, `validateWorkflowPackageShape`, `scanOasString`) require no mocking — they accept strings/objects and return arrays.

## Fixtures and Factories

**Test Data:** None — no fixtures directory exists.

**If tests were added, fixtures would include:**
- Minimal valid `cinatra/oas.json` (agent kind, no banned primitives)
- `cinatra/oas.json` with each banned primitive for negative tests
- Valid BPMN XML with `bpmn:definitions` root and `xmlns` binding `http://www.omg.org/spec/BPMN/20100524/MODEL`
- Malformed BPMN XML (unclosed tags, wrong root, missing namespace)

## Coverage

**Requirements:** None enforced — no coverage tooling configured.

**Coverage Command:** Not applicable.

## Test Types

**Unit Tests:** Not present. The gate functions are pure and unit-testable in isolation.

**Integration Tests:** Not present. CI acts as a coarse integration test by running `node extension-kind-gate.mjs --package-root .` against the live repo contents.

**E2E Tests:** Not used. Agent behavioral testing (LLM prompt quality, tool-call correctness) is owned by the cinatra monorepo.

## Adding Tests

If a test runner is introduced, the recommended approach given the ESM module system:

1. Add `vitest` or `node:test` (built-in, zero deps)
2. Add `"test": "vitest run"` or `"test": "node --test"` to `package.json` scripts
3. Place test files as `*.test.mjs` alongside `extension-kind-gate.mjs`
4. Focus on: `validateBpmnSanity` (many XML edge cases), `validateWorkflowPackageShape` (shape rules), `scanOasString` (banned primitive detection)

---

*Testing analysis: 2026-06-09*
