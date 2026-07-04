import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const settingsSource = fs.readFileSync("features/projects/project-settings.tsx", "utf8");
const settingsPageSource = fs.readFileSync("app/projects/[projectId]/settings/page.tsx", "utf8");
const switcherSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/project-switcher.tsx",
  "utf8",
);
const navUserSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/nav-user.tsx",
  "utf8",
);

test("project settings supports Convex Storage logo upload", () => {
  assert.match(settingsSource, /generateLogoUploadUrl/);
  assert.match(settingsSource, /setLogo/);
  assert.match(settingsSource, /removeLogo/);
  assert.match(settingsSource, /method: "POST"/);
  assert.match(settingsSource, /Content-Type/);
  assert.match(settingsSource, /2 \* 1024 \* 1024/);
});

test("sidebar renders project logos and exposes settings navigation", () => {
  assert.match(switcherSource, /logoUrl\?: string/);
  assert.match(switcherSource, /activeProject\.logoUrl/);
  assert.match(switcherSource, /<FolderIcon className="size-4" \/>/);
  assert.match(navUserSource, /SettingsIcon/);
  assert.match(navUserSource, /settingsUrl/);
  assert.match(navUserSource, />Settings</);
});

test("project settings route renders inside app shell sidebar", () => {
  assert.match(settingsPageSource, /import \{ AppShell \}/);
  assert.match(settingsPageSource, /<AppShell>/);
  assert.match(settingsPageSource, /<ProjectSettings projectId=\{projectId\} \/>/);
});
