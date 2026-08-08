import type { Role } from "@prisma/client";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "User",
};

const LABEL_TO_ROLE: Record<string, Role> = {
  "Super Admin": "SUPER_ADMIN",
  "Admin": "ADMIN",
  "User": "USER",
};

const ROLE_OPTIONS = ["Super Admin", "Admin", "User"];

export { ROLE_LABEL, LABEL_TO_ROLE, ROLE_OPTIONS };
