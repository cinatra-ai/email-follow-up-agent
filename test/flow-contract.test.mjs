// Flow contract tests for @cinatra-ai/email-follow-up-agent.
//
// Zero-dependency (plain `node --test`) so the repo's standalone CI runs them
// with no registry and no install step.
//
// What they lock in (cinatra#2047 row 8 / cinatra#1796):
//   1. The flow carries NO reference to the retired reviewer/auditor agents —
//      no package ref, no renderer/gate id, no `reviewer:` a2ui surface id, and
//      no `hitlScreens` pin. Review is core-driven: core opens the review gate
//      on the artifact this flow produces, so the flow ships no review wiring.
//   2. The flow declares NO mid-run approval gate of its own.
//   3. The graph is internally consistent after the gate removal: every node is
//      reachable, every dataflow edge names a real node/port, and every EndNode
//      output is edge-sourced (the host's EndNode output-source invariant, which
//      the declarative artifact binding relies on).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const oas = JSON.parse(readFileSync(join(ROOT, "cinatra", "oas.json"), "utf8"));

const pkgText = JSON.stringify(pkg);
const oasText = JSON.stringify(oas);

/**
 * The retired agents whose identity must not appear anywhere in this package.
 *
 * Composed from parts on purpose: the program's retirement check is an
 * EXACT-IDENTITY `git grep -F` for these package names, and the guard that
 * enforces the retirement must not itself be a match for it. The assertion below
 * is still exact — only the literal at rest is split.
 */
const SCOPE = "@cinatra-ai/";
const RETIRED_AGENTS = ["reviewer", "auditor", "skill-recommender"].map(
  (slug) => `${SCOPE}${slug}-agent`,
);

test("no retired review/audit agent is referenced by the manifest or the flow", () => {
  for (const name of RETIRED_AGENTS) {
    assert.equal(pkgText.includes(name), false, `package.json still references ${name}`);
    assert.equal(oasText.includes(name), false, `cinatra/oas.json still references ${name}`);
  }
});

test("no reviewer-scoped a2ui surface id survives on any node", () => {
  const refs = oas.$referenced_components ?? {};
  for (const [id, node] of Object.entries(refs)) {
    const surface = node?.metadata?.cinatra?.a2uiSurfaceId;
    if (surface === undefined) continue;
    assert.equal(
      String(surface).startsWith("reviewer:"),
      false,
      `node "${id}" pins the reviewer-scoped a2ui surface "${surface}"`,
    );
  }
});

test("the flow declares no hitlScreens pin", () => {
  const screens = oas.metadata?.cinatra?.hitlScreens;
  assert.deepEqual(screens ?? [], [], "the flow still declares hitlScreens");
});

test("the flow declares no mid-run approval gate", () => {
  const refs = oas.$referenced_components ?? {};
  const gated = Object.entries(refs)
    .filter(([, node]) => node?.metadata?.cinatra?.requiresApproval === true)
    .map(([id]) => id);
  assert.deepEqual(gated, [], `flow nodes still require approval: ${gated.join(", ")}`);
  assert.equal(
    pkg.cinatra.hasApprovalGates,
    false,
    "package.json still advertises hasApprovalGates",
  );
});

test("no InputMessageNode remains in the graph", () => {
  const refs = oas.$referenced_components ?? {};
  const inputMessages = Object.entries(refs)
    .filter(([, node]) => node?.component_type === "InputMessageNode")
    .map(([id]) => id);
  assert.deepEqual(inputMessages, [], `stale gate node(s): ${inputMessages.join(", ")}`);
});

test("every node ref, control edge and data edge resolves to a declared component", () => {
  const refs = oas.$referenced_components ?? {};
  const declared = new Set(Object.keys(refs));
  const listed = (oas.nodes ?? []).map((n) => n.$component_ref);

  for (const id of listed) {
    assert.equal(declared.has(id), true, `nodes[] lists undeclared component "${id}"`);
  }
  for (const id of declared) {
    assert.equal(listed.includes(id), true, `component "${id}" is declared but not listed in nodes[]`);
  }
  assert.equal(listed.includes(oas.start_node.$component_ref), true, "start_node is not in nodes[]");

  for (const edge of oas.control_flow_connections ?? []) {
    assert.equal(declared.has(edge.from_node.$component_ref), true, `control edge "${edge.name}" has an unknown from_node`);
    assert.equal(declared.has(edge.to_node.$component_ref), true, `control edge "${edge.name}" has an unknown to_node`);
  }
  for (const edge of oas.data_flow_connections ?? []) {
    const src = edge.source_node.$component_ref;
    const dst = edge.destination_node.$component_ref;
    assert.equal(declared.has(src), true, `data edge "${edge.name}" has an unknown source_node "${src}"`);
    assert.equal(declared.has(dst), true, `data edge "${edge.name}" has an unknown destination_node "${dst}"`);
    const srcPorts = (refs[src].outputs ?? []).map((o) => o.title);
    assert.equal(
      srcPorts.includes(edge.source_output) || src === oas.start_node.$component_ref,
      true,
      `data edge "${edge.name}" reads "${edge.source_output}" which node "${src}" does not output`,
    );
  }
});

test("every node is reachable from start over the control flow", () => {
  const edges = oas.control_flow_connections ?? [];
  const seen = new Set([oas.start_node.$component_ref]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of edges) {
      if (seen.has(e.from_node.$component_ref) && !seen.has(e.to_node.$component_ref)) {
        seen.add(e.to_node.$component_ref);
        grew = true;
      }
    }
  }
  const unreachable = Object.keys(oas.$referenced_components ?? {}).filter((id) => !seen.has(id));
  assert.deepEqual(unreachable, [], `unreachable node(s): ${unreachable.join(", ")}`);
});

test("every EndNode output is edge-sourced and the flow outputs match", () => {
  const refs = oas.$referenced_components ?? {};
  const dataEdges = oas.data_flow_connections ?? [];
  for (const [id, node] of Object.entries(refs)) {
    if (node?.component_type !== "EndNode") continue;
    for (const out of node.outputs ?? []) {
      const sourced = dataEdges.some(
        (e) => e.destination_node.$component_ref === id && e.destination_input === out.title,
      );
      assert.equal(sourced, true, `EndNode "${id}" output "${out.title}" is not edge-sourced`);
    }
    const endTitles = (node.outputs ?? []).map((o) => o.title).sort();
    const flowTitles = (oas.outputs ?? []).map((o) => o.title).sort();
    assert.deepEqual(flowTitles, endTitles, "flow outputs and EndNode outputs disagree");
  }
});

test("the declarative artifact binding still names real EndNode outputs", () => {
  const refs = oas.$referenced_components ?? {};
  let bindings = 0;
  for (const node of Object.values(refs)) {
    if (node?.component_type !== "EndNode") continue;
    const titles = new Set((node.outputs ?? []).map((o) => o.title));
    for (const out of node.outputs ?? []) {
      const binding = out?.cinatra?.artifact;
      if (!binding) continue;
      bindings += 1;
      assert.equal(titles.has(binding.contentFrom), true, `artifact contentFrom "${binding.contentFrom}" is not an output of this EndNode`);
      if (binding.titleFrom !== undefined) {
        assert.equal(titles.has(binding.titleFrom), true, `artifact titleFrom "${binding.titleFrom}" is not an output of this EndNode`);
      }
      const produced = (pkg.cinatra.produces ?? []).map((p) => p.extension);
      assert.equal(produced.includes(binding.extension), true, `artifact binding extension "${binding.extension}" is not in cinatra.produces`);
    }
  }
  assert.equal(bindings, 1, "expected exactly one declarative artifact binding");
});
