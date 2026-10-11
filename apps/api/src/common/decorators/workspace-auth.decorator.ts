import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiSecurity,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import {
  WORKSPACE_AUTH_METHODS,
  type WorkspaceAuthContext,
  WorkspaceAuthGuard,
  type WorkspaceAuthMethod,
} from "../guards/workspace-auth.guard";

export const API_KEY_SECURITY = "apiKey";

export function WorkspaceAuth(...methods: WorkspaceAuthMethod[]) {
  const allowed: WorkspaceAuthMethod[] =
    methods.length > 0 ? methods : ["session"];
  const acceptsApiKey = allowed.includes("apiKey");

  return applyDecorators(
    AllowAnonymous(),
    SetMetadata(WORKSPACE_AUTH_METHODS, allowed),
    UseGuards(WorkspaceAuthGuard),
    ...(allowed.includes("session") ? [ApiCookieAuth()] : []),
    ...(acceptsApiKey
      ? [
          ApiSecurity(API_KEY_SECURITY),
          ApiTooManyRequestsResponse({
            description: "The API key has reached its request limit.",
          }),
        ]
      : []),
    ApiUnauthorizedResponse({
      description: acceptsApiKey
        ? "No valid session or workspace API key was sent."
        : "No valid session was sent.",
    }),
  );
}

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceAuthContext =>
    context.switchToHttp().getRequest().workspaceAuth,
);
