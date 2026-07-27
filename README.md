# Email Follow-up Agent

Draft a follow-up sequence for recipients who did not reply to the initial outreach. The agent writes one email per cadence step and hands the drafted bundle to the platform, which opens a review gate on the produced follow-up artifact so a human approves or rejects it before it is used downstream.

**Purpose.** Given a campaign identifier and a list of day offsets (for example `[3, 7, 14]`), the agent produces a follow-up email for each offset. Each email preserves the campaign's tone and value proposition while varying the wording and angle.

**Configuration.** The agent receives `campaignId` and `followUpDays` from the platform when triggered from a campaign context. No manual credential setup is required; `agent_run_id` is injected automatically by the runtime.

**Usage.** Launch the agent from your campaign context, supply the cadence (day offsets from the initial send), and confirm. The agent drafts the full sequence and produces it as a follow-up artifact; the platform's review step is where you read the drafts and approve or reject them.

**Review.** The agent ships no review code of its own. Core intercepts the artifact lifecycle: when this run produces the follow-up artifact, the platform opens the review gate on the run per policy, renders the drafts with the artifact's own renderer, and records the approve / request-changes / reject decision. The follow-up drafts are a local artifact with no external effect of their own, so the decision is the record that governs whether they are used downstream — the send itself is a separate agent whose own external effect is gated at that point.

**Failure modes.** If the LLM call fails or required inputs are missing, the agent surfaces an error in the run log. No emails are sent, and no artifact is produced, so no review gate opens. Correct the campaign data and re-run.

## Works with

- Cinatra campaigns (outreach context and cadence configuration)
- Cinatra email artifacts (the follow-up body artifact type and its renderer)

## Capabilities

- Draft a multi-step follow-up sequence for an outreach campaign
- Space each follow-up by a configurable day offset from the initial send
- Keep tone and value proposition consistent with the original outreach
- Persist the drafted bundle as a durable campaign record
- Produce the follow-up digest as a reviewable artifact for the platform review gate
