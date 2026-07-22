import type { z } from "zod";

import type { listMoverQuerySchema } from "./mover.validator";

export type ListMoverQuery = z.infer<typeof listMoverQuerySchema>;
