import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import { giveawayRequestRouter, giveawayRouter } from "./giveaway.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

registerRouterDocs(giveawayRouter, {
  basePath: "/api/giveaways",
  tag: "Giveaway",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "고객만 이용할 수 있습니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "POST /image/upload-url": {
      summary: "나눔 이미지 업로드 URL 발급",
      description: "S3 직접 업로드용 Presigned URL과 imageKey를 발급합니다.",
      responses: { 201: "발급 성공" },
    },
    "GET /me": {
      summary: "내가 작성한 나눔 목록",
      description:
        "숨김 글은 제외합니다. status, regionId 로 필터할 수 있습니다. 없는 지역이면 400입니다.",
      responses: { 200: "조회 성공", 400: "지원하지 않는 지역입니다." },
    },
    "GET /me/received": {
      summary: "내가 수령한 나눔 목록",
      description:
        "선정되어 receiverId가 본인인 나눔 글 목록입니다. 숨김 글은 제외합니다. 없는 지역이면 400입니다.",
      responses: { 200: "조회 성공", 400: "지원하지 않는 지역입니다." },
    },
    "GET /": {
      summary: "나눔 목록",
      description:
        "숨김 글은 제외합니다. status, regionId 로 필터할 수 있습니다. 없는 지역이면 400입니다.",
      responses: { 200: "조회 성공", 400: "지원하지 않는 지역입니다." },
    },
    "POST /": {
      summary: "나눔 글 작성",
      description: "imageKeys의 배열 순서가 sortOrder가 되며, 0번이 대표 이미지입니다.",
      responses: { 201: "생성 성공", 400: "지역 또는 이미지가 올바르지 않습니다." },
    },
    "GET /:giveawayId": {
      summary: "나눔 글 상세",
      description: "숨김 글은 작성자 포함 404입니다. 작성자/수령자만 receiver를 볼 수 있습니다.",
      responses: { 200: "조회 성공", 404: "나눔 글을 찾을 수 없습니다." },
    },
    "PATCH /:giveawayId": {
      summary: "나눔 글 수정",
      description:
        "작성자만, AVAILABLE 상태에서만 가능합니다. 숨김 글은 404입니다. imageKeys를 보내면 이미지를 교체합니다.",
      responses: {
        200: "수정 성공",
        403: "작성자가 아닙니다.",
        404: "나눔 글을 찾을 수 없습니다.",
        409: "신청 가능 상태가 아닙니다.",
      },
    },
    "DELETE /:giveawayId": {
      summary: "나눔 글 삭제",
      description:
        "작성자만, AVAILABLE 상태에서만 가능합니다. 숨김 글은 404입니다. 이미지와 신청은 Cascade로 함께 삭제됩니다.",
      responses: {
        200: "삭제 성공",
        403: "작성자가 아닙니다.",
        404: "나눔 글을 찾을 수 없습니다.",
        409: "신청 가능 상태가 아닙니다.",
      },
    },
    "POST /:giveawayId/complete": {
      summary: "나눔 완료",
      description: "작성자만 IN_PROGRESS 나눔을 COMPLETED로 변경합니다. 숨김 글은 404입니다.",
      responses: {
        200: "완료 성공",
        403: "작성자가 아닙니다.",
        404: "나눔 글을 찾을 수 없습니다.",
        409: "진행 중인 나눔이 아닙니다.",
      },
    },
    "GET /:giveawayId/requests": {
      summary: "나눔 신청 목록",
      description: "작성자만 해당 글의 신청 목록을 조회합니다. 숨김 글은 404입니다.",
      responses: {
        200: "조회 성공",
        403: "작성자가 아닙니다.",
        404: "나눔 글을 찾을 수 없습니다.",
      },
    },
    "POST /:giveawayId/requests": {
      summary: "나눔 신청",
      description: [
        "AVAILABLE 상태의 글에만 신청할 수 있습니다.",
        "작성자 본인은 신청할 수 없습니다.",
        "PENDING 또는 SELECTED 신청이 있으면 재신청할 수 없고, CANCELLED·REJECTED 이후에는 재신청할 수 있습니다.",
      ].join("\n"),
      responses: {
        201: "신청 성공",
        403: "본인 글에는 신청할 수 없습니다.",
        404: "나눔 글을 찾을 수 없습니다.",
        409: "신청할 수 없는 상태이거나 대기·선정된 신청이 이미 있습니다.",
      },
    },
    "POST /:giveawayId/requests/:requestId/select": {
      summary: "신청자 선정",
      description: [
        "작성자가 PENDING 신청자를 선정합니다.",
        "같은 트랜잭션에서 신청을 SELECTED로, 글의 receiverId와 status를 IN_PROGRESS로 맞춥니다.",
        "다른 PENDING 신청은 그대로 둡니다.",
        "완료된 나눔은 변경할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "선정 성공",
        403: "작성자가 아닙니다.",
        404: "나눔 글 또는 신청을 찾을 수 없습니다.",
        409: "이미 선정되었거나 완료된 나눔입니다.",
      },
    },
    "POST /:giveawayId/requests/:requestId/reject": {
      summary: "신청 거절",
      description:
        "작성자가 PENDING 신청을 REJECTED로 변경합니다. 완료된 나눔은 거절할 수 없습니다.",
      responses: {
        200: "거절 성공",
        403: "작성자가 아닙니다.",
        404: "나눔 글 또는 신청을 찾을 수 없습니다.",
        409: "대기 중인 신청이 아니거나 완료된 나눔입니다.",
      },
    },
  },
});

registerRouterDocs(giveawayRequestRouter, {
  basePath: "/api/giveaway-requests",
  tag: "Giveaway Request",
  headers: authHeaderSchema,
  commonResponses: {
    401: "인증이 필요합니다.",
    403: "본인의 신청이 아닙니다.",
    422: "입력값이 올바르지 않습니다.",
  },
  endpoints: {
    "GET /me": {
      summary: "내 나눔 신청 목록",
      description: "숨김 글의 신청은 제외합니다. status로 필터할 수 있습니다.",
      responses: { 200: "조회 성공" },
    },
    "PATCH /:requestId": {
      summary: "신청 메시지 수정",
      description:
        "신청자 본인만, PENDING 상태에서만 가능합니다. 완료되었거나 숨김된 나눔은 수정할 수 없습니다.",
      responses: {
        200: "수정 성공",
        404: "나눔 글 또는 신청을 찾을 수 없습니다.",
        409: "대기 중인 신청이 아니거나 완료된 나눔입니다.",
      },
    },
    "POST /:requestId/cancel": {
      summary: "나눔 신청 취소",
      description: [
        "PENDING은 CANCELLED로만 변경합니다.",
        "SELECTED 취소 시 같은 트랜잭션에서 receiverId를 비우고 글 상태를 AVAILABLE로 되돌립니다.",
        "완료되었거나 숨김된 나눔의 신청은 취소할 수 없습니다.",
      ].join("\n"),
      responses: {
        200: "취소 성공",
        404: "나눔 신청을 찾을 수 없습니다.",
        409: "현재 상태에서는 취소할 수 없습니다.",
      },
    },
  },
});
