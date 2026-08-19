import { z } from "zod";

import { registerRouterDocs } from "../../config/openapi-router";
import { ERROR_CODES } from "../../constants/error-code";
import { publicResidenceReviewRouter, residenceReviewRouter } from "./residence-review.route";

const authHeaderSchema = z.object({
  authorization: z.string().meta({ example: "Bearer <access-token>" }),
});

const RESIDENCE_REVIEW_DOCS = {
  TAG_PUBLIC: "Residence Review",
  TAG_CUSTOMER: "Residence Review (Customer)",
  PUBLIC_LIST_SUMMARY: "거주후기 목록 (공개)",
  PUBLIC_LIST_DESCRIPTION: [
    "비회원도 조회할 수 있습니다. 로그인하면 `isMine`으로 본인 작성 여부를 확인할 수 있습니다.",
    "",
    "- 노출 중인(`isHidden=false`) 후기만 조회합니다.",
    "- `keyword`는 제목·내용 부분 검색입니다. 작성자명·지역명 검색은 하지 않습니다.",
    "- `regionId` 로 특정 지역만 필터할 수 있습니다.",
    "- `rating` 으로 1~5점 후기만 필터할 수 있습니다.",
    "- `sort=createdAt`(기본)은 최신순, `sort=createdAtAsc`는 오래된 순, `sort=rating`은 별점 높은 순입니다. 별점이 같으면 최신순입니다.",
    "- Access Token이 만료되면 비회원과 같이 조회되며 `isMine`은 false입니다.",
    "- Authorization 형식이 잘못되었거나 위조된 토큰이면 401, 정지·탈퇴 계정이면 403입니다.",
    "- `keyword`·`regionId`·`rating`·`sort`가 바뀌면 `cursor` 없이 처음부터 조회해야 합니다.",
    "- 조건이 다른 `cursor`를 보내면 유효하지 않은 커서로 응답합니다.",
    "- `cursor`가 없으면 해당 조건의 첫 페이지부터 조회합니다.",
    "- `cursor`가 있으면 해당 위치 다음 후기를 조회합니다.",
    "- 다음 페이지는 응답의 `pagination.nextCursor`로 요청합니다.",
    "- 존재하지 않는 지역이면 지원하지 않는 지역으로 응답합니다.",
  ].join("\n"),
  PUBLIC_DETAIL_SUMMARY: "거주후기 상세 (공개)",
  PUBLIC_DETAIL_DESCRIPTION: [
    "비회원도 조회할 수 있습니다. 로그인하면 `isMine`으로 본인 작성 여부를 확인할 수 있습니다.",
    "숨김 처리된 후기는 작성자를 포함해 조회할 수 없습니다.",
    "Access Token이 만료되면 비회원과 같이 조회되며 `isMine`은 false입니다.",
    "Authorization 형식이 잘못되었거나 위조된 토큰이면 401, 정지·탈퇴 계정이면 403입니다.",
  ].join(" "),
  STATISTIC_SUMMARY: "지역 거주후기 통계 (공개)",
  STATISTIC_DESCRIPTION: [
    "인증 없이 접근 가능합니다.",
    "",
    "- 해당 지역의 노출 중인(`isHidden=false`) 후기 평점 합계, 후기 수, 평균 평점을 조회합니다.",
    "- 숨김 처리된 후기는 통계에 포함되지 않습니다.",
    "- 후기가 없는 지역은 평점 합계 0, 후기 수 0, 평균 0으로 응답합니다.",
    "- 평균 평점은 소수 둘째 자리까지 반올림된 값입니다.",
  ].join("\n"),
  MY_LIST_SUMMARY: "내 거주후기 목록",
  MY_LIST_DESCRIPTION: [
    "로그인한 고객이 작성한 후기를 최신순으로 조회합니다. 숨김 후기는 포함되지 않습니다.",
    "본인 목록이므로 `isMine`은 포함하지 않습니다.",
    "페이지 번호(`page`) 기반 offset 페이지네이션을 사용합니다. 내 후기는 건수가 많지 않고 특정 페이지를 바로 열 수 있어야 해서, 공개 목록의 cursor 방식과 다르게 유지합니다.",
  ].join(" "),
  CREATE_SUMMARY: "거주후기 작성",
  CREATE_DESCRIPTION: [
    "특정 지역에 대한 거주후기를 작성합니다.",
    "",
    "- 작성은 고객 본인만 가능합니다.",
    "- 평점은 정수 1~5입니다.",
    "- 지역 평점 통계는 같은 트랜잭션에서 갱신됩니다.",
  ].join("\n"),
  UPDATE_SUMMARY: "거주후기 수정",
  UPDATE_DESCRIPTION: [
    "작성자 본인만 수정할 수 있습니다.",
    "숨김 처리된 후기는 수정할 수 없습니다.",
    "평점이 바뀌면 지역 통계도 함께 갱신됩니다.",
  ].join(" "),
  DELETE_SUMMARY: "거주후기 삭제",
  DELETE_DESCRIPTION: [
    "작성자 본인만 삭제할 수 있습니다.",
    "숨김 처리된 후기는 삭제할 수 없습니다.",
    "삭제 시 지역 통계도 함께 갱신됩니다.",
  ].join(" "),
  LIST_SUCCESS: "조회 성공",
  CREATE_SUCCESS: "생성 성공",
  UPDATE_SUCCESS: "수정 성공",
  DELETE_SUCCESS: "삭제 성공",
} as const;

registerRouterDocs(publicResidenceReviewRouter, {
  basePath: "/api/residence-reviews",
  tag: RESIDENCE_REVIEW_DOCS.TAG_PUBLIC,
  commonResponses: {
    422: ERROR_CODES.VALIDATION_ERROR.message,
  },
  endpoints: {
    "GET /": {
      summary: RESIDENCE_REVIEW_DOCS.PUBLIC_LIST_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.PUBLIC_LIST_DESCRIPTION,
      responses: {
        200: RESIDENCE_REVIEW_DOCS.LIST_SUCCESS,
        400: ERROR_CODES.REGION_NOT_FOUND.message,
        401: ERROR_CODES.UNAUTHORIZED.message,
        403: ERROR_CODES.FORBIDDEN.message,
      },
    },
    "GET /statistics/:regionId": {
      summary: RESIDENCE_REVIEW_DOCS.STATISTIC_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.STATISTIC_DESCRIPTION,
      responses: {
        200: RESIDENCE_REVIEW_DOCS.LIST_SUCCESS,
        400: ERROR_CODES.REGION_NOT_FOUND.message,
      },
    },
    "GET /:residenceReviewId": {
      summary: RESIDENCE_REVIEW_DOCS.PUBLIC_DETAIL_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.PUBLIC_DETAIL_DESCRIPTION,
      responses: {
        200: RESIDENCE_REVIEW_DOCS.LIST_SUCCESS,
        401: ERROR_CODES.UNAUTHORIZED.message,
        403: ERROR_CODES.FORBIDDEN.message,
        404: ERROR_CODES.RESIDENCE_REVIEW_NOT_FOUND.message,
      },
    },
  },
});

registerRouterDocs(residenceReviewRouter, {
  basePath: "/api/residence-reviews",
  tag: RESIDENCE_REVIEW_DOCS.TAG_CUSTOMER,
  headers: authHeaderSchema,
  commonResponses: {
    401: ERROR_CODES.UNAUTHORIZED.message,
    403: ERROR_CODES.FORBIDDEN.message,
    422: ERROR_CODES.VALIDATION_ERROR.message,
  },
  endpoints: {
    "GET /me": {
      summary: RESIDENCE_REVIEW_DOCS.MY_LIST_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.MY_LIST_DESCRIPTION,
      responses: { 200: RESIDENCE_REVIEW_DOCS.LIST_SUCCESS },
    },
    "POST /": {
      summary: RESIDENCE_REVIEW_DOCS.CREATE_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.CREATE_DESCRIPTION,
      responses: {
        201: RESIDENCE_REVIEW_DOCS.CREATE_SUCCESS,
        400: ERROR_CODES.REGION_NOT_FOUND.message,
      },
    },
    "PATCH /:residenceReviewId": {
      summary: RESIDENCE_REVIEW_DOCS.UPDATE_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.UPDATE_DESCRIPTION,
      responses: {
        200: RESIDENCE_REVIEW_DOCS.UPDATE_SUCCESS,
        404: ERROR_CODES.RESIDENCE_REVIEW_NOT_FOUND.message,
      },
    },
    "DELETE /:residenceReviewId": {
      summary: RESIDENCE_REVIEW_DOCS.DELETE_SUMMARY,
      description: RESIDENCE_REVIEW_DOCS.DELETE_DESCRIPTION,
      responses: {
        200: RESIDENCE_REVIEW_DOCS.DELETE_SUCCESS,
        404: ERROR_CODES.RESIDENCE_REVIEW_NOT_FOUND.message,
      },
    },
  },
});
