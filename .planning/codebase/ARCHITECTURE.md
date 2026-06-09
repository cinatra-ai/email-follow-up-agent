<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                   Cinatra Agent Runtime                          │
│              (external — invokes this agent via API)             │
└────────────────────────────┬────────────────────────────────────┘
                             │  POST /api/llm-bridge
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Flow: email-follow-up-flow                     │
│                    `cinatra/oas.json`                            │
│                                                                  │
│  [StartNode] ──► [ApiNode: followup] ──► [InputMessageNode:     │
│  "Inputs"         "Draft follow-up        approval_gate]        │
│                    emails"                "Review and approve"  │
│                         │                       │               │
│                         └──────────┬────────────┘               │
│                                    ▼                             │
│                             [EndNode: end]                       │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              LLM (OpenAI gpt-5.5, via llm-bridge)               │
│              Skill: `skills/email-follow-up/SKILL.md`            │
│              MCP tools: objects_get, objects_save                │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Flow definition | Declares the complete agent flow: nodes, control/data edges, I/O schema | `cinatra/oas.json` |
| StartNode (`start`) | Accepts `campaignId`, `followUpDays`, `agent_run_id` inputs; renders `followUpDays` via custom UI renderer | `cinatra/oas.json` (`$referenced_components.start`) |
| ApiNode (`followup`) | Calls `{{CINATRA_BASE_URL}}/api/llm-bridge` via POST; instructs LLM to draft follow-up emails; carries the `agent_id: "email-follow-up"` identifier that loads the skill | `cinatra/oas.json` (`$referenced_components.followup`) |
| InputMessageNode (`approval_gate`) | Human-in-the-loop gate; renders output via `@cinatra-ai/reviewer-agent:followups-output`; collects `userResponse` | `cinatra/oas.json` (`$referenced_components.approval_gate`) |
| EndNode (`end`) | Emits `followupBundle` (object) and `userResponse` (string) to orchestrator | `cinatra/oas.json` (`$referenced_components.end`) |
| Skill instructions | Defines LLM behaviour: steps, quality standards, MCP tool usage | `skills/email-follow-up/SKILL.md` |
| CI gate | Zero-dependency Node.js gate; validates `cinatra/oas.json` for banned primitives before publish | `extension-kind-gate.mjs` |

## Pattern Overview

**Overall:** Cinatra declarative agent flow (OAS-defined, runtime-executed)

**Key Characteristics:**
- No application source code (`src/` is referenced in `tsconfig.json` but does not exist in the repo — the repo is a content-only source mirror)
- Entire agent behaviour is declared in JSON (`cinatra/oas.json`) and a Markdown skill file (`skills/email-follow-up/SKILL.md`)
- The Cinatra runtime interprets the OAS flow graph; no host-side orchestration logic lives here
- Human-in-the-loop (HITL) is modelled as a first-class node (`InputMessageNode`) with a named renderer surfaced by `@cinatra-ai/reviewer-agent`
- Data flows between nodes are explicit `DataFlowEdge` declarations — no implicit sharing

## Layers

**Flow Declaration Layer:**
- Purpose: Defines the agent's node graph, I/O schema, control flow, and data flow
- Location: `cinatra/oas.json`
- Contains: StartNode, ApiNode, InputMessageNode, EndNode, ControlFlowEdges, DataFlowEdges
- Depends on: Cinatra runtime (external)
- Used by: Cinatra runtime at agent invocation

**Skill / Instruction Layer:**
- Purpose: Provides the natural-language system prompt and step-by-step instructions injected into the LLM call
- Location: `skills/email-follow-up/SKILL.md`
- Contains: Input descriptions, step sequence, quality standards, MCP tool usage rules
- Depends on: LLM bridge, MCP tools (`objects_get`, `objects_save`)
- Used by: ApiNode (`followup`) via `agent_id: "email-follow-up"` resolution by the runtime

**CI Gate Layer:**
- Purpose: Pre-publish sanity check; scans OAS for retired CRM primitives; validates workflow BPMN shape for workflow-kind repos
- Location: `extension-kind-gate.mjs`
- Contains: `validateAgent`, `validateWorkflow`, `validateBpmnSanity`, `runGate`
- Depends on: Node.js builtins only (zero external dependencies)
- Used by: `.github/workflows/ci.yml` (`kind-gates` job)

## Data Flow

### Primary Request Path

1. Caller (orchestrator or UI) invokes the flow with `campaignId`, `followUpDays`, `agent_run_id` → StartNode (`cinatra/oas.json`, `$referenced_components.start`)
2. DataFlowEdges carry all three inputs to ApiNode (`followup`)
3. ApiNode POSTs to `{{CINATRA_BASE_URL}}/api/llm-bridge`; LLM executes skill steps: fetches draft bundle via `objects_get`, drafts follow-ups, persists via `objects_save` → returns `followupBundle` (`cinatra/oas.json`, `$referenced_components.followup`)
4. `followupBundle` flows via DataFlowEdge to EndNode
5. Control passes to InputMessageNode (`approval_gate`); human reviews via `@cinatra-ai/reviewer-agent:followups-output`; emits `userResponse`
6. `userResponse` flows via DataFlowEdge to EndNode
7. EndNode surfaces both `followupBundle` and `userResponse` to orchestrator (`cinatra/oas.json`, `$referenced_components.end`)

### CI Validation Path

1. `ci.yml` push/PR triggers `build` job → classifies repo as source mirror (has `@cinatra-ai/*` peers) → skips standalone install/typecheck/test
2. `npm pack --dry-run` validates package shape
3. `kind-gates` job runs after `build` → executes `node extension-kind-gate.mjs --package-root .`
4. Gate reads `cinatra/oas.json`, walks LLM-visible fields (`system`, `user`, `description`), reports banned primitive violations

**State Management:**
- No in-process state; all persistent state is stored as Cinatra objects via `objects_save` MCP tool and referenced by UUID (`followupBundleRef`)

## Key Abstractions

**OAS Flow Graph:**
- Purpose: Declarative directed graph of nodes and typed edges; the runtime executes it without any host code
- Examples: `cinatra/oas.json`
- Pattern: Start → processing nodes → HITL gate → End, with separate ControlFlowEdge and DataFlowEdge lists

**Cinatra Skill (SKILL.md):**
- Purpose: Markdown document that defines LLM agent identity, steps, and quality rules; loaded by runtime via `agent_id`
- Examples: `skills/email-follow-up/SKILL.md`
- Pattern: YAML front-matter (`name`, `description`) + heading-sectioned instructions

**Extension Kind Gate:**
- Purpose: Reusable, self-contained CI validator shipped into each extracted extension repo
- Examples: `extension-kind-gate.mjs`
- Pattern: Pure exported functions (`validateAgent`, `validateWorkflow`) + `runGate` dispatcher + `main()` guard

## Entry Points

**Agent Flow Entry:**
- Location: `cinatra/oas.json` (`start_node.$component_ref: "start"`)
- Triggers: Cinatra runtime invocation (orchestrator DataFlowEdge or direct UI invocation)
- Responsibilities: Validates required `campaignId`, optionally collects `followUpDays` via custom renderer `@cinatra-ai/email-follow-up-agent:follow-up-cadence`

**CI Gate Entry:**
- Location: `extension-kind-gate.mjs` (`main()` function, line 365)
- Triggers: `node extension-kind-gate.mjs --package-root .` in `.github/workflows/ci.yml`
- Responsibilities: Reads `package.json` to detect kind, dispatches to `validateAgent` or `validateWorkflow`, exits 0/1

## Architectural Constraints

- **No source code:** `tsconfig.json` declares `rootDir: "src"` but `src/` does not exist; this repo is a content-only source mirror — TypeScript compilation is skipped in CI for source mirrors
- **Zero-dependency gate:** `extension-kind-gate.mjs` uses only Node.js builtins; must never import `@cinatra-ai/*` packages
- **Global state:** None — all functions in `extension-kind-gate.mjs` are pure; no module-level mutable state
- **Circular imports:** Not applicable (no module graph beyond `extension-kind-gate.mjs`)
- **Monorepo dependency:** `@cinatra-ai/reviewer-agent` is declared as a runtime `cinatra.agentDependencies` dep in `package.json`; it is NOT a npm dependency and is resolved exclusively by the Cinatra runtime

## Anti-Patterns

### Placing campaignId in rawData when persisting follow-up bundles

**What happens:** Including `campaignId` in the `objects_save` payload
**Why it's wrong:** The skill explicitly prohibits it (`Do NOT include campaignId in rawData`); the object schema for `@cinatra-ai/campaigns:email-followup-bundle` does not carry campaign identity at the bundle level
**Do this instead:** Omit `campaignId`; the orchestrator wires identity via `DataFlowEdge` referencing `followupBundleRef` (`skills/email-follow-up/SKILL.md`, Step 3)

### Using retired CRM primitives in OAS prompt strings

**What happens:** Referencing `contacts_list`, `accounts_get`, etc. in `system`/`user`/`description` fields of `cinatra/oas.json`
**Why it's wrong:** Banned primitives are caught by `extension-kind-gate.mjs` and will fail CI; they route around the `crm_*` facade layer
**Do this instead:** Use `crm_account_search` / `crm_contact_search` facades (`extension-kind-gate.mjs`, lines 65–71)

## Error Handling

**Strategy:** Errors surface through the Cinatra runtime's flow execution model; no custom error handling in this repo's code.

**Patterns:**
- CI gate: pure error accumulation — each validator returns `string[]` errors; `runGate` dispatches and `main()` prints all errors and exits 1
- LLM failures: handled by the Cinatra runtime's `llm-bridge` retry/error policy (not defined here)

## Cross-Cutting Concerns

**Logging:** None in repo code; CI uses `console.log`/`console.error` in `extension-kind-gate.mjs`
**Validation:** Pre-publish OAS validation via `extension-kind-gate.mjs`; runtime-side OAS invariant validation happens marketplace-side at publish/install
**Authentication:** Not applicable in repo code; `{{CINATRA_BASE_URL}}` resolution and auth are runtime concerns

---

*Architecture analysis: 2026-06-09*
