# Email Follow-up Agent

Draft a follow-up sequence for recipients who did not reply to the initial outreach. The agent writes one email per cadence step and pauses for human review before returning the approved bundle.

**Purpose.** Given a campaign identifier and a list of day offsets (for example `[3, 7, 14]`), the agent produces a follow-up email for each offset. Each email preserves the campaign's tone and value proposition while varying the wording and angle.

**Configuration.** The agent receives `campaignId` and `followUpDays` from the platform when triggered from a campaign context. No manual credential setup is required; `agent_run_id` is injected automatically by the runtime.

**Usage.** Launch the agent from your campaign context, supply the cadence (day offsets from the initial send), and confirm. The agent drafts the full sequence and presents it for human review; the approved bundle is returned for use downstream.

**Failure modes.** If the LLM call fails or required inputs are missing, the agent surfaces an error in the run log. No emails are sent; the approval gate is never reached. Correct the campaign data and re-run.

## Works with

- Cinatra campaigns (outreach context and cadence configuration)
- Reviewer Agent (renders the approval gate for human review of the draft bundle)

## Capabilities

- Draft a multi-step follow-up sequence for an outreach campaign
- Space each follow-up by a configurable day offset from the initial send
- Keep tone and value proposition consistent with the original outreach
- Pause for human review and approval before returning the approved bundle
- Return the full follow-up bundle as a single reviewable object
