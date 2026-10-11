import { HttpStatus } from "@nestjs/common";
import { apiError } from "./api-error";
import type { WorkspaceAuthContext } from "./guards/workspace-auth.guard";

const MANAGER_ROLES = new Set(["owner", "admin"]);

export function canManageWorkspace(context: WorkspaceAuthContext) {
  if (context.method !== "session") {
    return false;
  }
  return context.role
    .split(",")
    .some((role) => MANAGER_ROLES.has(role.trim().toLowerCase()));
}

export function assertCanManageWorkspace(context: WorkspaceAuthContext) {
  if (!canManageWorkspace(context)) {
    throw apiError(
      HttpStatus.FORBIDDEN,
      "forbidden",
      "Only workspace owners and admins can change this.",
    );
  }
}
