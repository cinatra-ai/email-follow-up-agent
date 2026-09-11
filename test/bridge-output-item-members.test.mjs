// Bridge-output item members — the shape this agent's bridge outputs declare.
//
// The runtime asks the model for exactly the shape this agent declares: an
// object level with no declared members is sent CLOSED and EMPTY, so an answer
// carries nothing inside it. `followupBundle` is the structured contract the
// follow-up drafts surface renders and the same shape the node's own system
// prompt spells out, so its members are declared here and pinned by this test —
// at the flow outputs, at the bridge node's outputs and at the end node's
// outputs, which all carry the same edge-sourced value.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const oas = JSON.parse(readFileSync(join(root, "cinatra/oas.json"), "utf8"));
const components = oas.$referenced_components ?? {};

const DRAFTED_EMAIL_MEMBERS = {
  recipientId: "string",
  recipientName: "string",
  recipientEmail: "string",
  subject: "string",
  body: "string",
  followUpDay: "integer",
};

/** The member map a declaration carries, in either agentspec spelling. */
function declaredMembers(node) {
  if (!node || typeof node !== "object") return undefined;
  const own = node.properties;
  if (own && typeof own === "object") return own;
  const nested = node.json_schema;
  const members = nested && typeof nested === "object" ? nested.properties : undefined;
  return members && typeof members === "object" ? members : undefined;
}

/** The item declaration a declaration carries, in either agentspec spelling. */
function declaredItems(node) {
  if (!node || typeof node !== "object") return undefined;
  if (node.items !== undefined) return node.items;
  const nested = node.json_schema;
  return nested && typeof nested === "object" ? nested.items : undefined;
}

function outputNamed(outputs, title) {
  const found = (outputs ?? []).find((o) => o?.title === title);
  assert.ok(found, `no output titled ${title}`);
  return found;
}

/** Every place the followupBundle value is declared. */
const declarations = [
  ["flow outputs", outputNamed(oas.outputs, "followupBundle")],
  ["followup node outputs", outputNamed(components.followup?.outputs, "followupBundle")],
  ["end node outputs", outputNamed(components.end?.outputs, "followupBundle")],
];

for (const [where, bundle] of declarations) {
  test(`${where}: followupBundle declares its members`, () => {
    assert.equal(bundle.type, "object");
    const members = declaredMembers(bundle);
    assert.ok(members, `followupBundle declares no members at the ${where}`);
    assert.deepEqual(Object.keys(members).sort(), ["draftedEmails", "summary"]);
    assert.equal(members.summary?.type, "string");
  });

  test(`${where}: followupBundle.draftedEmails declares its item members`, () => {
    const drafted = declaredMembers(bundle)?.draftedEmails;
    assert.ok(drafted, `no draftedEmails member at the ${where}`);
    assert.equal(drafted.type, "array");
    const items = declaredItems(drafted);
    assert.ok(items && typeof items === "object", "draftedEmails declares no items");
    assert.equal(items.type, "object");
    const itemMembers = declaredMembers(items);
    assert.ok(itemMembers, "draftedEmails items declare no members");
    assert.deepEqual(
      Object.keys(itemMembers).sort(),
      Object.keys(DRAFTED_EMAIL_MEMBERS).sort(),
    );
    for (const [name, type] of Object.entries(DRAFTED_EMAIL_MEMBERS)) {
      assert.equal(itemMembers[name]?.type, type, `draftedEmails item member ${name}`);
    }
  });
}

test("no bridge output of this agent is left without declared members", () => {
  const freeForm = [];
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    const members = declaredMembers(node);
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (members) {
      for (const [name, member] of Object.entries(members)) walk(member, `${path}.${name}`);
    } else if (types.includes("object")) {
      freeForm.push(path);
    }
    const items = declaredItems(node);
    if (items !== undefined) {
      walk(items, `${path}[]`);
    } else if (types.includes("array")) {
      freeForm.push(`${path}[]`);
    }
  };
  for (const [id, comp] of Object.entries(components)) {
    if (comp?.component_type !== "ApiNode") continue;
    if (typeof comp.url !== "string" || !comp.url.endsWith("/api/llm-bridge")) continue;
    for (const out of comp.outputs ?? []) walk(out, `${id}/${out?.title}`);
  }
  assert.deepEqual(freeForm, []);
});
