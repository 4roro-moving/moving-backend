import { z } from "zod";

export const notificationIdParamSchema = z.object({
  notificationId: z.coerce
    .number()
    .int("알림 ID는 정수여야 합니다.")
    .positive("알림 ID는 1 이상의 숫자여야 합니다."),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
