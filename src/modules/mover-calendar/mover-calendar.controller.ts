import type { Request, Response } from "express";

import { assertAuthenticated } from "../../utils/request-auth.util";
import { sendResponse } from "../../utils/response.util";
import { moverCalendarService } from "./mover-calendar.service";
import type {
  CalendarDateParam,
  CalendarMonthQuery,
  UpdateCalendarDayInput,
} from "./mover-calendar.type";
import type { MoverIdParam } from "../mover/mover.type";

export const moverCalendarController = {
  getMonthlyCalendar: async (req: Request, res: Response) => {
    const { moverId } = res.locals.params as MoverIdParam;
    const query = res.locals.query as CalendarMonthQuery;
    const result = await moverCalendarService.getMonthlyCalendar({
      moverId,
      query,
      ...(req.user ? { viewerId: req.user.id, viewerRole: req.user.role } : {}),
    });
    return sendResponse(res, 200, result);
  },

  updateMyCalendarDay: async (req: Request, res: Response) => {
    assertAuthenticated(req);
    const { date } = res.locals.params as CalendarDateParam;
    const { status } = req.body as UpdateCalendarDayInput;
    const result = await moverCalendarService.updateDay({ moverId: req.user.id, date, status });
    return sendResponse(res, 200, result);
  },
};
