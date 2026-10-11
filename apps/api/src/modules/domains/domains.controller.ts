import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { DomainsService } from "./domains.service";

function body(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

const selectorsSchema = {
  type: "array",
  maxItems: 10,
  items: { type: "string", maxLength: 63, example: "google" },
} as const;

@ApiTags("domains")
@Controller("domains")
export class DomainsController {
  constructor(
    @Inject(DomainsService) private readonly domains: DomainsService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List the sending domains",
    description:
      "Every domain in the workspace, ordered by name, with the result of its last SPF, DKIM, DMARC and MX check and the sending sources that send from it.",
  })
  list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.domains.list(workspace.workspaceId);
  }

  @Get("suggestions")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Suggest domains to add",
    description:
      "Domains that connected sending sources send from and that are not in the workspace yet. Personal mailbox domains are left out.",
  })
  suggestions(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.domains.suggestions(workspace.workspaceId);
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Add a sending domain",
    description:
      "Adds the domain and checks its DNS records once before answering. Send the registrable domain in lower case or as typed: it is lower-cased and international names are stored in punycode. A domain already in the workspace returns 409 with the code domain_taken. When no DKIM selector is sent, common selectors are probed and the ones that exist are returned in suggestedSelectors.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: { type: "string", maxLength: 253, example: "example.com" },
        dkimSelectors: selectorsSchema,
      },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    const { domain, dkimSelectors } = body(input);
    return this.domains.create(
      {
        workspaceId: workspace.workspaceId,
        userId: workspace.method === "session" ? workspace.userId : null,
      },
      { domain, dkimSelectors },
    );
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a sending domain" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.domains.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Change the DKIM selectors of a domain",
    description:
      "Replaces the selectors that are checked. The records are checked again right away unless the domain was checked in the last 30 seconds, in which case the check runs within a few minutes.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["dkimSelectors"],
      properties: { dkimSelectors: selectorsSchema },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const { dkimSelectors } = body(input);
    return this.domains.update(workspace.workspaceId, id, { dkimSelectors });
  }

  @Post(":id/check")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Check the DNS records of a domain now",
    description:
      "Looks up SPF, DKIM, DMARC and MX and returns the domain with the new result. A record whose lookup timed out keeps its previous result and is named in inconclusive. Limited to one check per domain every 30 seconds.",
  })
  @ApiTooManyRequestsResponse({
    description: "The domain was checked less than 30 seconds ago.",
  })
  check(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.domains.check(workspace.workspaceId, id);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Remove a sending domain",
    description:
      "Stops the checks for this domain. Nothing changes in DNS and sending is not affected.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.domains.remove(workspace.workspaceId, id);
  }
}
