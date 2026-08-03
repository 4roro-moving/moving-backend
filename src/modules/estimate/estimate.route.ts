import { Router } from "express";

import customerEstimateRouter from "./customer/customer-estimate.route";
import moverEstimateRouter from "./mover/mover-estimate.route";

const estimateRouter = Router();

estimateRouter.use(moverEstimateRouter);
estimateRouter.use(customerEstimateRouter);

export default estimateRouter;
