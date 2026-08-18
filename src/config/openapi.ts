import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import type { OpenAPIObject } from "openapi3-ts/oas31";

/**
 * 모든 모듈의 API 문서가 등록되는 레지스트리입니다.
 *
 * 각 모듈은 `*.docs.ts` 파일에서 이 레지스트리에 경로를 등록하고,
 * 해당 파일을 아래 registerModuleDocs 에서 import 합니다.
 */
export const registry = new OpenAPIRegistry();

/**
 * 각 모듈의 docs 파일을 불러옵니다.
 *
 * import 문 자체가 registry.registerPath 를 실행시키므로,
 * 새 모듈을 추가할 때 여기에 한 줄만 추가하면 됩니다.
 */
async function registerModuleDocs(): Promise<void> {
  await import("../modules/estimate-request/estimateRequest.docs");
  await import("../modules/mover-calendar/mover-calendar.docs");
  // 2026.07.24 정슬기 - [추가] 받은 견적·확정 API 문서를 OpenAPI에 등록
  await import("../modules/estimate/estimate.docs");
  // 2026.07.28 심현수 - [추가] 관리자 공지사항 API 문서 등록
  await import("../modules/admin/notice/notice.docs");
  // 2026.08.03 신영미 - [추가] 관리자 콘텐츠(리뷰) API 문서 등록
  await import("../modules/admin/contents/contents.docs");
  // 2026.08.06 유서현 - [추가] 관리자 고객 목록 API 문서 등록
  await import("../modules/admin/member-management/customers/customers.docs");
  await import("../modules/admin/member-management/movers/movers.docs");
  // 2026.08.08 유서현 - [추가] 관리자 확정 견적/견적 요청 취소 API 문서 등록
  await import("../modules/admin/estimates/estimates.docs");
  // 2026.07.30 장민주 - [추가] 인증 API 문서 등록
  await import("../modules/auth/auth.docs");
  // 2026.08.05 장민주 - [추가] 관리자 인증 API 문서 등록
  await import("../modules/admin/auth/admin-auth.docs");
  // 2026.07.29 장민주 - [추가] 알림 API 문서 등록
  await import("../modules/notification/notification.docs");
  // 2026.07.29 장민주 - [추가] 알림 SSE API 문서 등록
  await import("../modules/notification/notification-sse.docs");
  // 2026.07.29 심현수 - [추가] 관리자 FAQ API 문서 등록
  await import("../modules/admin/faq/faq.docs");
  // 2026.07.30 심현수 - [추가] QNA API 문서 등록
  await import("../modules/inquiry/inquiry.docs");
  // 2026.08.17 김나연 - [추가] 거주후기 API 문서 등록
  await import("../modules/residence-review/residence-review.docs");
  // 2026.07.30 장민주 - [추가] 프로필 API 문서 등록
  await import("../modules/report/report.docs");
  await import("../modules/profile/profile.docs");
  await import("../modules/chat/chat.docs");
}

export async function generateOpenApiDocument(): Promise<OpenAPIObject> {
  await registerModuleDocs();

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Moving API",
      version: "1.0.0",
      description: "이사 견적 매칭 서비스 무빙의 백엔드 API 문서입니다.",
    },
    servers: [{ url: "/", description: "현재 서버" }],
  });
}
