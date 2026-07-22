import { Router } from "express";

import { validate } from "../../middlewares/validate";
import { moverController } from "./mover.controller";
import { listMoverQuerySchema, moverIdParamSchema } from "./mover.validator";

const moverRouter = Router();

moverRouter.get("/", validate({ query: listMoverQuerySchema }), moverController.getMovers);

moverRouter.get(
  "/:moverId",
  validate({ params: moverIdParamSchema }),
  moverController.getMoverDetail,
);

export default moverRouter;
