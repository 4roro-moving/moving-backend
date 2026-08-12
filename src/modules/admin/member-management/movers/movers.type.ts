import type { MoveType } from "@prisma/client";
import type { z } from "zod";

import type { MemberStatus } from "../member-status.constants";
import type { listMoverQuerySchema } from "./movers.validator";

export type ListMoverQuery = z.infer<typeof listMoverQuerySchema>;

export type MoverListItem = {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  career: number;
  status: MemberStatus;
  isProfileCompleted: boolean;
  averageRating: number;
  reviewCount: number;
  confirmedCount: number;
  serviceAreas: string[];
  serviceTypes: MoveType[];
  createdAt: Date;
};
