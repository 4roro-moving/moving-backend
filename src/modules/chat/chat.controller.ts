import type { Request, Response } from "express";

import { AppError } from "../../lib/app-error";
import { sendResponse } from "../../utils/response.util";
import { chatImageService } from "./chat-image.service";
import { chatService } from "./chat.service";
import type {
  ChatImageUploadUrlBody,
  ChatMessageListQuery,
  ChatRoomParam,
  CreateChatRoomBody,
} from "./chat.type";

function getUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  return req.user.id;
}

export const chatController = {
  // POST /api/chats/rooms
  getOrCreateRoom: async (req: Request, res: Response) => {
    const body = req.body as CreateChatRoomBody;
    const room = await chatService.getOrCreateRoom(getUserId(req), body.estimateId);

    return sendResponse(res, 200, room, {
      message: "채팅방을 조회했습니다.",
    });
  },

  // GET /api/chats/rooms/:roomId
  getRoom: async (req: Request, res: Response) => {
    const { roomId } = res.locals.params as ChatRoomParam;
    const room = await chatService.getRoom(getUserId(req), roomId);

    return sendResponse(res, 200, room, {
      message: "채팅방을 조회했습니다.",
    });
  },

  // GET /api/chats/rooms/:roomId/messages
  getMessages: async (req: Request, res: Response) => {
    const { roomId } = res.locals.params as ChatRoomParam;
    const query = res.locals.query as ChatMessageListQuery;
    const result = await chatService.getMessages(getUserId(req), roomId, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return sendResponse(res, 200, result.messages, {
      message: "채팅 메시지 목록을 조회했습니다.",
      pagination: result.pagination,
    });
  },

  // POST /api/chats/rooms/:roomId/images/upload-url
  getImageUploadUrl: async (req: Request, res: Response) => {
    const { roomId } = res.locals.params as ChatRoomParam;
    const body = req.body as ChatImageUploadUrlBody;
    const result = await chatImageService.createUploadUrl(getUserId(req), roomId, body);

    return sendResponse(res, 200, result, {
      message: "채팅 이미지 업로드 URL을 발급했습니다.",
    });
  },
};
