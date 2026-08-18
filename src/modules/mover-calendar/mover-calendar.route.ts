import { Router } from "express";

import { authenticate, authorize, optionalAuthenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { moverIdParamSchema } from "../mover/mover.validator";
import { moverCalendarController } from "./mover-calendar.controller";
import {
  calendarDateParamSchema,
  calendarMonthQuerySchema,
  updateCalendarDaySchema,
} from "./mover-calendar.validator";

export const moverCalendarRouter = Router();

//기사 본인의 특정 날짜 일정 변경
moverCalendarRouter.put(
  "/me/calendar/:date",
  authenticate,
  authorize("MOVER"),
  validate({ params: calendarDateParamSchema, body: updateCalendarDaySchema }),
  asyncHandler(moverCalendarController.updateMyCalendarDay),
);

//특정 기사의 월간 캘린더 조회
moverCalendarRouter.get(
  "/:moverId/calendar",
  optionalAuthenticate,
  validate({ params: moverIdParamSchema, query: calendarMonthQuerySchema }),
  asyncHandler(moverCalendarController.getMonthlyCalendar),
);
