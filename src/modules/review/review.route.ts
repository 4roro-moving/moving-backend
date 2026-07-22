import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { createReviewSchema } from "../../validators/review.validator";
import { reviewController } from "./review.controller";

const reviewRouter = Router();

// 리뷰 기능은 고객만 사용할 수 있으므로 라우터 전체에 인증/권한 검사를 적용한다.
reviewRouter.use(authenticate, authorize("CUSTOMER"));

reviewRouter.get("/reviewable", reviewController.getReviewableEstimateList);
reviewRouter.post("/", validate({ body: createReviewSchema }), reviewController.createReview);

export default reviewRouter;
