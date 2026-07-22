import type { z } from "zod";

import type { listMoverQuerySchema } from "./mover.validator";

export type ListMoverQuery = z.infer<typeof listMoverQuerySchema>;

export type MoverListSort = ListMoverQuery["sort"];

// 기사 목록 DB 조회 시 필요한 파라미터
export type FindManyMoversParams = {
  keyword?: string;
  sort: MoverListSort;
  serviceArea?: number;
  moveType?: "SMALL" | "HOME" | "OFFICE";
  skip: number;
  take: number;
};
