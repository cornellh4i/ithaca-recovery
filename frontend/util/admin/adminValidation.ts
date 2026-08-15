import { z } from "zod";
import { Role } from "@prisma/client";

// One schema per route (not a single shared schema with an optional role) because write's
// role is optional (defaults to ADMIN) while update's is required.
export const adminInviteSchema = z.object({
  email: z.email(),
  role: z.enum(Role).optional(),
});

export const adminRoleUpdateSchema = z.object({
  email: z.email(),
  role: z.enum(Role),
});
