import type { GiveawayStatus } from "@prisma/client";
import type { z } from "zod";

import type {
  giveawayIdParamSchema,
  hideGiveawayBodySchema,
  listAdminGiveawaysQuerySchema,
  unhideGiveawayBodySchema,
} from "./giveaways.validator";

export type { AdminGiveawaySort } from "./giveaways.constants";
export { ADMIN_GIVEAWAY_SORTS } from "./giveaways.constants";

export type ListAdminGiveawaysQuery = z.infer<typeof listAdminGiveawaysQuerySchema>;
export type GiveawayIdParam = z.infer<typeof giveawayIdParamSchema>;
export type HideGiveawayBody = z.infer<typeof hideGiveawayBodySchema>;
/** 복구 API는 body 필드 없음 (빈 객체) */
export type UnhideGiveawayBody = z.infer<typeof unhideGiveawayBodySchema>;

export type GiveawayContentType = "GIVEAWAY";

export interface LatestModeration {
  action: "HIDE" | "UNHIDE";
  reason: string | null;
  adminName: string;
  createdAt: Date;
}

export interface AdminGiveawayListItem {
  id: number;
  contentType: GiveawayContentType;
  isHidden: boolean;
  status: GiveawayStatus;
  title: string;
  description: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  region: {
    id: number;
    name: string;
  } | null;
  reportCount: number;
  latestModeration: LatestModeration | null;
  createdAt: Date;
  updatedAt: Date;
}
