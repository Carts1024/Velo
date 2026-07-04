import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appShellSource = fs.readFileSync("core/app-shell.tsx", "utf8");
const sidebarSource = fs.readFileSync(
  "../../packages/ui/src/components/ui-customs/sidebar/app-sidebar.tsx",
  "utf8",
);

test("dashboard navigation preserves the current selected project", () => {
  assert.match(sidebarSource, /title: "Dashboard"[\s\S]*url: "\/dashboard"/);
  assert.match(appShellSource, /url === "\/dashboard" && activeProjectId/);
  assert.match(appShellSource, /rememberSelectedProject\(activeProjectId\)/);
});

test("dashboard waits for stored project hydration before using project fallback", () => {
  assert.match(appShellSource, /loadedSelectedProjectStorageKey/);
  assert.match(
    appShellSource,
    /selectedProjectStorageKey === null[\s\S]*loadedSelectedProjectStorageKey === selectedProjectStorageKey/,
  );
  assert.match(appShellSource, /if \(!hasLoadedStoredSelectedProject\) \{[\s\S]*return null;/);
  assert.match(
    appShellSource,
    /rawProjects &&[\s\S]*hasLoadedStoredSelectedProject &&[\s\S]*activeProjectId/,
  );
});
