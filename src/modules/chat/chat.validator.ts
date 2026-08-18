import { z } from "zod";

import { CHAT_IMAGE_CONTENT_TYPES } from "./chat-image.type";

export const chatRoomParamSchema = z.object({
  roomId: z.coerce.number().int().positive("유효하지 않은 채팅방 ID입니다."),
});

export const createChatRoomBodySchema = z.object({
  estimateId: z.number().int().positive("유효하지 않은 견적 ID입니다."),
});

export const chatMessageListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive("유효하지 않은 메시지 커서입니다.").optional(),
  limit: z.coerce
    .number()
    .int("메시지 조회 개수는 정수로 입력해주세요.")
    .positive("메시지 조회 개수는 1개 이상이어야 합니다.")
    .max(50, "메시지는 한 번에 최대 50개까지 조회할 수 있습니다.")
    .default(30),
});

export const joinChatRoomPayloadSchema = z.object({
  roomId: z.number().int().positive("유효하지 않은 채팅방 ID입니다."),
  lastMessageId: z.number().int().positive("유효하지 않은 메시지 ID입니다.").nullable().optional(),
});

export const leaveChatRoomPayloadSchema = z.object({
  roomId: z.number().int().positive("유효하지 않은 채팅방 ID입니다."),
});

export const sendChatMessagePayloadSchema = z.object({
  roomId: z.number().int().positive("유효하지 않은 채팅방 ID입니다."),
  content: z
    .string()
    .trim()
    .min(1, "메시지를 입력해주세요.")
    .max(1000, "메시지는 최대 1000자까지 입력할 수 있습니다."),
  clientMessageId: z
    .string()
    .trim()
    .min(1, "클라이언트 메시지 ID는 비어 있을 수 없습니다.")
    .max(100, "클라이언트 메시지 ID는 최대 100자까지 입력할 수 있습니다.")
    .optional(),
});

export const chatImageUploadUrlBodySchema = z.object({
  contentType: z.enum(CHAT_IMAGE_CONTENT_TYPES, {
    error: "지원하지 않는 이미지 형식입니다.",
  }),
});

export const sendChatImageMessagePayloadSchema = z.object({
  roomId: z.number().int().positive("유효하지 않은 채팅방 ID입니다."),
  imageKey: z.string().trim().min(1, "이미지 Key를 입력해주세요."),
  clientMessageId: z
    .string()
    .trim()
    .min(1, "클라이언트 메시지 ID는 비어 있을 수 없습니다.")
    .max(100, "클라이언트 메시지 ID는 최대 100자까지 입력할 수 있습니다.")
    .optional(),
});
