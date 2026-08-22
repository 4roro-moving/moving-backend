import type { z } from "zod";

import type { myContentParamsSchema } from "./my-content.validator";

export type MyContentParams = z.infer<typeof myContentParamsSchema>;

export type MyContentType = MyContentParams["contentType"];

export interface MyContentLatestModeration {
  action: "HIDE" | "UNHIDE";
  reason: string | null;
  adminName: string;
  createdAt: Date;
}

export interface MyContentDetail {
  contentType: "REVIEW" | "RESIDENCE_REVIEW" | "GIVEAWAY";
  id: number;
  isHidden: boolean;
  authorName: string;
  createdAt: Date;
  /** 리뷰·거주후기 별점. 나눔은 null */
  rating: number | null;
  /** 거주후기·나눔 제목. 리뷰는 null */
  title: string | null;
  /** 본문 (리뷰/거주후기 content, 나눔 description) */
  body: string;
  /** 부가 정보 (기사님 이름, 지역명 등) */
  meta: string | null;
  latestModeration: MyContentLatestModeration | null;
}
