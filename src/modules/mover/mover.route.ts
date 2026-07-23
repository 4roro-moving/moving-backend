import { Router } from "express";

import { validate } from "../../middlewares/validate";
import { optionalAuthenticate } from "../../middlewares/auth";
import { moverController } from "./mover.controller";
import { listMoverQuerySchema, moverIdParamSchema } from "./mover.validator";

const moverRouter = Router();

moverRouter.get(
  "/",
  optionalAuthenticate,
  validate({ query: listMoverQuerySchema }),
  moverController.getMovers,
);

moverRouter.get(
  "/:moverId",
  optionalAuthenticate,
  validate({ params: moverIdParamSchema }),
  moverController.getMoverDetail,
);

export default moverRouter;
