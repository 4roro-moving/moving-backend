import type { MoveType, Prisma } from "@prisma/client";

export function toHistorySnapshot(request: {
  moveType: MoveType;
  moveDate: Date;
  fromAddress: string;
  toAddress: string;
}): Prisma.InputJsonObject {
  return {
    moveType: request.moveType,
    moveDate: request.moveDate.toISOString(),
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
  };
}
