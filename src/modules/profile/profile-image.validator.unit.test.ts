import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { profileImageKeySchema } from "./profile-image.validator.js";

const VALID_PRODUCTION_KEYS = [
  "temp/profiles/0198652f-b878-7fb3-bbfc-c6148fbd675a/e934bded-59ab-425c-90d2-fe4e08cb4287.jpg",
  "temp/profiles/019d11d5-0f48-7dc1-ab21-06328f217ad3/3737cb09-4eed-46e5-bd81-05099eb9f66c.png",
  "temp/profiles/019d11d5-0f48-7dc1-ab21-06328f217ad3/7adc8080-25d2-41e9-adc0-be34f3adb859.png",
] as const;

const UUIDV7_USER_ID = "019d11d5-0f48-7dc1-ab21-06328f217ad3";
const UUIDV4_USER_ID = "019d11d5-0f48-4dc1-ab21-06328f217ad3";
const UUIDV4_IMAGE_ID = "3737cb09-4eed-46e5-bd81-05099eb9f66c";

function parseProfileImageKey(key: string) {
  return profileImageKeySchema.safeParse(key);
}

describe("profileImageKeySchema (unit)", () => {
  it("accepts UUIDv7 userId + UUIDv4 imageId temp keys", () => {
    const key = `temp/profiles/${UUIDV7_USER_ID}/${UUIDV4_IMAGE_ID}.png`;

    assert.equal(parseProfileImageKey(key).success, true);
  });

  it("accepts UUIDv4 userId + UUIDv4 imageId temp keys", () => {
    const key = `temp/profiles/${UUIDV4_USER_ID}/${UUIDV4_IMAGE_ID}.png`;

    assert.equal(parseProfileImageKey(key).success, true);
  });

  it("accepts production-failing UUIDv7 temp keys", () => {
    for (const key of VALID_PRODUCTION_KEYS) {
      const result = parseProfileImageKey(key);

      assert.equal(result.success, true, `Expected valid key: ${key}`);
    }
  });

  it("rejects non-UUID userId", () => {
    const key = `temp/profiles/profile-image-user-1/${UUIDV4_IMAGE_ID}.jpg`;

    assert.equal(parseProfileImageKey(key).success, false);
  });

  it("rejects UUIDv7 imageId", () => {
    const key = `temp/profiles/${UUIDV7_USER_ID}/7adc8080-25d2-71e9-adc0-be34f3adb859.png`;

    assert.equal(parseProfileImageKey(key).success, false);
  });

  it("rejects malformed imageId", () => {
    const key = `temp/profiles/${UUIDV7_USER_ID}/not-a-uuid.png`;

    assert.equal(parseProfileImageKey(key).success, false);
  });

  it("rejects unsupported extension", () => {
    const key = `temp/profiles/${UUIDV7_USER_ID}/${UUIDV4_IMAGE_ID}.gif`;

    assert.equal(parseProfileImageKey(key).success, false);
  });

  it("rejects final profiles prefix without temp", () => {
    const key = `profiles/${UUIDV7_USER_ID}/${UUIDV4_IMAGE_ID}.png`;

    assert.equal(parseProfileImageKey(key).success, false);
  });

  it("rejects arbitrary paths", () => {
    const key = `uploads/${UUIDV7_USER_ID}/${UUIDV4_IMAGE_ID}.jpg`;

    assert.equal(parseProfileImageKey(key).success, false);
  });

  it("rejects absolute URL imageUrl", () => {
    const key = `https://cdn.example.com/temp/profiles/${UUIDV7_USER_ID}/${UUIDV4_IMAGE_ID}.jpg`;

    assert.equal(parseProfileImageKey(key).success, false);
  });
});
