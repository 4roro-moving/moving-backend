import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { favoriteController } from "./favorite.controller";
import { favoriteMoverParamSchema, listFavoriteMoverQuerySchema } from "./favorite.validator";

const favoriteRouter = Router();

favoriteRouter.use(authenticate, authorize("CUSTOMER"));

favoriteRouter.get(
  "/movers",
  validate({ query: listFavoriteMoverQuerySchema }),
  favoriteController.getFavoriteMoverList,
);

favoriteRouter
  .route("/movers/:moverId")
  .post(validate({ params: favoriteMoverParamSchema }), favoriteController.createFavoriteMover)
  .delete(validate({ params: favoriteMoverParamSchema }), favoriteController.deleteFavoriteMover);

export default favoriteRouter;
