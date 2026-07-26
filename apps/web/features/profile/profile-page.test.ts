import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("core/app-shell.tsx", "utf8");
const signup = readFileSync("app/signup/page.tsx", "utf8");
const profilePage = readFileSync("app/profile/page.tsx", "utf8");
const profileForm = readFileSync("features/profile/profile-form.tsx", "utf8");

test("edit profile uses a protected dedicated page instead of a dialog", () => {
  assert.match(shell, /pathname\.startsWith\("\/profile"\)/);
  assert.match(shell, /router\.push\("\/profile"\)/);
  assert.doesNotMatch(shell, /OnboardingDialog/);
  assert.match(profilePage, /<AppShell>/);
  assert.match(profilePage, /mode="edit"/);
});

test("profile page waits for and supplies the current profile values", () => {
  assert.match(profilePage, /useUserProfile/);
  assert.match(profilePage, /initialName=\{user\.name\}/);
  assert.match(profilePage, /initialEmail=\{user\.email\}/);
  assert.match(profilePage, /initialAvatarUrl=\{user\.avatarUrl\}/);
});

test("signup and edit pages share avatar-capable profile form", () => {
  assert.match(signup, /<ProfileForm/);
  assert.match(signup, /mode="signup"/);
  assert.match(profileForm, /generateAvatarUploadUrl/);
  assert.match(profileForm, /removeAvatar/);
  assert.match(profileForm, /accept="image\/\*"/);
  assert.match(profileForm, /URL\.revokeObjectURL/);
});
