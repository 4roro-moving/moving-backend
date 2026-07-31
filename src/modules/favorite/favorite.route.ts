import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { favoriteController } from "./favorite.controller";
import { favoriteMoverParamSchema, listFavoriteMoverQuerySchema } from "./favorite.validator";

const favoriteRouter = Router();

favoriteRouter.use(authenticate, authorize("CUSTOMER"));

favoriteRouter.get(
  "/movers",
  validate({ query: listFavoriteMoverQuerySchema }),
  asyncHandler(favoriteController.getFavoriteMoverList),
);

favoriteRouter
  .route("/movers/:moverId")
  .post(
    validate({ params: favoriteMoverParamSchema }),
    asyncHandler(favoriteController.createFavoriteMover),
  )
  .delete(
    validate({ params: favoriteMoverParamSchema }),
    asyncHandler(favoriteController.deleteFavoriteMover),
  );

export default favoriteRouter;
