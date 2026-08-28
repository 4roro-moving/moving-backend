import "../../test/profile-image-test-env.js";

import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { AppError } from "../../lib/app-error";
import type { GiveawayDetailRow, GiveawayOwnershipRow } from "./giveaway.repository";
import { GIVEAWAY_STATUS, GIVEAWAY_VISIBILITY } from "./giveaway.type";

const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const KEY_A = `giveaways/${AUTHOR_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const KEY_B = `giveaways/${AUTHOR_ID}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
const KEY_C = `giveaways/${AUTHOR_ID}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;

let lockResult = true;

mock.module("../../utils/giveaway-lock.util", {
  namedExports: {
    lockGiveawayForUpdate: async () => lockResult,
  },
});

mock.module("../../utils/transaction", {
  namedExports: {
    runTransaction: async (callback: (tx: { mocked: true }) => Promise<unknown>) =>
      callback({ mocked: true }),
  },
});

const { giveawayRepository } = await import("./giveaway.repository");
const { giveawayImageService } = await import("./giveaway-image.service");
const { giveawayService, toRemovedGiveawayImageKeys } = await import("./giveaway.service");

function createOwnership(): GiveawayOwnershipRow {
  return {
    id: 1,
    authorId: AUTHOR_ID,
    receiverId: null,
    status: GIVEAWAY_STATUS.AVAILABLE,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    title: "나눔 글",
  };
}

function createDetail(imageKeys: string[]): GiveawayDetailRow {
  return {
    id: 1,
    authorId: AUTHOR_ID,
    receiverId: null,
    title: "나눔 글",
    description: "설명",
    status: GIVEAWAY_STATUS.AVAILABLE,
    isHidden: GIVEAWAY_VISIBILITY.VISIBLE,
    createdAt: new Date("2026-08-22T00:00:00.000Z"),
    updatedAt: new Date("2026-08-22T00:00:00.000Z"),
    author: { id: AUTHOR_ID, name: "작성자", customerProfile: null },
    receiver: null,
    region: null,
    images: imageKeys.map((imageKey, index) => ({
      id: index + 1,
      imageKey,
      sortOrder: index,
    })),
    _count: { requests: 0 },
  };
}

describe("toRemovedGiveawayImageKeys", () => {
  it("update 직전 latestKeys와 저장할 nextKeys의 차집합을 반환한다", () => {
    assert.deepEqual(toRemovedGiveawayImageKeys([KEY_A, KEY_B], [KEY_A]), [KEY_B]);
  });

  it("유지하는 key는 삭제 대상에 넣지 않는다", () => {
    assert.deepEqual(toRemovedGiveawayImageKeys([KEY_A, KEY_B], [KEY_A, KEY_B]), []);
  });

  it("요청 시작 시점에는 없던 key가 update 직전에 있으면 삭제 대상에 포함한다", () => {
    assert.deepEqual(toRemovedGiveawayImageKeys([KEY_A, KEY_B, KEY_C], [KEY_A]), [KEY_B, KEY_C]);
  });
});

describe("giveawayService.updateGiveaway 이미지 교체", () => {
  const originals = {
    findGiveawayById: giveawayRepository.findGiveawayById,
    findGiveawayOwnership: giveawayRepository.findGiveawayOwnership,
    updateGiveaway: giveawayRepository.updateGiveaway,
    deleteGiveaway: giveawayRepository.deleteGiveaway,
    prepareUpdatedImages: giveawayImageService.prepareUpdatedImages,
    deleteFinalImage: giveawayImageService.deleteFinalImage,
    deleteTemporaryImage: giveawayImageService.deleteTemporaryImage,
    rollbackFinalizedImages: giveawayImageService.rollbackFinalizedImages,
  };

  afterEach(() => {
    lockResult = true;
    giveawayRepository.findGiveawayById = originals.findGiveawayById;
    giveawayRepository.findGiveawayOwnership = originals.findGiveawayOwnership;
    giveawayRepository.updateGiveaway = originals.updateGiveaway;
    giveawayRepository.deleteGiveaway = originals.deleteGiveaway;
    giveawayImageService.prepareUpdatedImages = originals.prepareUpdatedImages;
    giveawayImageService.deleteFinalImage = originals.deleteFinalImage;
    giveawayImageService.deleteTemporaryImage = originals.deleteTemporaryImage;
    giveawayImageService.rollbackFinalizedImages = originals.rollbackFinalizedImages;
  });

  it("S3 cleanup 대상을 요청 시작 currentKeys가 아니라 update 직전 latestKeys 기준으로 계산한다", async () => {
    const deletedFinalKeys: string[] = [];

    giveawayRepository.findGiveawayById = async (_giveawayId, db) => {
      if (db) {
        return createDetail([KEY_A, KEY_B, KEY_C]);
      }

      return createDetail([KEY_A, KEY_B]);
    };
    giveawayRepository.findGiveawayOwnership = async () => createOwnership();
    giveawayRepository.updateGiveaway = async () => createDetail([KEY_A]);
    giveawayImageService.prepareUpdatedImages = async (_userId, imageKeys) => ({
      nextKeys: imageKeys,
      tempKeys: [],
      finalizedKeys: [],
    });
    giveawayImageService.deleteFinalImage = async (_userId, key) => {
      deletedFinalKeys.push(key);
    };

    await giveawayService.updateGiveaway(1, AUTHOR_ID, {
      imageKeys: [KEY_A],
    });

    assert.deepEqual(deletedFinalKeys, [KEY_B, KEY_C]);
  });

  it("글 행 잠금에 실패하면 404로 처리하고 복사해 둔 최종 이미지를 롤백한다", async () => {
    lockResult = false;
    let rolledBackKeys: string[] | undefined;

    giveawayRepository.findGiveawayById = async () => createDetail([KEY_A, KEY_B]);
    giveawayImageService.prepareUpdatedImages = async () => ({
      nextKeys: [KEY_A],
      tempKeys: [],
      finalizedKeys: [KEY_C],
    });
    giveawayImageService.rollbackFinalizedImages = async (_userId, keys) => {
      rolledBackKeys = keys;
    };

    await assert.rejects(
      () =>
        giveawayService.updateGiveaway(1, AUTHOR_ID, {
          imageKeys: [KEY_A],
        }),
      (error: unknown) => error instanceof AppError && error.code === "GIVEAWAY_NOT_FOUND",
    );
    assert.deepEqual(rolledBackKeys, [KEY_C]);
  });

  it("요청 시작에는 있던 key가 update 직전에 없으면 409로 거절하고 신규 복사본만 롤백한다", async () => {
    const deletedFinalKeys: string[] = [];
    let rolledBackKeys: string[] | undefined;

    giveawayRepository.findGiveawayById = async (_giveawayId, db) => {
      if (db) {
        return createDetail([KEY_A]);
      }

      return createDetail([KEY_A, KEY_B]);
    };
    giveawayImageService.prepareUpdatedImages = async () => ({
      nextKeys: [KEY_A, KEY_B],
      tempKeys: [],
      finalizedKeys: [KEY_C],
    });
    giveawayImageService.deleteFinalImage = async (_userId, key) => {
      deletedFinalKeys.push(key);
    };
    giveawayImageService.rollbackFinalizedImages = async (_userId, keys) => {
      rolledBackKeys = keys;
    };

    await assert.rejects(
      () =>
        giveawayService.updateGiveaway(1, AUTHOR_ID, {
          imageKeys: [KEY_A, KEY_B],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "GIVEAWAY_UPDATE_CONFLICT" &&
        error.status === 409,
    );
    assert.deepEqual(rolledBackKeys, [KEY_C]);
    assert.deepEqual(deletedFinalKeys, []);
  });

  it("요청 시작에도 없던 final key는 다른 글 재사용으로 400 처리한다", async () => {
    giveawayRepository.findGiveawayById = async () => createDetail([KEY_A, KEY_B]);
    giveawayImageService.prepareUpdatedImages = async () => ({
      nextKeys: [KEY_C],
      tempKeys: [],
      finalizedKeys: [],
    });

    await assert.rejects(
      () =>
        giveawayService.updateGiveaway(1, AUTHOR_ID, {
          imageKeys: [KEY_C],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "BAD_REQUEST" &&
        error.message === "다른 나눔 글의 이미지는 재사용할 수 없습니다.",
    );
  });
});

describe("giveawayService.deleteGiveaway 이미지 정리", () => {
  const originals = {
    findGiveawayById: giveawayRepository.findGiveawayById,
    deleteGiveaway: giveawayRepository.deleteGiveaway,
    deleteFinalImage: giveawayImageService.deleteFinalImage,
  };

  afterEach(() => {
    lockResult = true;
    giveawayRepository.findGiveawayById = originals.findGiveawayById;
    giveawayRepository.deleteGiveaway = originals.deleteGiveaway;
    giveawayImageService.deleteFinalImage = originals.deleteFinalImage;
  });

  it("잠금 후 다시 읽은 이미지 key만 S3 cleanup 대상으로 사용한다", async () => {
    const deletedFinalKeys: string[] = [];
    let deleted = false;

    giveawayRepository.findGiveawayById = async (_giveawayId, db) => {
      if (db) {
        return createDetail([KEY_A, KEY_C]);
      }

      return createDetail([KEY_A, KEY_B]);
    };
    giveawayRepository.deleteGiveaway = async () => {
      deleted = true;
    };
    giveawayImageService.deleteFinalImage = async (_userId, key) => {
      deletedFinalKeys.push(key);
    };

    await giveawayService.deleteGiveaway(1, AUTHOR_ID);

    assert.equal(deleted, true);
    assert.deepEqual(deletedFinalKeys, [KEY_A, KEY_C]);
  });

  it("글 행 잠금에 실패하면 404로 처리하고 S3를 지우지 않는다", async () => {
    lockResult = false;
    const deletedFinalKeys: string[] = [];
    let deleted = false;

    giveawayRepository.deleteGiveaway = async () => {
      deleted = true;
    };
    giveawayImageService.deleteFinalImage = async (_userId, key) => {
      deletedFinalKeys.push(key);
    };

    await assert.rejects(
      () => giveawayService.deleteGiveaway(1, AUTHOR_ID),
      (error: unknown) => error instanceof AppError && error.code === "GIVEAWAY_NOT_FOUND",
    );
    assert.equal(deleted, false);
    assert.deepEqual(deletedFinalKeys, []);
  });
});
