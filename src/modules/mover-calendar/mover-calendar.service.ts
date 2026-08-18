import { AppError } from "../../lib/app-error";
import { runTransaction } from "../../utils/transaction";
import {
  assertNotPastDate,
  getMonthRange,
  parseCalendarDate,
  toDateKey,
} from "./mover-calendar.policy";
import { moverCalendarRepository } from "./mover-calendar.repository";
import type { CalendarDayStatus, CalendarMonthQuery } from "./mover-calendar.type";

/**
 * getMonthlyCalendar(): 월별 캘린더 조회
 * updateDay(): 기사 휴무 등록·해제
 */

// 고객 이름 마스킹 - 예: 김철수 → 김**
function maskCustomerName(name: string): string {
  if (name.length <= 1) return `${name}*`;
  return `${name[0]}${"*".repeat(Math.max(1, name.length - 1))}`;
}

export const moverCalendarService = {
  // 월별 캘린더 조회
  async getMonthlyCalendar(params: {
    moverId: string;
    query: CalendarMonthQuery;
    viewerId?: string;
    viewerRole?: string;
  }) {
    // 기사 존재 여부 확인
    const mover = await moverCalendarRepository.findActiveMover(params.moverId);
    if (!mover) throw new AppError("MOVER_NOT_FOUND");

    // 월 범위 계산
    const { start, end } = getMonthRange(params.query.year, params.query.month);

    // 휴무와 확정 일정 동시 조회
    const [unavailableDates, confirmedMoves] = await Promise.all([
      moverCalendarRepository.findUnavailableDates(params.moverId, start, end),
      moverCalendarRepository.findConfirmedMoves(params.moverId, start, end),
    ]);

    const offDates = new Set(unavailableDates.map(({ date }) => toDateKey(date)));

    // 확정 일정을 날짜별 Map으로 변환
    const confirmedByDate = new Map(
      confirmedMoves.map(
        (estimate) => [toDateKey(estimate.estimateRequest.moveDate), estimate] as const,
      ),
    );

    // 기사 본인 여부
    const isOwner = params.viewerRole === "MOVER" && params.viewerId === params.moverId;

    // 월의 모든 날짜 생성
    const days = [];
    for (const date = new Date(start); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
      const key = toDateKey(date);
      const confirmed = confirmedByDate.get(key);
      const status: CalendarDayStatus = confirmed
        ? "FULL"
        : offDates.has(key)
          ? "OFF"
          : "AVAILABLE";

      days.push({
        date: key,
        status,
        ...(isOwner && confirmed // 기사 본인이며 확정 일정이 있으면 예약 요약 추가
          ? {
              reservation: {
                estimateId: confirmed.id,
                estimateRequestId: confirmed.estimateRequest.id,
                moveType: confirmed.estimateRequest.moveType,
                customerName: maskCustomerName(confirmed.estimateRequest.customer.name),
              },
            }
          : {}),
      });
    }

    return { moverId: params.moverId, year: params.query.year, month: params.query.month, days };
  },

  // 휴무 등록 및 해제
  async updateDay(params: { moverId: string; date: string; status: "AVAILABLE" | "OFF" }) {
    const date = parseCalendarDate(params.date);
    assertNotPastDate(date);

    const mover = await moverCalendarRepository.findActiveMover(params.moverId);
    if (!mover) throw new AppError("MOVER_PROFILE_REQUIRED");

    // 트랜잭션: 잠금, 확정 일정 확인, 휴무 변경
    return runTransaction(async (tx) => {
      // 해당 기사 및 날짜 잠금
      await moverCalendarRepository.lockMoverDate(params.moverId, date, tx);

      // 기존 확정 일정 확인
      const confirmedCount = await moverCalendarRepository.countConfirmedMoves(
        params.moverId,
        date,
        tx,
      );
      if (confirmedCount > 0) throw new AppError("MOVER_DATE_FULL");

      // 휴무 등록
      if (params.status === "OFF") {
        await moverCalendarRepository.upsertUnavailableDate(params.moverId, date, tx);
      } else {
        // 휴무 해제
        await moverCalendarRepository.deleteUnavailableDate(params.moverId, date, tx);
      }

      return { date: params.date, status: params.status };
    });
  },
};
