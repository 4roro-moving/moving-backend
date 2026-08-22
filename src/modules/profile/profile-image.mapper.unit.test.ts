import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getProfileImageUrl } from "../../utils/image-url.js";
import { mapProfileResponse as mapCustomerProfileResponse } from "./customer/profile.mapper.js";
import { mapProfileResponse as mapMoverProfileResponse } from "./mover/profile.mapper.js";
import {
  PROFILE_IMAGE_FINAL_KEY,
  PROFILE_IMAGE_LEGACY_FINAL_KEY,
  PROFILE_IMAGE_USER_ID,
  expectedProfileImageUrl,
} from "./profile-image.test-helpers.js";

const customerProfile = {
  id: 1,
  userId: PROFILE_IMAGE_USER_ID,
  imageUrl: PROFILE_IMAGE_FINAL_KEY,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  user: {
    name: "고객",
    email: "customer@example.com",
    phone: "01012345678",
  },
  serviceAreas: [],
  serviceTypes: [],
};

const moverProfile = {
  id: 1,
  userId: PROFILE_IMAGE_USER_ID,
  nickname: "기사",
  imageUrl: PROFILE_IMAGE_FINAL_KEY,
  career: 3,
  shortIntro: "intro",
  description: "description",
  activityBaseAddress: null,
  activityBaseDetailAddress: null,
  activityBaseZipCode: null,
  activityBaseLatitude: null,
  activityBaseLongitude: null,
  confirmedCount: 0,
  averageRating: { toNumber: () => 0 } as never,
  reviewCount: 0,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  user: {
    name: "기사",
    email: "mover@example.com",
    phone: "01012345678",
  },
  serviceAreas: [],
  serviceTypes: [],
};

describe("profile imageUrl CloudFront mapping (unit)", () => {
  it("maps final S3 keys to CloudFront URLs for customer profiles", () => {
    const response = mapCustomerProfileResponse(customerProfile, true);

    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_FINAL_KEY));
  });

  it("maps final S3 keys to CloudFront URLs for mover profiles", () => {
    const response = mapMoverProfileResponse(moverProfile, true);

    assert.equal(response.imageUrl, expectedProfileImageUrl(PROFILE_IMAGE_FINAL_KEY));
  });

  it("keeps legacy absolute URLs unchanged", () => {
    assert.equal(
      getProfileImageUrl("https://legacy.example.com/profiles/old.jpg"),
      "https://legacy.example.com/profiles/old.jpg",
    );
  });

  it("keeps legacy profiles/{userId}/ DB keys compatible via CloudFront mapping", () => {
    assert.equal(
      getProfileImageUrl(PROFILE_IMAGE_LEGACY_FINAL_KEY),
      expectedProfileImageUrl(PROFILE_IMAGE_LEGACY_FINAL_KEY),
    );
  });
});
