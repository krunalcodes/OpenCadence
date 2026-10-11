import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { BrandService, brandFontFamilies } from "./brand.service";

const color = { type: "string", example: "#2563eb" };

@ApiTags("brand")
@Controller("brand")
export class BrandController {
  constructor(@Inject(BrandService) private readonly brand: BrandService) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Read the brand settings",
    description:
      "The name, logo, colours, font, address, and voice used in the workspace's emails. Returns the defaults until the settings are saved.",
  })
  get(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return this.brand.read(workspace);
  }

  @Put()
  @WorkspaceAuth("session")
  @ApiOperation({
    summary: "Save the brand settings",
    description:
      "Send only the fields to change. Only workspace owners and admins can save; other members get 403 with the code forbidden.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        brandName: { type: "string", maxLength: 120 },
        websiteUrl: { type: "string", format: "uri", nullable: true },
        logoMediaId: { type: "string", format: "uuid", nullable: true },
        primaryColor: color,
        backgroundColor: color,
        contentColor: color,
        textColor: color,
        fontFamily: { type: "string", enum: [...brandFontFamilies] },
        postalAddress: { type: "string", maxLength: 500, nullable: true },
        voice: { type: "string", maxLength: 1000, nullable: true },
        socialLinks: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            required: ["network", "url"],
            properties: {
              network: { type: "string", maxLength: 40 },
              url: { type: "string", format: "uri" },
            },
          },
        },
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.brand.update(workspace, input);
  }
}
