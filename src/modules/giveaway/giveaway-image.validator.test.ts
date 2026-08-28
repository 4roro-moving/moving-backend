import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createGiveawayImageUploadUrlSchema,
  giveawayCreateImageKeysSchema,
  giveawayFinalImageKeySchema,
  giveawayTempImageKeySchema,
  giveawayUpdateImageKeysSchema,
} from "./giveaway-image.validator";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_A = "22222222-2222-4222-8222-222222222222";
const IMAGE_B = "33333333-3333-4333-8333-333333333333";

const tempKey = `temp/giveaways/${USER_ID}/${IMAGE_A}.jpg`;
const finalKey = `giveaways/${USER_ID}/${IMAGE_A}.jpg`;
const otherFinalKey = `giveaways/${USER_ID}/${IMAGE_B}.webp`;

describe("giveaway image key validators", () => {
  it("accepts temp keys for create and rejects final keys", () => {
    assert.equal(giveawayTempImageKeySchema.parse(tempKey), tempKey);
    assert.deepEqual(giveawayCreateImageKeysSchema.parse([tempKey]), [tempKey]);
    assert.throws(() => giveawayCreateImageKeysSchema.parse([finalKey]));
  });

  it("accepts both temp and existing final keys for update", () => {
    assert.equal(giveawayFinalImageKeySchema.parse(finalKey), finalKey);
    assert.deepEqual(
      giveawayUpdateImageKeysSchema.parse([finalKey, tempKey.replace(IMAGE_A, IMAGE_B)]),
      [finalKey, `temp/giveaways/${USER_ID}/${IMAGE_B}.jpg`],
    );
    assert.deepEqual(giveawayUpdateImageKeysSchema.parse([otherFinalKey]), [otherFinalKey]);
  });

  it("rejects duplicate keys and more than 5 images", () => {
    assert.throws(() => giveawayCreateImageKeysSchema.parse([tempKey, tempKey]));
    assert.throws(() =>
      giveawayUpdateImageKeysSchema.parse([
        `temp/giveaways/${USER_ID}/22222222-2222-4222-8222-222222222221.jpg`,
        `temp/giveaways/${USER_ID}/22222222-2222-4222-8222-222222222222.jpg`,
        `temp/giveaways/${USER_ID}/22222222-2222-4222-8222-222222222223.jpg`,
        `temp/giveaways/${USER_ID}/22222222-2222-4222-8222-222222222224.jpg`,
        `temp/giveaways/${USER_ID}/22222222-2222-4222-8222-222222222225.jpg`,
        `temp/giveaways/${USER_ID}/22222222-2222-4222-8222-222222222226.jpg`,
      ]),
    );
  });

  it("validates upload url payload size and content type", () => {
    assert.deepEqual(
      createGiveawayImageUploadUrlSchema.parse({ contentType: "image/png", size: 1024 }),
      { contentType: "image/png", size: 1024 },
    );
    assert.throws(() =>
      createGiveawayImageUploadUrlSchema.parse({ contentType: "image/gif", size: 1024 }),
    );
    assert.throws(() =>
      createGiveawayImageUploadUrlSchema.parse({
        contentType: "image/jpeg",
        size: 6 * 1024 * 1024,
      }),
    );
  });
});
