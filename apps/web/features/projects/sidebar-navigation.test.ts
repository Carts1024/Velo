import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sidebarSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/app-sidebar.tsx",
  "utf8",
);
const navMainSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/nav-main.tsx",
  "utf8",
);

test("sidebar exposes the five Velo principles as navigation groups", () => {
  for (const principle of ["Build", "Verify", "Observe", "Pay", "Settle"]) {
    assert.match(sidebarSource, new RegExp(`title: "${principle}"`));
  }

  assert.match(sidebarSource, /title: "Build"[\s\S]*title: "Integration"/);
  assert.match(sidebarSource, /title: "Verify"[\s\S]*title: "Contracts"/);
  assert.match(sidebarSource, /title: "Observe"[\s\S]*title: "Events"/);
  assert.match(sidebarSource, /title: "Pay"[\s\S]*title: "Dashboard"/);
  assert.match(sidebarSource, /title: "Settle"[\s\S]*title: "Settlement"/);
});

test("principle groups collapse while preserving active navigation state", () => {
  assert.match(navMainSource, /export type NavMainGroup/);
  assert.match(navMainSource, /openGroups/);
  assert.match(navMainSource, /CollapsibleContent/);
  assert.match(navMainSource, /isActive=\{item\.isActive\}/);
  assert.match(navMainSource, /aria-disabled="true"/);
});
