# Codebase Concerns

**Analysis Date:** 2026-06-09

## Tech Debt

**campaignId vs draftBundleRef mismatch:**
- Issue: `cinatra/oas.json` wires a `campaignId` (UUID) input through DataFlowEdges to the `followup` ApiNode, but `skills/email-follow-up/SKILL.md` explicitly states "There is NO `campaignId`. Operate on the draft bundle ref directly." and expects `draftBundleRef` as input. The OAS and the SKILL.md describe different data models for the same agent.
- Files: `cinatra/oas.json` (lines 18-22, 102-116), `skills/email-follow-up/SKILL.md` (line 14)
- Impact: If the runtime resolves the agent using the SKILL.md prompt (which references `draftBundleRef` and `objects_get`/`objects_save` MCP calls), but the OAS wires `campaignId` into the LLM prompt context, the agent will receive the wrong input identifier and may fail to fetch the draft bundle or produce incorrect output.
- Fix approach: Align the OAS `StartNode` and `followup` ApiNode inputs to use `draftBundleRef` instead of `campaignId`, or update SKILL.md to reflect that the runtime maps `campaignId` to a bundle ref before invoking the agent.

**OAS followup node does not call objects_get/objects_save:**
- Issue: The `followup` ApiNode in `cinatra/oas.json` passes `campaignId` and `followUpDays` directly to an LLM prompt and expects a `followupBundle` JSON object back inline. The SKILL.md instructs the agent to call `objects_get` then `objects_save` MCP tools and return only a `followupBundleRef` UUID. The two specifications describe incompatible output shapes (`followupBundle` object vs `followupBundleRef` string).
- Files: `cinatra/oas.json` (lines 204-232), `skills/email-follow-up/SKILL.md` (lines 17-34)
- Impact: Downstream consumers wired via DataFlowEdge to `followupBundle` (object) will break if the agent actually returns `followupBundleRef` (string). One specification will always be violated at runtime.
- Fix approach: Decide on canonical output shape. If the platform handles MCP calls internally, the OAS output should be `followupBundleRef: string`. If the LLM returns the bundle inline, SKILL.md steps 3-4 need updating.

**`package.json` missing `cinatra.kind` field:**
- Issue: The `cinatra` block in `package.json` declares `apiVersion` and `dependencies` but omits `kind: "agent"`. The `extension-kind-gate.mjs` dispatch at line 359-363 reads `pkg?.cinatra?.kind` to select validation; without it, `kind` is `undefined` and the agent OAS gate (`validateAgent`) is never invoked for the package itself (only the CI step calls the gate with `--package-root .`). The workflow gate would also be silently skipped.
- Files: `package.json`, `extension-kind-gate.mjs` (lines 352-363)
- Impact: The programmatic `runGate()` API returns `{ kind: undefined, errors: [] }` for this package, meaning any tooling calling `runGate()` rather than the CLI would silently pass without running the agent OAS validation.
- Fix approach: Add `"kind": "agent"` to the `cinatra` block in `package.json`.

**`tsconfig.json` references a non-existent `src/` directory:**
- Issue: `tsconfig.json` sets `"rootDir": "src"` and `"include": ["src/**/*.ts", "src/**/*.tsx"]`, but the repository contains no `src/` directory. There are no TypeScript source files tracked in the repo.
- Files: `tsconfig.json`
- Impact: Running `tsc` directly would produce TS18003 "No inputs were found". CI handles this gracefully by detecting no tracked `.ts` files and skipping typecheck, but the config is misleading and would cause confusion if a contributor adds TypeScript files without updating the config.
- Fix approach: Either remove `tsconfig.json` entirely (content-only agent with no TS sources), or document that it is a placeholder scaffolded for potential future TypeScript additions.

## Known Bugs

**OAS `followupBundle` output is untyped (`type: "object"`):**
- Symptoms: The `followup` ApiNode and `EndNode` declare `followupBundle` as `type: "object"` with no JSON schema. Downstream nodes or consumers receive no schema validation.
- Files: `cinatra/oas.json` (lines 220-223, 237-240)
- Trigger: Any downstream DataFlowEdge consuming `followupBundle` from the EndNode.
- Workaround: None — the platform accepts untyped objects but provides no runtime shape enforcement.

## Security Considerations

**`campaignId` (UUID) visible in LLM prompt:**
- Risk: The `followup` ApiNode embeds `{{ campaignId }}` directly in the user-visible LLM prompt string. If `campaignId` is a tenant-scoped identifier that should not appear in LLM context (e.g., to prevent prompt injection attacks that exfiltrate IDs), this is a leakage surface.
- Files: `cinatra/oas.json` (lines 210-212)
- Current mitigation: `campaignId` is marked `hidden` in the StartNode metadata (line 175), preventing UI display, but it is still passed to the LLM prompt.
- Recommendations: Evaluate whether campaign UUIDs in LLM prompts are acceptable under the platform's threat model. If not, pass only the draft content (fetched server-side) rather than the raw ID.

**`.npmrc` present — note existence only:**
- `.npmrc` exists in the repo root. Contents not read. Verify it does not contain auth tokens that could be committed inadvertently.
- Files: `.npmrc`

## Performance Bottlenecks

**Single-step LLM call with no streaming:**
- Problem: All follow-up drafts for the entire cadence are generated in one blocking ApiNode call. For a cadence with many steps (e.g., 5-7 follow-ups), the LLM must produce all drafts in a single response.
- Files: `cinatra/oas.json` (lines 204-232)
- Cause: The OAS models the drafting as one `ApiNode` with no fan-out or streaming node type.
- Improvement path: If the platform supports fan-out or parallel agent nodes, consider splitting per-step drafting. Otherwise this is a platform constraint.

## Fragile Areas

**SKILL.md is the sole authoritative prompt definition:**
- Files: `skills/email-follow-up/SKILL.md`
- Why fragile: Agent behavior is fully determined by the SKILL.md markdown prompt. Any edit directly changes production LLM behavior with no compilation step, no test suite, and no schema validation. There is no diff-level gate that catches regressions in instructions.
- Safe modification: Review the full SKILL.md before any edit. Verify the Steps section remains consistent with the OAS DataFlowEdge wiring and output shape.
- Test coverage: No tests exist for prompt behavior.

**OAS `cinatra/oas.json` is hand-authored with no schema validation in CI:**
- Files: `cinatra/oas.json`, `.github/workflows/ci.yml`
- Why fragile: The CI agent gate (`extension-kind-gate.mjs`) only scans for retired CRM primitive strings in LLM-visible fields. It does not validate the OAS JSON against any agentspec schema. Structural errors (wrong node types, missing required fields, mismatched DataFlowEdge port names) would only be caught marketplace-side at publish time.
- Safe modification: Cross-reference any structural OAS changes against the `agentspec_version: 26.1.0` schema before pushing.
- Test coverage: No unit tests for OAS structure; `extension-kind-gate.mjs` tests cover only the retired-primitive scan logic.

**`approval_gate` output is not data-flow connected to `followup` node:**
- Files: `cinatra/oas.json` (lines 66-98, 149-159)
- Why fragile: The `approval_gate` (InputMessageNode) collects `userResponse` and passes it to `EndNode`, but there is no ControlFlowEdge or DataFlowEdge that feeds user edits back to the `followup` node for re-drafting. If a reviewer requests changes, the flow ends rather than looping. Any revision cycle requires re-running the entire flow.
- Safe modification: Adding a revision loop would require new conditional branching nodes and edges in the OAS.
- Test coverage: None.

## Scaling Limits

**Follow-up cadence has no enforced upper bound:**
- Current capacity: `followUpDays` is an unbounded integer array with no `maxItems` constraint in the OAS JSON schema.
- Limit: A very large cadence array (e.g., 50 steps) would produce a proportionally large LLM prompt response, potentially exceeding model context limits or timeout limits of the ApiNode call.
- Scaling path: Add `"maxItems"` to the `followUpDays` JSON schema in the OAS StartNode inputs and document a recommended maximum (e.g., 10 steps).

## Dependencies at Risk

**Runtime dependency on `@cinatra-ai/reviewer-agent` is undeclared as a peer:**
- Risk: `package.json` declares `@cinatra-ai/reviewer-agent` under `cinatra.dependencies` (runtime edge) and `cinatra.agentDependencies`, but does NOT declare it as a `peerDependency` with `peerDependenciesMeta.optional: true`. The CI classification script checks `peerDependencies` to determine if this is a source mirror (first-party peer present) or a standalone repo. Without the peer declaration, CI treats this as a standalone repo and attempts full install/typecheck/test — which succeeds only because there are no TS sources and no test script, but the classification is semantically wrong.
- Files: `package.json`, `.github/workflows/ci.yml` (lines 50-69)
- Impact: The CI skip logic for monorepo-provided deps does not apply, so if a `devDependency` or test referencing `@cinatra-ai/reviewer-agent` is ever added, CI will fail with a registry 404.
- Migration plan: Add `@cinatra-ai/reviewer-agent` to `peerDependencies` with `peerDependenciesMeta: { "@cinatra-ai/reviewer-agent": { "optional": true } }`.

**Pinned to `gpt-5.5` model:**
- Risk: `cinatra/oas.json` hard-codes `"preferredModel": "gpt-5.5"`. If this model is deprecated or renamed by the provider, the ApiNode will fail silently or fall back to platform defaults with no warning.
- Files: `cinatra/oas.json` (line 217)
- Impact: Unexpected model substitution may change draft quality without surfacing as an error.
- Migration plan: Confirm with platform docs whether model aliases are stable. Consider using a versioned alias or making the model configurable.

## Missing Critical Features

**No revision loop after human review:**
- Problem: The `approval_gate` collects user feedback (`userResponse`) but the flow terminates immediately after — there is no mechanism to re-draft based on reviewer feedback without restarting the entire flow.
- Blocks: Iterative refinement of follow-up drafts within a single flow run.

**No error handling nodes in the OAS flow:**
- Problem: The OAS defines no error/fallback ControlFlowEdges. If the `followup` ApiNode fails (LLM timeout, malformed JSON response, etc.), the flow has no recovery path.
- Files: `cinatra/oas.json`
- Blocks: Graceful degradation on LLM failures.

## Test Coverage Gaps

**No tests of any kind:**
- What's not tested: Agent prompt instructions (SKILL.md), OAS structural validity beyond retired-primitive scan, follow-up draft quality, cadence input handling, approval gate wiring, output shape.
- Files: Entire repository — no `*.test.*` or `*.spec.*` files exist.
- Risk: Any change to SKILL.md or `cinatra/oas.json` can introduce regressions with no automated detection. The platform's marketplace-side validation is the only gate beyond the retired-primitive CI scan.
- Priority: High — the `extension-kind-gate.mjs` itself has no accompanying test file in this repo (tests live in the monorepo), so the gate logic shipped here is untested in isolation.

---

*Concerns audit: 2026-06-09*
