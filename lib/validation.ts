import { z } from "zod";
import { frequencies } from "./types";

export const subscriptionSchema = z.object({
  name: z.string().trim().min(1, "Enter a subscription name").max(80),
  price: z.coerce.number().min(0, "Price cannot be negative").max(1_000_000),
  billingFrequency: z.enum(frequencies),
  nextPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a payment date"),
  websiteUrl: z.string().trim().refine((value) => !value || /^https?:\/\//i.test(value), "Use a full http:// or https:// link"),
});
