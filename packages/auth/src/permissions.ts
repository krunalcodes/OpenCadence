import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const apiKeyActions = ["create", "read", "update", "delete"] as const;

export const workspaceStatements = {
  ...defaultStatements,
  apiKey: apiKeyActions,
} as const;

export const workspaceAccess = createAccessControl(workspaceStatements);

export const workspaceRoles = {
  owner: workspaceAccess.newRole({
    ...ownerAc.statements,
    apiKey: [...apiKeyActions],
  }),
  admin: workspaceAccess.newRole({
    ...adminAc.statements,
    apiKey: [...apiKeyActions],
  }),
  member: workspaceAccess.newRole({
    ...memberAc.statements,
    apiKey: [],
  }),
};
