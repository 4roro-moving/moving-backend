import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";

import reportRouter from "./report.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(reportRouter, {
  basePath: "/api/reports",
  tag: "Report",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "신고 권한이 없거나 본인 자신은 신고할 수 없습니다. (`FORBIDDEN`, `REPORT_SELF_NOT_ALLOWED`)",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /images/upload-url": {
      summary: "신고 이미지 업로드 URL 발급",
      description: [
        "신고 첨부 이미지 업로드에 사용할 Presigned URL과 이미지 Key를 발급합니다.",
        "",
        "- CUSTOMER와 MOVER만 사용할 수 있습니다.",
        "- 지원 형식은 JPEG, PNG, WebP입니다.",
        "- 이미지 Key는 `reports/{userId}/{uuid}.{extension}` 형식으로 생성됩니다.",
        "- 발급된 URL의 유효시간은 180초입니다.",
        "- 최대 허용 개수와 실제 파일 크기 검증은 신고 생성 시 한 번 더 확인합니다.",
      ].join("\n"),
      responses: {
        201: "신고 이미지 업로드 URL 발급 성공",
        422: "지원하지 않는 이미지 형식입니다.",
      },
    },

    "POST /": {
      summary: "신고 생성",
      description: [
        "CUSTOMER와 MOVER만 신고를 생성할 수 있습니다.",
        "",
        "- 이번 1차 지원 대상은 `REVIEW`, `MOVER`만입니다.",
        "- `targetId`는 API에서 문자열로 받습니다.",
        "- `REVIEW`는 양의 정수 문자열이어야 하며 내부적으로 정규화해 조회합니다.",
        "- `MOVER`는 기사님의 `User.id` UUID 문자열이어야 합니다.",
        "- `reason=OTHER`인 경우 `description`은 필수이며 trim 후 빈 문자열은 허용되지 않습니다.",
        "- `imageKeys`는 선택값이며 최대 5장까지 첨부할 수 있습니다.",
        "- 첨부 이미지는 먼저 `/api/reports/images/upload-url`로 Presigned URL을 발급받아 업로드해야 합니다.",
        "- 신고 생성 시 이미지 key 소유권, MIME, 파일 존재 여부, 파일 크기를 다시 검증합니다.",
        "- 신고 생성 시 상태는 항상 `PENDING`입니다.",
        "- 같은 사용자가 같은 대상을 중복 신고할 수 없습니다.",
        "- 신고 생성만으로 대상이 자동 숨김 또는 정지되지 않으며, 후속 처리는 관리자가 수행합니다.",
      ].join("\n"),
      responses: {
        201: "신고 생성 성공",
        404: "신고 대상을 찾을 수 없습니다.",
        409: [
          "다음 에러 코드를 반환할 수 있습니다.",
          "",
          "- `REPORT_ALREADY_EXISTS`: 같은 사용자가 같은 대상을 이미 신고한 경우",
          "- `REPORT_TARGET_NOT_REPORTABLE`: 대상이 존재하지만 현재 1차 신고 지원 대상이 아닌 경우",
        ].join("\n"),
      },
    },
  },
});
