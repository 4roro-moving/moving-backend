import type { z } from "zod";

import type {
  calendarDateParamSchema,
  calendarMonthQuerySchema,
  updateCalendarDaySchema,
} from "./mover-calendar.validator";

//월별 조회 쿼리 타입
export type CalendarMonthQuery = z.infer<typeof calendarMonthQuerySchema>;
//날짜 URL 파라미터 타입
export type CalendarDateParam = z.infer<typeof calendarDateParamSchema>;
//휴무 변경 본문 타입
export type UpdateCalendarDayInput = z.infer<typeof updateCalendarDaySchema>;
//캘린더 응답 상태 타입
export type CalendarDayStatus = "AVAILABLE" | "FULL" | "OFF";
