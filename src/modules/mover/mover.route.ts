import { Router } from "express";

import { validate } from "../../middlewares/validate";
import { moverController } from "./mover.controller";
import { listMoverQuerySchema } from "./mover.validator";

const moverRouter = Router();

moverRouter.get("/", validate({ query: listMoverQuerySchema }), moverController.getMovers);

export default moverRouter;
