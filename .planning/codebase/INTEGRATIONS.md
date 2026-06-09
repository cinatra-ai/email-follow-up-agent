# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**Cinatra LLM Bridge:**
- Service: Cinatra internal LLM bridge API
- What it's used for: Executes the email follow-up drafting LLM task; receives campaign context and returns drafted follow-up email sequence as JSON
- Endpoint: `{{CINATRA_BASE_URL}}/api/llm-bridge` (POST), configured in `cinatra/oas.json` under the `followup` ApiNode
- Auth: Injected by Cinatra platform runtime via `CINATRA_BASE_URL`

**OpenAI:**
- Service: OpenAI chat completions
- What it's used for: Underlying LLM that generates follow-up email drafts
- Preferred model: `gpt-5.5` (declared in `cinatra/oas.json` under `cinatra_llm.preferredModel`)
- Auth: Managed by Cinatra platform; not directly configured in this repo

## Data Storage

**Databases:**
- Cinatra Objects Store — accessed via MCP tools `objects_get` and `objects_save` as described in `skills/email-follow-up/SKILL.md`
  - `objects_get`: fetches draft bundle by UUID ref (`draftBundleRef`)
  - `objects_save`: persists follow-up bundle with type hint `@cinatra-ai/campaigns:email-followup-bundle`, returns UUID
  - Connection: managed by Cinatra platform runtime

**File Storage:**
- Not applicable

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- Cinatra platform runtime — all authentication is handled by the platform; this agent repo contains no auth implementation
- `agent_run_id` input is injected by the runtime (hidden from end users, declared in `cinatra/oas.json`)

## Monitoring & Observability

**Error Tracking:**
- Not detected in this repo; handled by Cinatra platform runtime

**Logs:**
- Not applicable — no application code in this extracted source-mirror repo

## CI/CD & Deployment

**Hosting:**
- Cinatra AI platform (cloud-hosted agent runtime)

**CI Pipeline:**
- GitHub Actions — `.github/workflows/ci.yml` and `.github/workflows/release.yml`
- CI jobs: `build` (classify repo, install, typecheck, test, pack dry-run) and `kind-gates` (agent OAS validation via `extension-kind-gate.mjs`)
- Node.js 24 on `ubuntu-latest`
- Triggers: push and pull_request to `main` branch

## Environment Configuration

**Required env vars:**
- `CINATRA_BASE_URL` — Cinatra platform base URL; injected at runtime, used in `cinatra/oas.json` LLM bridge URL template

**Secrets location:**
- `.npmrc` file present — existence noted, contents not read

## Webhooks & Callbacks

**Incoming:**
- Not applicable

**Outgoing:**
- Not applicable — agent is invoked by and returns results to the Cinatra platform orchestrator

## Agent Dependencies

**Runtime Agent Dependencies (declared in `package.json`):**
- `@cinatra-ai/reviewer-agent` `^0.1.0` — provides the human-in-the-loop approval UI screen
  - Used in `cinatra/oas.json` as `approval_gate` node (InputMessageNode) with renderer `@cinatra-ai/reviewer-agent:followups-output`
  - HITL screen registered under `metadata.cinatra.hitlScreens`: `["@cinatra-ai/reviewer-agent:output"]`
  - Requires human review and approval before follow-up cadence goes live

## Data Contracts

**Input objects consumed:**
- `@cinatra-ai/campaigns:drafts` — draft bundle object fetched via `objects_get` using `draftBundleRef` UUID; contains `rawData.drafts` with campaign content, value proposition, and tone

**Output objects produced:**
- `@cinatra-ai/campaigns:email-followup-bundle` — persisted via `objects_save`; shape: `{ "followups": [{ "stepNumber": N, "subject": "...", "body": "..." }], "cadenceDays": [3, 7, 14] }`

---

*Integration audit: 2026-06-09*
