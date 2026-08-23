import { z } from "zod";
import { LOAD_AMOUNTS, MOVE_TYPES } from "./price-prediction.type";

const REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export const predictPriceSchema = z.object({
  moveType: z.enum(MOVE_TYPES, { error: "올바른 이사 유형을 선택해 주세요." }),
  fromRegion: z.enum(REGIONS, { error: "올바른 출발 지역을 선택해 주세요." }),
  toRegion: z.enum(REGIONS, { error: "올바른 도착 지역을 선택해 주세요." }),
  distanceKm: z.number({ error: "이동 거리는 숫자여야 합니다." }).positive().max(1000),
  houseSize: z.number({ error: "평수는 숫자여야 합니다." }).int().min(1).max(300),
  loadAmount: z.enum(LOAD_AMOUNTS, { error: "올바른 짐량을 선택해 주세요." }),
  fromFloor: z.number().int().min(1).max(100),
  fromElevator: z.boolean(),
  toFloor: z.number().int().min(1).max(100),
  toElevator: z.boolean(),
  ladderTruck: z.boolean(),
  moveDate: z.string().date("이사 날짜는 YYYY-MM-DD 형식이어야 합니다."),
});
