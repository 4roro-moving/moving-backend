import { z } from "zod";

// 현재 연도 계산 - ex. 현재 연도가 2026일 경우 최소:2025 최대:2029
const currentYear = new Date().getUTCFullYear();

// 월별 조회 쿼리 검증
//GET /api/movers/:moverId/calendar?year=2026&month=8 검증함
export const calendarMonthQuerySchema = z.object({
  //연도 검증 coerce는 문자열 숫자를 실제 숫자로 변환함
  year: z.coerce
    .number({ error: "연도는 숫자로 입력해주세요." })
    .int("연도는 정수로 입력해주세요.")
    .min(currentYear - 1, `연도는 ${currentYear - 1}년 이상이어야 합니다.`)
    .max(currentYear + 3, `연도는 ${currentYear + 3}년 이하여야 합니다.`),
  //월 검증
  month: z.coerce
    .number({ error: "월은 숫자로 입력해주세요." })
    .int("월은 정수로 입력해주세요.")
    .min(1, "월은 1 이상이어야 합니다.")
    .max(12, "월은 12 이하여야 합니다."),
});

//휴무 변경 날짜 검증
//PUT /api/movers/me/calendar/2026-08-14 검증함
export const calendarDateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다."),
});

//상태 검증 - OFF / AVAILABLE 허용값, FULL은 확정 예약이 존재할 때 서버가 자동으로 계산하는 상태이므로 거부됨
export const updateCalendarDaySchema = z.object({
  status: z.enum(["AVAILABLE", "OFF"], {
    error: "상태는 AVAILABLE 또는 OFF만 입력할 수 있습니다.",
  }),
});
