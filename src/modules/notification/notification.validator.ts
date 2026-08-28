import { z } from "zod";

/*
 * 알림 목록 조회 Query를 검증한다.
 *
 * page는 1 이상,
 * limit는 1 이상 100 이하의 값만 허용한다.
 *
 * Query String은 문자열로 전달되므로
 * z.coerce.number()를 사용해 숫자로 변환한다.
 */
export const notificationListQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("페이지는 정수여야 합니다.")
    .min(1, "페이지는 1 이상이어야 합니다.")
    .default(1),

  limit: z.coerce
    .number()
    .int("조회 개수는 정수여야 합니다.")
    .min(1, "조회 개수는 1 이상이어야 합니다.")
    .max(100, "조회 개수는 100 이하여야 합니다.")
    .default(5),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationIdParamSchema = z.object({
  notificationId: z.coerce
    .number()
    .int("알림 ID는 정수여야 합니다.")
    .positive("알림 ID는 1 이상의 숫자여야 합니다."),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
