import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DbClient } from "../../utils/transaction";

import { reportRepository } from "./report.repository";

describe("reportRepository.createReport", () => {
  it("stores ReportImage rows with the report in the same create call", async () => {
    let receivedData: unknown;

    const db = {
      report: {
        create: async ({ data }: { data: unknown }) => {
          receivedData = data;
          return {
            id: 1,
            targetType: "MOVER",
            targetId: "mover-id",
            reason: "SPAM",
            status: "PENDING",
            detail: null,
            images: [],
            createdAt: new Date("2026-08-20T00:00:00.000Z"),
          };
        },
      },
    } as unknown as DbClient;

    await reportRepository.createReport(
      {
        targetType: "MOVER",
        targetId: "mover-id",
        reporterId: "reporter-id",
        reason: "SPAM",
        detail: null,
        status: "PENDING",
        imageKeys: ["reports/u1/a.jpg", "reports/u1/b.png"],
      },
      db,
    );

    assert.deepEqual(receivedData, {
      targetType: "MOVER",
      targetId: "mover-id",
      reporterId: "reporter-id",
      reason: "SPAM",
      detail: null,
      status: "PENDING",
      images: {
        create: [{ imageKey: "reports/u1/a.jpg" }, { imageKey: "reports/u1/b.png" }],
      },
    });
  });
});
