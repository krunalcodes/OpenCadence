import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { apiError } from "../../common/api-error";
import { type TrackedRequest, visitorOf } from "./request-info";
import { TrackingService } from "./tracking.service";

type Reply = {
  status(code: number): Reply;
  header(name: string, value: string): Reply;
  send(payload?: unknown): unknown;
};

const pixel = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const noStore = "no-store, no-cache, must-revalidate, private, max-age=0";

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This link is not valid or has expired.",
  );
}

@ApiTags("tracking")
@Controller("t")
export class TrackingController {
  constructor(
    @Inject(TrackingService) private readonly tracking: TrackingService,
  ) {}

  @Get("o/:file")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Open pixel",
    description:
      "A 1 by 1 image placed in emails that have open tracking on. The file name is the message token followed by .gif. It always answers with the image.",
  })
  @ApiProduces("image/gif")
  open(
    @Param("file") file: string,
    @Req() request: TrackedRequest,
    @Res() reply: Reply,
  ) {
    reply
      .status(200)
      .header("Content-Type", "image/gif")
      .header("Content-Length", String(pixel.length))
      .header("Cache-Control", noStore)
      .header("X-Content-Type-Options", "nosniff")
      .send(pixel);
    if (request.method !== "HEAD") {
      const token = file.endsWith(".gif") ? file.slice(0, -4) : file;
      void this.tracking.recordOpen(token, visitorOf(request));
    }
  }

  @Get("c/:token")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Tracked link",
    description:
      "Redirects to the address signed into the link when the email was sent. A link whose signature does not match answers 404 and never redirects.",
  })
  click(
    @Param("token") token: string,
    @Query("u") target: unknown,
    @Query("s") signature: unknown,
    @Req() request: TrackedRequest,
    @Res() reply: Reply,
  ) {
    const click = this.tracking.clickTarget(token, target, signature);
    if (!click) {
      throw notFound();
    }
    reply
      .status(302)
      .header("Location", click.location)
      .header("Cache-Control", noStore)
      .header("Referrer-Policy", "no-referrer")
      .send();
    if (request.method !== "HEAD") {
      void this.tracking.recordClick(
        click.messageId,
        click.url,
        visitorOf(request),
      );
    }
  }

  @Get("u/:token")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Unsubscribe link",
    description:
      "Redirects to the unsubscribe page. Opening the link changes nothing, so a mail scanner that follows it does not unsubscribe anyone.",
  })
  unsubscribeLink(@Param("token") token: string, @Res() reply: Reply) {
    const location = this.tracking.unsubscribePage(token);
    if (!location) {
      throw notFound();
    }
    reply
      .status(302)
      .header("Location", location)
      .header("Cache-Control", noStore)
      .send();
  }

  @Get("p/:token")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Email preferences link",
    description:
      "Redirects to the page where a recipient chooses which lists they get. Opening the link changes nothing.",
  })
  preferencesLink(@Param("token") token: string, @Res() reply: Reply) {
    const location = this.tracking.preferencesPage(token);
    if (!location) {
      throw notFound();
    }
    reply
      .status(302)
      .header("Location", location)
      .header("Cache-Control", noStore)
      .send();
  }

  @Get("u/:token/details")
  @AllowAnonymous()
  @ApiOperation({
    summary: "Read what an unsubscribe link is for",
    description:
      "The masked address, the sender's brand name, the list the email was sent to when there is one, and whether the address is already unsubscribed.",
  })
  async details(@Param("token") token: string, @Req() request: TrackedRequest) {
    await this.tracking.allow("page", visitorOf(request));
    return this.tracking.details(token);
  }

  @Post("u/:token/confirm")
  @HttpCode(200)
  @AllowAnonymous()
  @ApiOperation({
    summary: "Unsubscribe",
    description:
      'Scope "list" stops emails from the list the email was sent to. Scope "all" stops every campaign and sequence email from this sender. Without a scope it is the list when there is one. Safe to repeat.',
  })
  async confirm(
    @Param("token") token: string,
    @Body() body: { scope?: unknown } | undefined,
    @Req() request: TrackedRequest,
  ) {
    await this.tracking.allow("page", visitorOf(request));
    return this.tracking.unsubscribe(token, {
      scope: typeof body === "object" && body !== null ? body.scope : undefined,
    });
  }

  @Post("u/:token/resubscribe")
  @HttpCode(200)
  @AllowAnonymous()
  @ApiOperation({
    summary: "Undo an unsubscribe",
    description:
      "Subscribes the address again, for someone who unsubscribed by mistake. It never lifts a bounce, a complaint or a manual block. Safe to repeat.",
  })
  async resubscribe(
    @Param("token") token: string,
    @Req() request: TrackedRequest,
  ) {
    await this.tracking.allow("page", visitorOf(request));
    return this.tracking.resubscribe(token);
  }
}
