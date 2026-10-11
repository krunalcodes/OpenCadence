import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { type TrackedRequest, visitorOf } from "../tracking/request-info";
import { PreferencesService } from "./preferences.service";

@ApiTags("preferences")
@Controller("public/preferences")
export class PreferencesController {
  constructor(
    @Inject(PreferencesService)
    private readonly preferences: PreferencesService,
  ) {}

  @Get(":token")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Read a recipient's email preferences",
    description:
      "The token comes from the preferences link in an email. Returns the masked address, the lists the recipient can choose from and whether they unsubscribed from everything.",
  })
  read(@Param("token") token: string, @Req() request: TrackedRequest) {
    return this.preferences.read(token, visitorOf(request));
  }

  @Post(":token")
  @HttpCode(200)
  @AllowAnonymous()
  @ApiOperation({
    summary: "Save a recipient's email preferences",
    description:
      "listIds is the full set of shown lists the recipient wants: every other shown list is unsubscribed. Lists that are not shown are ignored. unsubscribeAll stops every campaign and sequence email. Safe to repeat.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        listIds: { type: "array", items: { type: "string", format: "uuid" } },
        unsubscribeAll: { type: "boolean" },
      },
    },
  })
  save(
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: TrackedRequest,
  ) {
    return this.preferences.save(token, body, visitorOf(request));
  }
}
