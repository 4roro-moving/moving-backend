import type { z } from "zod";

import type { favoriteMoverParamSchema } from "./favorite.validator";

export type FavoriteMoverParam = z.infer<typeof favoriteMoverParamSchema>;

export type FavoriteMoverParams = {
  customerId: string;
  moverId: string;
};
