import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sidebarSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/app-sidebar.tsx",
  "utf8",
);
const navUserSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/nav-user.tsx",
  "utf8",
);

test("billing is available from the user navigation instead of the sidebar platform list", () => {
  assert.doesNotMatch(sidebarSource, /title: "Billing"/);
  assert.match(navUserSource, /CreditCardIcon/);
  assert.match(navUserSource, /billingUrl = "\/billing"/);
  assert.match(navUserSource, />Billing</);
});
