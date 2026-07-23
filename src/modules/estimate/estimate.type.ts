import type { MoveType } from "@prisma/client";
import type { z } from "zod";

import type {
  moverEstimateRequestListQuerySchema,
  receivedEstimateRequestIdParamSchema,
} from "./estimate.validator";

/* 
2026.07.21 add 윤소정
API에서 사용하는 데이터 형태 정의
*/

/* 
2026.07.23 add 김성현
받은 견적 목록 API 데이터 형태 정의
*/

export type MoverEstimateRequestListQuery = z.infer<typeof moverEstimateRequestListQuerySchema>;
export type ReceivedEstimateRequestIdParam = z.infer<typeof receivedEstimateRequestIdParamSchema>;

export type GetReceivedEstimateListParams = {
  estimateRequestId: number;
  customerId: string;
};

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
