import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AVATAR_SIZE_BYTES,
  validateAvatar,
  validateEmail,
  validateName,
} from "./profile-validation.ts";

test("profile name and email validation accepts current valid values", () => {
  assert.equal(validateName("Ada Lovelace"), null);
  assert.equal(validateEmail("ada@example.com"), null);
});

test("profile name and email validation rejects empty and malformed values", () => {
  assert.equal(validateName("  "), "Name is required");
  assert.equal(validateName("a".repeat(101)), "Name must be 100 characters or less");
  assert.equal(validateEmail("not-an-email"), "Enter a valid email address");
  assert.equal(validateEmail("a".repeat(250) + "@b.com"), "Email must be 255 characters or less");
});

test("avatar validation accepts images up to 2 MB", () => {
  const image = new File(["avatar"], "avatar.png", { type: "image/png" });
  assert.equal(validateAvatar(image), null);
  assert.equal(MAX_AVATAR_SIZE_BYTES, 2 * 1024 * 1024);
});

test("avatar validation rejects non-images and images over 2 MB", () => {
  const text = new File(["avatar"], "avatar.txt", { type: "text/plain" });
  const oversized = new File([new Uint8Array(MAX_AVATAR_SIZE_BYTES + 1)], "avatar.png", {
    type: "image/png",
  });

  assert.equal(validateAvatar(text), "Profile picture must be an image file");
  assert.equal(validateAvatar(oversized), "Profile picture must be 2 MB or smaller");
});
