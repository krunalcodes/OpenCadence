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
  Put,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { EnrollmentsService } from "./enrollments.service";
import { SequencesService } from "./sequences.service";

const settingsProperties = {
  name: { type: "string", minLength: 1, maxLength: 120 },
  sourceIds: {
    type: "array",
    items: { type: "string", format: "uuid" },
    description: "The mailboxes this sequence rotates across.",
  },
  fromName: { type: "string", nullable: true, maxLength: 120 },
  fromEmail: {
    type: "string",
    nullable: true,
    format: "email",
    description:
      "The from address for sources without a fixed address, such as an email provider. A mailbox always sends as its own address. Send null or an empty string to clear it.",
  },
  trackOpens: { type: "boolean" },
  trackClicks: { type: "boolean" },
  stopOnReply: { type: "boolean" },
  timezone: { type: "string", description: "An IANA name, such as UTC." },
  sendDays: {
    type: "array",
    items: { type: "integer", minimum: 1, maximum: 7 },
    description: "ISO weekdays, 1 for Monday to 7 for Sunday.",
  },
  windowStartMinute: { type: "integer", minimum: 0, maximum: 1439 },
  windowEndMinute: { type: "integer", minimum: 1, maximum: 1440 },
  dailyLimitPerSource: { type: "integer", nullable: true, minimum: 1 },
  layout: {
    type: "object",
    nullable: true,
    description: "Node positions keyed by step id. Stored as sent.",
  },
};

function numberOf(value: string | undefined) {
  return value ? Number(value) || undefined : undefined;
}

@ApiTags("sequences")
@Controller("sequences")
export class SequencesController {
  constructor(
    @Inject(SequencesService) private readonly sequences: SequencesService,
    @Inject(EnrollmentsService)
    private readonly enrollments: EnrollmentsService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List sequences",
    description:
      "Sequences in the workspace, newest first. search matches the name. Pass nextCursor back as cursor to read the next page.",
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sequences.list(workspace.workspaceId, {
      status: status || undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: numberOf(limit),
    });
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a sequence",
    description:
      "Creates a draft. Names are unique in a workspace, ignoring case. A taken name returns 409 with the code name_taken.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name"],
      properties: settingsProperties,
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.sequences.create(workspace, input);
  }

  @Post("from-draft")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a sequence from drafted emails",
    description:
      "Creates one template per step, then a draft sequence with those steps in order. The html of each step is reduced to plain outreach markup (p, br, a, strong, em, ul, li) and its text version is derived from it. The first step starts the thread and later steps are replies unless threadMode says otherwise. A taken name returns 409 with the code name_taken. If anything fails, nothing is left behind.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "steps"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: {
            type: "object",
            required: ["waitMinutes", "html"],
            properties: {
              waitMinutes: { type: "integer", minimum: 0 },
              subject: { type: "string", maxLength: 998 },
              html: { type: "string", maxLength: 100000 },
              threadMode: { type: "string", enum: ["reply", "new"] },
            },
          },
        },
      },
    },
  })
  createFromDraft(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.sequences.createFromDraft(workspace, input);
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a sequence with its steps and mailboxes" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sequences.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a sequence's settings and layout",
    description:
      "Send only the fields to change. An archived sequence returns 409 with the code not_editable.",
  })
  @ApiBody({ schema: { type: "object", properties: settingsProperties } })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.sequences.update(workspace.workspaceId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a sequence",
    description:
      "Deletes the sequence and its enrolments. An active sequence returns 409 with the code sequence_active.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.sequences.remove(workspace.workspaceId, id);
  }

  @Post(":id/duplicate")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Duplicate a sequence",
    description:
      "Creates a draft with the same steps and settings and no enrolments.",
  })
  duplicate(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sequences.duplicate(workspace, id);
  }

  @Put(":id/steps")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Replace the steps of a sequence",
    description:
      "The list is the new order. A step sent with its id keeps its id and counters, a step without an id is created, and steps left out are deleted. The first wait counts from enrolment and may be zero. Later waits count from the previous step and are at least one minute.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: ["delayMinutes", "templateId"],
            properties: {
              id: { type: "string", format: "uuid" },
              delayMinutes: { type: "integer", minimum: 0 },
              templateId: { type: "string", format: "uuid", nullable: true },
              subject: { type: "string", maxLength: 998 },
              threadMode: { type: "string", enum: ["reply", "new"] },
            },
          },
        },
      },
    },
  })
  replaceSteps(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.sequences.replaceSteps(workspace.workspaceId, id, input);
  }

  @Get(":id/check")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Check whether a sequence is ready to activate",
    description: "Errors block activation. Warnings do not.",
  })
  check(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sequences.check(workspace.workspaceId, id);
  }

  @Post(":id/activate")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Activate a sequence",
    description:
      "Runs the check first. Errors return 409 with the code not_ready and the problems. Each step's content is taken from its template at this moment.",
  })
  activate(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sequences.activate(workspace.workspaceId, id);
  }

  @Post(":id/pause")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Pause a sequence",
    description:
      "No further steps are handed over for sending. Contacts keep their place. Emails already handed over still send.",
  })
  pause(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sequences.pause(workspace.workspaceId, id);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Archive a sequence",
    description: "Stops sending. Activate it again to bring it back.",
  })
  archive(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.sequences.archive(workspace.workspaceId, id);
  }

  @Get(":id/enrollments")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List the contacts enrolled in a sequence",
    description:
      "Most recently enrolled first. search matches the contact's email, name or company.",
  })
  listEnrollments(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.enrollments.list(workspace.workspaceId, id, {
      status: status || undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: numberOf(limit),
    });
  }

  @Post(":id/enrollments")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Enrol contacts in a sequence",
    description:
      "Send contactIds (up to 1000) to enrol them now, or an audience to enrol it in the background, which returns queued: true with zero counts. Contacts already enrolled and contacts on the suppression list are skipped. Unknown contact ids are ignored.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        contactIds: {
          type: "array",
          maxItems: 1000,
          items: { type: "string", format: "uuid" },
        },
        audience: {
          type: "object",
          description:
            'One of { type: "all" }, { type: "lists", listIds } or { type: "segment", segmentId }.',
        },
      },
    },
  })
  enroll(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.enrollments.enroll(
      workspace.workspaceId,
      id,
      input,
      workspace.method === "session" ? workspace.userId : null,
    );
  }

  @Get(":id/enrollments/:enrollmentId")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Get one enrolment with the emails it has been sent",
  })
  getEnrollment(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Param("enrollmentId") enrollmentId: string,
  ) {
    return this.enrollments.get(workspace.workspaceId, id, enrollmentId);
  }

  @Post(":id/enrollments/:enrollmentId/pause")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Pause one contact in a sequence" })
  pauseEnrollment(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Param("enrollmentId") enrollmentId: string,
  ) {
    return this.enrollments.pause(workspace.workspaceId, id, enrollmentId);
  }

  @Post(":id/enrollments/:enrollmentId/resume")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Resume one paused contact in a sequence" })
  resumeEnrollment(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Param("enrollmentId") enrollmentId: string,
  ) {
    return this.enrollments.resume(workspace.workspaceId, id, enrollmentId);
  }

  @Post(":id/enrollments/:enrollmentId/remove")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Remove one contact from a sequence",
    description:
      "The contact receives no further steps. The enrolment stays in the list as removed.",
  })
  removeEnrollment(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Param("enrollmentId") enrollmentId: string,
  ) {
    return this.enrollments.remove(workspace.workspaceId, id, enrollmentId);
  }
}
