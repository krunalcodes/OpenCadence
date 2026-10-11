import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { API_KEY_HEADER, type Auth, type AuthSession } from "@workspace/auth";
import type { Db } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

export const WORKSPACE_AUTH_METHODS = "WORKSPACE_AUTH_METHODS";

export type WorkspaceAuthMethod = "session" | "apiKey";

export type WorkspaceAuthContext =
  | { method: "session"; workspaceId: string; userId: string }
  | { method: "apiKey"; workspaceId: string; apiKeyId: string };

type WorkspaceRequest = {
  headers: Record<string, string | string[] | undefined>;
  session?: AuthSession | null;
  workspaceAuth?: WorkspaceAuthContext;
};

@Injectable()
export class WorkspaceAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService<Auth>,
    @Inject(DATABASE) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext) {
    const methods = this.reflector.getAllAndOverride<
      WorkspaceAuthMethod[] | undefined
    >(WORKSPACE_AUTH_METHODS, [context.getHandler(), context.getClass()]) ?? [
      "session",
    ];
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const header = request.headers[API_KEY_HEADER];
    const key = Array.isArray(header) ? header[0] : header;

    if (key && methods.includes("apiKey")) {
      request.workspaceAuth = await this.fromApiKey(key);
      return true;
    }

    if (methods.includes("session")) {
      const workspaceAuth = await this.fromSession(request.session);
      if (workspaceAuth) {
        request.workspaceAuth = workspaceAuth;
        return true;
      }
    }

    throw new UnauthorizedException();
  }

  private async fromApiKey(key: string): Promise<WorkspaceAuthContext> {
    const result = await this.authService.api.verifyApiKey({ body: { key } });

    if (result.valid && result.key) {
      return {
        method: "apiKey",
        workspaceId: result.key.referenceId,
        apiKeyId: result.key.id,
      };
    }

    if (result.error?.code === "RATE_LIMITED") {
      throw new HttpException(
        "This API key has reached its request limit. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    throw new UnauthorizedException("The API key is not valid.");
  }

  private async fromSession(
    session: AuthSession | null | undefined,
  ): Promise<WorkspaceAuthContext | null> {
    const workspaceId = session?.session.activeOrganizationId;
    if (!session || !workspaceId) {
      return null;
    }

    const membership = await this.db.query.workspaceMembers.findFirst({
      columns: { id: true },
      where: (member, { and, eq }) =>
        and(
          eq(member.workspaceId, workspaceId),
          eq(member.userId, session.user.id),
        ),
    });

    return membership
      ? { method: "session", workspaceId, userId: session.user.id }
      : null;
  }
}
