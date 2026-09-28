// W8 (cinatra#3096) items 8, 10 and 19 on the email follow-up agent.
//
// (8) The campaign is a visible pick: the start form shows it and asks for it,
// since no flow supplies it. It is never hidden and never defaulted away.
//
// (10) The follow-up review is not a step of the run: the digest this run files
// opens its own review afterwards. The flow has no pause of its own, and the
// manifest says so in its description instead of claiming a gate.
//
// (19) A run that ends closes with a plain sentence - how many follow-ups were
// written, or that none was - never with the raw values the run hands on.
//
// The last two arms re-state the runtime loader's two mount rules over this
// flow, as cinatra-ai/email-outreach-agent holds them in its own suite: (A)
// every input a step requires has a source on every path that reaches it, and
// (B) an OutputMessageNode declares only inputs its template reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const oas = JSON.parse(readFileSync(join(root, "cinatra/oas.json"), "utf8"));
const refs = oas.$referenced_components;
const start = refs.start;
const nodesOfType = (type) => Object.values(refs).filter((n) => n.component_type === type);
const controlEdges = (oas.control_flow_connections ?? []).map((e) => ({
  from: e.from_node.$component_ref,
  to: e.to_node.$component_ref,
}));
const hasEdge = (from, to) => controlEdges.some((e) => e.from === from && e.to === to);
const dataEdges = (oas.data_flow_connections ?? []).map((e) => [
  e.source_node.$component_ref + "." + e.source_output,
  e.destination_node.$component_ref + "." + e.destination_input,
]);
const countDataEdges = (from, to) => dataEdges.filter(([f, t]) => f === from && t === to).length;
const outsideComment = (message) => String(message ?? "").replace(/\{#[\s\S]*?#\}/g, "");

const REVIEW_SENTENCE =
  "Its review is not a step of the run: once the run files the follow-up digest, " +
  "the digest's review opens on its own, and the run never waits for it.";

test("(8) the campaign is a visible pick: shown, required and never defaulted away", () => {
  const meta = start.metadata.cinatra;
  assert.ok((meta.required ?? []).includes("campaignId"), "the campaign is no longer asked for");
  assert.ok(!(meta.hidden ?? []).includes("campaignId"), "the campaign is hidden from the start form");
  const field = start.inputs.find((i) => i.title === "campaignId");
  assert.ok(field, "the start form has no campaign field");
  assert.equal(Object.hasOwn(field, "default"), false, "the campaign field is defaulted away");
  const flowLevel = oas.inputs.find((i) => i.title === "campaignId");
  assert.ok(flowLevel, "the flow has no campaign input");
  assert.equal(Object.hasOwn(flowLevel, "default"), false, "the flow's campaign input is defaulted away");
  assert.deepEqual(meta.hidden, ["agent_run_id"]);
});

test("(10) the flow has no pause of its own and the manifest claims none", () => {
  assert.deepEqual(nodesOfType("InputMessageNode").map((n) => n.id), [], "the flow has a pause step");
  assert.deepEqual(oas.metadata?.cinatra?.hitlScreens ?? [], [], "the flow names a review screen");
  const gated = Object.entries(refs)
    .filter(([, n]) => n?.metadata?.cinatra?.requiresApproval === true)
    .map(([id]) => id);
  assert.deepEqual(gated, [], "a step of the flow requires approval");
  assert.equal(pkg.cinatra.hasApprovalGates, false, "the manifest claims a gate its flow lacks");
  assert.deepEqual(pkg.cinatra.produces, [
    { extension: "@cinatra-ai/email-artifacts", objectTypeId: "@cinatra-ai/email:body" },
  ]);
  const bound = refs.end.outputs.filter((o) => o?.cinatra?.artifact).map((o) => o.title);
  assert.deepEqual(bound, ["followupDigest"], "the digest is no longer the run's filed artifact");
});

test("(10) the manifest says the digest's review opens on its own after the run", () => {
  assert.ok(
    String(pkg.description ?? "").includes(REVIEW_SENTENCE),
    "the manifest says nothing of the review the digest opens after the run",
  );
});

test("(19) the run ends in plain language, never in the envelope", () => {
  const summary = refs.followup_summary;
  assert.ok(summary, "the run has no closing statement");
  assert.equal(summary.component_type, "OutputMessageNode");
  assert.ok(oas.nodes.some((n) => n.$component_ref === "followup_summary"), "the closing statement is not a step of the flow");
  assert.ok(hasEdge("followup", "followup_summary"), "the run's last step does not pass the closing statement");
  assert.ok(hasEdge("followup_summary", "end"), "the closing statement does not lead to the end");
  assert.ok(!hasEdge("followup", "end"), "the run still jumps straight to its end");
  assert.deepEqual(
    refs.end.outputs.map((o) => o.title),
    ["followupBundle", "followupDigest", "summary"],
    "the end node no longer carries the values the run hands on",
  );
});

test("(19) an empty follow-up run ends in plain language", () => {
  const summary = refs.followup_summary;
  assert.ok(summary, "the run has no closing statement");
  const message = String(summary.message ?? "");
  assert.equal(
    message,
    "{# pyagentspec-input-hint (do not remove): {{ followupBundle }} #}" +
      "{% if not followupBundle or not followupBundle.draftedEmails %}No follow-up email was written in this run: " +
      "the cadence named no day to follow up on, or no follow-up could be written for it." +
      "{% else %}{{ followupBundle.draftedEmails | length }} follow-up emails were written and filed in the follow-up digest.{% endif %}",
    "each outcome does not reach its own sentence: nothing written, follow-ups filed",
  );
  assert.match(message, /no follow-up email was written/i, "an empty follow-up run has no plain-language ending");
  assert.match(message, /follow-up emails were written/i, "a run with follow-ups has no plain-language ending");
  assert.match(outsideComment(message), /\bfollowupBundle\b/, "the sentence never reads the follow-up bundle");
  assert.equal(summary.metadata?.cinatra?.purpose, "plain-language-follow-up-ending");
  assert.deepEqual(summary.inputs, [{ title: "followupBundle", type: "object", default: {} }]);
  assert.equal(countDataEdges("followup.followupBundle", "followup_summary.followupBundle"), 1);
});

/** The inputs a node CONSUMES: an EndNode names them under `outputs`, every
 *  other node declares `inputs`. */
function consumedInputs(node) {
  if (node.component_type === "EndNode") return node.outputs ?? [];
  return node.inputs ?? [];
}

/** Walk the flow the way the runtime loader does, returning each input it
 *  would demand from the StartStep. */
function unsourcedInputs() {
  const steps = new Map();
  for (const ref of oas.nodes ?? []) steps.set(ref.$component_ref, refs[ref.$component_ref]);
  const beginId = oas.start_node.$component_ref;
  const startTitles = new Set((steps.get(beginId)?.inputs ?? []).map((i) => i.title));
  const flowDataEdges = (oas.data_flow_connections ?? []).map((e) => ({
    from: e.source_node.$component_ref,
    key: `${e.destination_node.$component_ref}.${e.destination_input}`,
  }));
  const successors = (id) => controlEdges.filter((e) => e.from === id).map((e) => e.to);

  const violations = [];
  const visited = new Map();
  const queue = [[beginId, new Set()]];
  while (queue.length > 0) {
    const [id, incoming] = queue.pop();
    let produced = incoming;
    if (visited.has(id)) {
      const seen = visited.get(id);
      if ([...seen].every((k) => produced.has(k))) continue;
      produced = new Set([...produced].filter((k) => seen.has(k)));
    }
    visited.set(id, produced);

    const node = steps.get(id);
    if (!node) continue;
    if (id !== beginId) {
      for (const descriptor of consumedInputs(node)) {
        const key = `${id}.${descriptor.title}`;
        if (produced.has(key)) continue;
        if (Object.hasOwn(descriptor, "default")) continue;
        if (startTitles.has(descriptor.title)) continue;
        violations.push(key);
      }
    }

    const next = new Set(produced);
    for (const edge of flowDataEdges) if (edge.from === id) next.add(edge.key);
    for (const child of successors(id)) queue.push([child, new Set(next)]);
  }
  return violations;
}

test("every required step input has a source on every path that reaches it", () => {
  const found = unsourcedInputs();
  assert.deepEqual(
    found,
    [],
    "the runtime refuses to mount a flow whose step requires an input the StartStep does not carry: " + found.join(", "),
  );
});

test("an output message declares only inputs its template reads", () => {
  const offenders = [];
  for (const node of nodesOfType("OutputMessageNode")) {
    const rendered = outsideComment(node.message);
    for (const { title } of node.inputs ?? []) {
      if (!new RegExp(`\\b${title}\\b`).test(rendered)) offenders.push(`${node.id}.${title}`);
    }
  }
  assert.deepEqual(offenders, [], "the runtime rejects an input the template never reads: " + offenders.join(", "));
});

/** The runtime's rule for a declared default: it must fit the input's JSON
 *  schema type, and null fits only a type that names "null". */
function defaultFitsType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => {
    if (t === "null") return value === null;
    if (t === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
    if (t === "array") return Array.isArray(value);
    if (t === "string") return typeof value === "string";
    if (t === "boolean") return typeof value === "boolean";
    if (t === "number") return typeof value === "number";
    if (t === "integer") return Number.isInteger(value);
    return false;
  });
}

test("an output message's input defaults fit their declared type", () => {
  const offenders = [];
  for (const node of nodesOfType("OutputMessageNode")) {
    for (const input of node.inputs ?? []) {
      if (!Object.hasOwn(input, "default")) continue;
      if (!defaultFitsType(input.default, input.type)) {
        offenders.push(`${node.id}.${input.title}=${JSON.stringify(input.default)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "the type of the default value of property is not compatible with its json schema: " + offenders.join(", "),
  );
});

test("(8) every start input the runtime demands is one the start form asks for", () => {
  const meta = start.metadata.cinatra;
  const required = meta.required ?? [];
  const hidden = meta.hidden ?? [];
  const platformWritten = ["cinatra_run_id", "agent_run_id"];
  const unasked = oas.inputs
    .filter((i) => !Object.hasOwn(i, "default"))
    .map((i) => i.title)
    .filter((title) => !platformWritten.includes(title))
    .filter((title) => !required.includes(title) || hidden.includes(title));
  assert.deepEqual(unasked, [], "the runtime demands an input the start form never asks for: " + unasked.join(", "));
  assert.ok(required.includes("followUpDays"), "the follow-up cadence is not asked for");
  assert.ok(!hidden.includes("followUpDays"), "the follow-up cadence is hidden from the start form");
  assert.equal(meta.inputRenderers?.followUpDays, pkg.name + ":follow-up-cadence", "the cadence is no longer drawn by its own renderer");
  const field = start.inputs.find((i) => i.title === "followUpDays");
  assert.ok(field && !Object.hasOwn(field, "default"), "the start form's cadence is defaulted away");
  const flowLevel = oas.inputs.find((i) => i.title === "followUpDays");
  assert.ok(flowLevel && !Object.hasOwn(flowLevel, "default"), "the flow's cadence input is defaulted away");
});
