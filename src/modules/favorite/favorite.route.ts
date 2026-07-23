import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { favoriteController } from "./favorite.controller";
import { favoriteMoverParamSchema } from "./favorite.validator";

const favoriteRouter = Router();

favoriteRouter.use(authenticate, authorize("CUSTOMER"));

favoriteRouter
  .route("/movers/:moverId")
  .post(validate({ params: favoriteMoverParamSchema }), favoriteController.createFavoriteMover)
  .delete(validate({ params: favoriteMoverParamSchema }), favoriteController.deleteFavoriteMover);

export default favoriteRouter;
