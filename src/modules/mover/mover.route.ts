import { Router } from "express";

import { optionalAuthenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { reviewController } from "../review/review.controller";
import { listMoverReviewQuerySchema } from "../review/review.validator";
import { moverController } from "./mover.controller";
import { listMoverQuerySchema, moverIdParamSchema } from "./mover.validator";

const moverRouter = Router();

moverRouter.get(
  "/",
  optionalAuthenticate,
  validate({ query: listMoverQuerySchema }),
  moverController.getMovers,
);

// 특정 기사님에게 작성된 리뷰 목록 조회
moverRouter.get(
  "/:moverId/reviews",
  validate({ params: moverIdParamSchema, query: listMoverReviewQuerySchema }),
  reviewController.getMoverReviewList,
);

moverRouter.get(
  "/:moverId",
  optionalAuthenticate,
  validate({ params: moverIdParamSchema }),
  moverController.getMoverDetail,
);

export default moverRouter;
