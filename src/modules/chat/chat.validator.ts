import { z } from "zod";

export const chatRoomParamSchema = z.object({
  roomId: z.coerce.number().int().positive("유효하지 않은 채팅방 ID입니다."),
});

export const createChatRoomBodySchema = z.object({
  estimateId: z.number().int().positive("유효하지 않은 견적 ID입니다."),
});

export const chatMessageListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive("유효하지 않은 메시지 커서입니다.").optional(),
  limit: z.coerce.number().int().positive().max(50).default(30),
});

export const joinChatRoomPayloadSchema = z.object({
  roomId: z.number().int().positive("유효하지 않은 채팅방 ID입니다."),
  lastMessageId: z.number().int().positive("유효하지 않은 메시지 ID입니다.").nullable().optional(),
});

export const sendChatMessagePayloadSchema = z.object({
  roomId: z.number().int().positive("유효하지 않은 채팅방 ID입니다."),
  content: z
    .string()
    .trim()
    .min(1, "메시지를 입력해주세요.")
    .max(1000, "메시지는 최대 1000자까지 입력할 수 있습니다."),
  clientMessageId: z.string().trim().min(1).max(100).optional(),
});
