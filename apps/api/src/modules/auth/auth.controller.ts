import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Auth } from "@workspace/auth";

@ApiTags("auth")
@Controller()
export class AuthController {
  @Get("me")
  @ApiCookieAuth()
  @ApiOperation({ summary: "Current user and active workspace" })
  getMe(@Session() session: UserSession<Auth>) {
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
      },
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    };
  }
}
