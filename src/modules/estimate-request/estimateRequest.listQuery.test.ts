import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPagination } from "../../utils/pagination.util";
import { buildFindManyByCustomerWhere } from "./estimateRequest.repository";
import { listEstimateRequestQuerySchema } from "./estimateRequest.validator";

describe("listEstimateRequestQuerySchema — status 필터", () => {
  it("status 미전달 시 전체 조회 (status undefined)", () => {
    const result = listEstimateRequestQuerySchema.safeParse({ page: "1", limit: "10" });

    assert.equal(result.success, true);
    if (!result.success) {
      return;
    }

    assert.equal(result.data.page, 1);
    assert.equal(result.data.limit, 10);
    assert.equal(result.data.status, undefined);
  });

  it("status=OPEN 조회", () => {
    const result = listEstimateRequestQuerySchema.safeParse({
      page: "1",
      limit: "10",
      status: "OPEN",
    });

    assert.equal(result.success, true);
    if (!result.success) {
      return;
    }

    assert.equal(result.data.status, "OPEN");
  });

  it("status=COMPLETED 조회", () => {
    const result = listEstimateRequestQuerySchema.safeParse({
      page: "1",
      limit: "10",
      status: "COMPLETED",
    });

    assert.equal(result.success, true);
    if (!result.success) {
      return;
    }

    assert.equal(result.data.status, "COMPLETED");
  });

  it("잘못된 status는 VALIDATION_ERROR(파싱 실패)", () => {
    const result = listEstimateRequestQuerySchema.safeParse({
      page: "1",
      limit: "10",
      status: "INVALID",
    });

    assert.equal(result.success, false);
  });

  it("Enum 전체 허용값 파싱", () => {
    for (const status of ["PENDING", "OPEN", "CONFIRMED", "COMPLETED", "EXPIRED", "CANCELED"]) {
      const result = listEstimateRequestQuerySchema.safeParse({ status });
      assert.equal(result.success, true, `expected ${status} to be valid`);
    }
  });
});

describe("buildFindManyByCustomerWhere — 필터 where", () => {
  it("status 없으면 customerId만", () => {
    assert.deepEqual(buildFindManyByCustomerWhere({ customerId: "user-1" }), {
      customerId: "user-1",
    });
  });

  it("status=OPEN 이면 where.status 반영", () => {
    assert.deepEqual(buildFindManyByCustomerWhere({ customerId: "user-1", status: "OPEN" }), {
      customerId: "user-1",
      status: "OPEN",
    });
  });

  it("필터 결과 없음 — count 0일 때 pagination totalPages 정합", () => {
    const pagination = buildPagination(0, 1, 10);

    assert.equal(pagination.totalCount, 0);
    assert.equal(pagination.totalPages, 0);
    assert.equal(pagination.hasNext, false);
  });

  it("필터된 totalCount 기준 totalPages", () => {
    const pagination = buildPagination(23, 2, 10);

    assert.equal(pagination.totalCount, 23);
    assert.equal(pagination.totalPages, 3);
    assert.equal(pagination.page, 2);
    assert.equal(pagination.limit, 10);
    assert.equal(pagination.hasNext, true);
  });
});
