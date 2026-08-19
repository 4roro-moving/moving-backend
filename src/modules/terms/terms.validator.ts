import { z } from "zod";

// 페이지 번호 상한 (과도한 skip 값이 DB 조회로 전달되는 것을 방지)
const MAX_PAGE = 10000;
const MAX_TERMS_AGREEMENTS = 20;
/**
 * 약관 유형.
 * TERMS_OF_SERVICE: 서비스 이용약관 / PRIVACY_POLICY: 개인정보 처리방침 /
 * MARKETING_POLICY: 마케팅 정보 수신 동의 / LOCATION_POLICY: 위치정보 이용약관 /
 * MOVER_POLICY: 기사님 이용 정책 / OTHER: 기타
 */
const termsTypeSchema = z.enum(
  [
    "TERMS_OF_SERVICE",
    "PRIVACY_POLICY",
    "MARKETING_POLICY",
    "LOCATION_POLICY",
    "MOVER_POLICY",
    "OTHER",
  ],
  { error: "올바른 약관 유형이 아닙니다." },
);

/**
 * 약관 게시 상태.
 * DRAFT: 작성 중(미게시) / PUBLISHED: 게시됨 / ARCHIVED: 보관(효력 종료)
 */
const termsStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"], {
  error: "올바른 약관 상태가 아닙니다.",
});

/**
 * 약관 동의 대상.
 * ALL: 모든 회원 / CUSTOMER: 일반 사용자만 / MOVER: 기사님만
 */
const termsAudienceSchema = z.enum(["ALL", "CUSTOMER", "MOVER"], {
  error: "올바른 약관 대상이 아닙니다.",
});

/**
 * 시행일(effectiveAt). YYYY-MM-DD 문자열로 받는다.
 * DB 에는 timestamp with time zone 으로 저장되므로, UTC 기준 00:00:00 으로 변환해
 * 저장하며 존재하지 않는 날짜는 허용하지 않는다.
 */
const effectiveAtSchema = z
  .string({ error: "시행일은 문자열이어야 합니다." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "시행일은 YYYY-MM-DD 형식이어야 합니다.")
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);

      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    },
    {
      message: "존재하지 않는 날짜입니다.",
    },
  );

/**
 * 약관 생성 요청 body.
 * 생성 시 상태는 항상 DRAFT 이므로 status 는 받지 않는다.
 * type / version 은 약관의 정체성이라 생성 시에만 지정하고 이후 수정할 수 없다.
 */
export const createTermsSchema = z.object({
  type: termsTypeSchema,
  version: z
    .string({ error: "버전은 문자열이어야 합니다." })
    .trim()
    .min(1, "버전을 입력해 주세요.")
    .max(20, "버전은 20자 이하여야 합니다."),
  title: z
    .string({ error: "제목은 문자열이어야 합니다." })
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(200, "제목은 200자 이하여야 합니다."),
  content: z
    .string({ error: "본문은 문자열이어야 합니다." })
    .trim()
    .min(1, "본문을 입력해 주세요."),
  isRequired: z.boolean().default(true),
  audience: termsAudienceSchema.optional(),
  effectiveAt: effectiveAtSchema.optional(),
});

/**
 * 약관 수정 요청 body. 최소 한 개 필드는 있어야 합니다.
 * DRAFT 상태에서만 수정할 수 있으며(서비스에서 검증),
 * type / version 은 약관 정체성이라 수정 대상에서 제외한다.
 */
export const updateTermsSchema = z
  .object({
    title: z
      .string({ error: "제목은 문자열이어야 합니다." })
      .trim()
      .min(1, "제목을 입력해 주세요.")
      .max(200, "제목은 200자 이하여야 합니다.")
      .optional(),
    content: z
      .string({ error: "본문은 문자열이어야 합니다." })
      .trim()
      .min(1, "본문을 입력해 주세요.")
      .optional(),
    isRequired: z.boolean().optional(),
    audience: termsAudienceSchema.optional(),
    effectiveAt: effectiveAtSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 내용을 입력해 주세요.",
  });

/**
 * 약관 ID 경로 파라미터.
 */
export const termsIdParamSchema = z.object({
  termsId: z.coerce
    .number({ error: "올바른 약관 ID가 아닙니다." })
    .int("올바른 약관 ID가 아닙니다.")
    .positive("올바른 약관 ID가 아닙니다."),
});

/**
 * 관리자 약관 목록 조회 쿼리.
 * 관리자이므로 DRAFT / ARCHIVED 를 포함해 모든 상태를 조회할 수 있고,
 * type / status 로 필터링할 수 있다.
 */
export const listTermsQuerySchema = z.object({
  page: z.coerce
    .number({ error: "페이지 번호는 숫자여야 합니다." })
    .int("페이지 번호는 정수여야 합니다.")
    .positive("페이지 번호는 1 이상이어야 합니다.")
    .max(MAX_PAGE, `페이지 번호는 ${String(MAX_PAGE)} 이하여야 합니다.`)
    .default(1),
  limit: z.coerce
    .number({ error: "조회 개수는 숫자여야 합니다." })
    .int("조회 개수는 정수여야 합니다.")
    .positive("조회 개수는 1 이상이어야 합니다.")
    .max(50, "조회 개수는 50 이하여야 합니다.")
    .default(10),
  type: termsTypeSchema.optional(),
  status: termsStatusSchema.optional(),
});

/**
 * 사용자 공개 상세 조회 경로 파라미터 (/api/terms/:type).
 * URL 의 type 이 유효한 약관 유형인지 검증한다.
 */
export const termsTypeParamSchema = z.object({
  type: termsTypeSchema,
});

/**
 * 회원가입 시 전달하는 약관 동의 목록.
 *
 * 선택 약관은 거부(false)도 그대로 기록하므로 동의한 것만 보내지 말고
 * 화면에 노출한 약관 전체를 보내야 합니다.
 */
export const termsAgreementsSchema = z
  .array(
    z.strictObject({
      termsId: z
        .number({ error: "약관 ID는 숫자여야 합니다." })
        .int("올바른 약관 ID가 아닙니다.")
        .positive("올바른 약관 ID가 아닙니다."),
      isAgreed: z.boolean({ error: "동의 여부는 true 또는 false 여야 합니다." }),
    }),
    { error: "약관 동의 정보가 올바르지 않습니다." },
  )
  .max(MAX_TERMS_AGREEMENTS, `약관 동의는 ${String(MAX_TERMS_AGREEMENTS)}건 이하여야 합니다.`)
  .refine(
    (agreements) =>
      new Set(agreements.map((agreement) => agreement.termsId)).size === agreements.length,
    { error: "같은 약관이 중복으로 전달되었습니다." },
  );

export type TermsTypeParam = z.infer<typeof termsTypeParamSchema>;
