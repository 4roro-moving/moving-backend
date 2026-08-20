import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MoveType, Prisma } from "@prisma/client";

import type { DbClient } from "../../../utils/transaction";
import { mapProfileResponse } from "./profile.mapper";
import { profileRepository } from "./profile.repository";
import { createProfileSchema, updateProfileSchema } from "./profile.validator";

const activityBase = {
  address: "서울특별시 강남구 테헤란로 1",
  detailAddress: "101호",
  zipCode: "06234",
  latitude: 37.501,
  longitude: 127.039,
};

const createInput = {
  nickname: "안전한기사",
  career: 5,
  shortIntro: "안전하게 운반합니다.",
  description: "고객님의 짐을 안전하게 운반하겠습니다.",
  activityBase,
  regionIds: [1],
  serviceTypes: [MoveType.HOME],
};

const profileRecord = {
  id: 1,
  userId: "mover-1",
  nickname: "안전한기사",
  imageUrl: null,
  career: 5,
  shortIntro: "안전하게 운반합니다.",
  description: "고객님의 짐을 안전하게 운반하겠습니다.",
  activityBaseAddress: null,
  activityBaseDetailAddress: null,
  activityBaseZipCode: null,
  activityBaseLatitude: null,
  activityBaseLongitude: null,
  confirmedCount: 0,
  averageRating: new Prisma.Decimal(0),
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

describe("mover activityBase validation", () => {
  it("requires activityBase when creating a profile", () => {
    const { activityBase: _activityBase, ...inputWithoutActivityBase } = createInput;

    assert.equal(createProfileSchema.safeParse(inputWithoutActivityBase).success, false);
    assert.equal(createProfileSchema.safeParse(createInput).success, true);
  });

  it("allows activityBase to be omitted when updating a profile", () => {
    assert.equal(updateProfileSchema.safeParse({ nickname: "새닉네임" }).success, true);
  });

  it("validates zip code, latitude, and longitude ranges", () => {
    const invalidActivityBases = [
      { ...activityBase, zipCode: "1234" },
      { ...activityBase, latitude: -90.001 },
      { ...activityBase, latitude: 90.001 },
      { ...activityBase, longitude: -180.001 },
      { ...activityBase, longitude: 180.001 },
    ];

    for (const invalidActivityBase of invalidActivityBases) {
      const result = createProfileSchema.safeParse({
        ...createInput,
        activityBase: invalidActivityBase,
      });
      assert.equal(result.success, false);
    }
  });
});

describe("mover activityBase mapping", () => {
  it("returns null for a legacy profile without an activity base", () => {
    assert.equal(mapProfileResponse(profileRecord, true).activityBase, null);
  });

  it("returns the activity base stored on a profile", () => {
    const response = mapProfileResponse(
      {
        ...profileRecord,
        activityBaseAddress: activityBase.address,
        activityBaseDetailAddress: activityBase.detailAddress,
        activityBaseZipCode: activityBase.zipCode,
        activityBaseLatitude: new Prisma.Decimal(activityBase.latitude),
        activityBaseLongitude: new Prisma.Decimal(activityBase.longitude),
      },
      true,
    );

    assert.deepEqual(response.activityBase, activityBase);
  });
});

describe("mover activityBase persistence", () => {
  it("stores activityBase fields when creating a profile", async () => {
    let receivedData: unknown;
    const db = {
      moverProfile: {
        create: async ({ data }: { data: unknown }) => {
          receivedData = data;
          return profileRecord;
        },
      },
    } as unknown as DbClient;

    await profileRepository.createProfile("mover-1", createInput, db);

    assert.deepEqual(receivedData, {
      userId: "mover-1",
      nickname: createInput.nickname,
      career: createInput.career,
      shortIntro: createInput.shortIntro,
      description: createInput.description,
      activityBaseAddress: activityBase.address,
      activityBaseDetailAddress: activityBase.detailAddress,
      activityBaseZipCode: activityBase.zipCode,
      activityBaseLatitude: activityBase.latitude,
      activityBaseLongitude: activityBase.longitude,
      serviceAreas: { create: [{ regionId: 1 }] },
      serviceTypes: { create: [{ moveType: MoveType.HOME }] },
    });
  });

  it("stores activityBase fields when updating a profile", async () => {
    let receivedData: unknown;
    const db = {
      moverProfile: {
        update: async ({ data }: { data: unknown }) => {
          receivedData = data;
          return profileRecord;
        },
      },
    } as unknown as DbClient;

    const updateData = {
      activityBaseAddress: activityBase.address,
      activityBaseDetailAddress: activityBase.detailAddress,
      activityBaseZipCode: activityBase.zipCode,
      activityBaseLatitude: activityBase.latitude,
      activityBaseLongitude: activityBase.longitude,
    };

    await profileRepository.updateProfile("mover-1", updateData, db);

    assert.deepEqual(receivedData, updateData);
  });
});
