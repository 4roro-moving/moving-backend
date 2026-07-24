import type { MoveType } from "@prisma/client";
import type { z } from "zod";

import type {
  confirmReceivedEstimateParamSchema,
  moverEstimateRequestListQuerySchema,
  receivedEstimateDetailParamSchema,
  receivedEstimateRequestIdParamSchema,
  sendEstimateBodySchema,
  sendEstimateParamSchema,
} from "./estimate.validator";

/* 
2026.07.21 add 윤소정
API에서 사용하는 데이터 형태 정의
*/

/* 
2026.07.23 add 김성현
받은 견적 목록 API 데이터 형태 정의
*/

/* 
2026.07.23 add 김성현
- 받은 견적 상세 API 데이터 형태 정의
- 받은 견적 확정 API 데이터 형태 정의
*/

// =============================================================================
// 요청 검증 결과 타입
// =============================================================================

export type MoverEstimateRequestListQuery = z.infer<typeof moverEstimateRequestListQuerySchema>;
export type ReceivedEstimateRequestIdParam = z.infer<typeof receivedEstimateRequestIdParamSchema>;
export type ReceivedEstimateDetailParam = z.infer<typeof receivedEstimateDetailParamSchema>;
export type ConfirmReceivedEstimateParam = z.infer<typeof confirmReceivedEstimateParamSchema>;

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 및 견적 확정
// =============================================================================

export type GetReceivedEstimateListParams = {
  estimateRequestId: number;
  customerId: string;
};

export type GetReceivedEstimateDetailParams = GetReceivedEstimateListParams & {
  estimateId: number;
};

export type ConfirmReceivedEstimateParams = GetReceivedEstimateListParams & {
  estimateId: number;
};

// =============================================================================
// 기사: 고객의 견적 요청 목록 조회
// =============================================================================

//견적 제안 API URL 경로 파라미터 -- POST /api/estimates/requests/:estimateRequestId
export type SendEstimateParam = z.infer<typeof sendEstimateParamSchema>;
//기사가 견적 보낼 때 전달하는 요청 본문
export type SendEstimateInput = z.infer<typeof sendEstimateBodySchema>;

//견적 전송 인자
export type SendEstimateParams = {
  estimateRequestId: number;
  moverId: string;
  input: SendEstimateInput;
};

//기사에게 노출되는 견적 요청 목록의 단일 항목
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

//견적 요청 목록 조회 Service의 반환값
export type MoverEstimateRequestListResult = {
  items: MoverEstimateRequestListItem[];
  pagination: {
    nextCursor: string | null;
    hasNextPage: boolean;
    totalCount: number;
  };
};
