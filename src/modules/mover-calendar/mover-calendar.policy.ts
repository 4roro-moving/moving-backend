import { AppError } from "../../lib/app-error";
import { formatDateMarker, isPastInKst, parseDateMarker } from "../../utils/kst";

//날짜 문자열 변환
//"2026-08-13"과 같은 문자열을 js Date로 변환하는 함수
export function parseCalendarDate(value: string): Date {
  //Vaildator에서도 형식을 검사하지만 Controller 이외의 다른코드에서 직접 호출될 수도 있기 때문에 재확인
  const date = parseDateMarker(value);
  if (!date) {
    throw new AppError("BAD_REQUEST", { message: "유효하지 않은 날짜입니다." });
  }

  return date;
}

//월별 조회 범위 계산
export function getMonthRange(year: number, month: number) {
  return {
    //특정 월의 시작일과 다음 달 시작일을 반환함
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

// Date 객체 YYYY-MM-DD 문자열로 변환 - 2026-08-14T00:00:00.000Z
export function toDateKey(date: Date): string {
  return formatDateMarker(date);
}

//기사가 과거 날짜의 휴무를 등록하거나 해제하지 못하도록 검사
export function assertNotPastDate(date: Date, now = new Date()): void {
  if (isPastInKst(date, now)) {
    throw new AppError("BAD_REQUEST", { message: "지난 날짜의 일정은 변경할 수 없습니다." });
  }
}
