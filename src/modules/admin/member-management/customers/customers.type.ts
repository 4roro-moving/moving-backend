import type { z } from "zod";

import type { customerStatusSchema, listCustomerQuerySchema } from "./customers.validator";

export type CustomerStatus = z.infer<typeof customerStatusSchema>;
export type ListCustomerQuery = z.infer<typeof listCustomerQuerySchema>;

export type CustomerListItem = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: CustomerStatus;
  isProfileCompleted: boolean;
  createdAt: Date;
};
