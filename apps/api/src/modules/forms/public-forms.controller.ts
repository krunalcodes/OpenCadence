import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { type TrackedRequest, visitorOf } from "../tracking/request-info";
import { PublicFormsService } from "./public-forms.service";

@ApiTags("public forms")
@Controller("public/forms")
export class PublicFormsController {
  constructor(
    @Inject(PublicFormsService) private readonly forms: PublicFormsService,
  ) {}

  @Get("confirm/:token")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Read what a confirmation link is for",
    description:
      "The state of the sign-up behind a confirmation link: pending, already or expired. Reading changes nothing, so a mail scanner that opens the link does not subscribe anyone.",
  })
  inspect(@Param("token") token: string, @Req() request: TrackedRequest) {
    return this.forms.inspect(token, visitorOf(request));
  }

  @Post("confirm/:token")
  @HttpCode(200)
  @AllowAnonymous()
  @ApiOperation({
    summary: "Confirm a sign-up",
    description:
      "Subscribes the address the confirmation email was sent to. Safe to repeat: the second call answers already.",
  })
  confirm(@Param("token") token: string, @Req() request: TrackedRequest) {
    return this.forms.confirm(token, visitorOf(request));
  }

  @Get(":publicId")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Read a published form",
    description:
      "What the hosted form page needs to draw the form. Returns 404 unless the form is published.",
  })
  get(@Param("publicId") publicId: string, @Req() request: TrackedRequest) {
    return this.forms.get(publicId, visitorOf(request));
  }
}
