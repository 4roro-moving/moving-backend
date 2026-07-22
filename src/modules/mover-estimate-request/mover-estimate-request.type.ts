import type { MoveType } from "@prisma/client";
import type { z } from "zod";

import type { moverEstimateRequestListQuerySchema } from "./mover-estimate-request.validator";

/* 
2026.07.21 add 윤소정
API에서 사용하는 데이터 형태 정의
*/

export type MoverEstimateRequestListQuery = z.infer<typeof moverEstimateRequestListQuerySchema>;

export type MoverEstimateRequestListItem = {
  id: number;
  customer: {
    id: string;
    name: string;
  };
  moveType: MoveType;
  moveDate: string;
  fromAddress: string;
  toAddress: string;
  fromRegion: string;
  toRegion: string;
  isDesignated: boolean;
  createdAt: string;
};

//Service -> Controller
export type MoverEstimateRequestListResult = {
  items: MoverEstimateRequestListItem[];
  pagination: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
};
