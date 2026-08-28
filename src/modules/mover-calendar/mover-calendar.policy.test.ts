import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../lib/app-error";
import {
  assertNotPastDate,
  getMonthRange,
  parseCalendarDate,
  toDateKey,
} from "./mover-calendar.policy";
import {
  calendarDateParamSchema,
  calendarMonthQuerySchema,
  updateCalendarDaySchema,
} from "./mover-calendar.validator";

describe("mover calendar policy", () => {
  it("parses a valid calendar date", () => {
    assert.equal(toDateKey(parseCalendarDate("2026-08-13")), "2026-08-13");
  });

  it("rejects an impossible calendar date", () => {
    assert.throws(() => parseCalendarDate("2026-02-30"), AppError);
  });

  it("returns an exclusive monthly range", () => {
    const range = getMonthRange(2026, 12);
    assert.equal(range.start.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(range.end.toISOString(), "2027-01-01T00:00:00.000Z");
  });

  it("rejects a past date and accepts today", () => {
    const now = new Date("2026-08-12T16:00:00.000Z");
    assert.throws(() => assertNotPastDate(new Date("2026-08-12T00:00:00.000Z"), now), AppError);
    assert.doesNotThrow(() => assertNotPastDate(new Date("2026-08-13T00:00:00.000Z"), now));
  });
});

describe("mover calendar validation", () => {
  it("coerces year and month query parameters", () => {
    const currentYear = new Date().getUTCFullYear();

    assert.deepEqual(calendarMonthQuerySchema.parse({ year: String(currentYear), month: "8" }), {
      year: currentYear,
      month: 8,
    });
  });

  it("rejects invalid dates and direct FULL updates", () => {
    assert.equal(calendarDateParamSchema.safeParse({ date: "2026-8-1" }).success, false);
    assert.equal(updateCalendarDaySchema.safeParse({ status: "FULL" }).success, false);
  });
});
