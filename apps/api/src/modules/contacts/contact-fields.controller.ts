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
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { ContactsService } from "./contacts.service";

const optionsSchema = {
  type: "array",
  minItems: 1,
  maxItems: 50,
  items: { type: "string", maxLength: 100 },
};

@ApiTags("contact fields")
@Controller("contact-fields")
export class ContactFieldsController {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List custom fields",
    description: "The custom fields of the workspace, in display order.",
  })
  async list(@CurrentWorkspace() workspace: WorkspaceAuthContext) {
    return { fields: await this.contacts.listFields(workspace.workspaceId) };
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a custom field",
    description:
      "Adds a custom field. A workspace can have up to 100. When no key is sent it is made from the label.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["label", "type"],
      properties: {
        label: { type: "string", maxLength: 80 },
        type: {
          type: "string",
          enum: ["text", "number", "date", "boolean", "select"],
        },
        options: optionsSchema,
        key: { type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$" },
      },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.contacts.createField(workspace.workspaceId, input);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a custom field",
    description:
      "Changes the label, the options of a select field, or the position. The type and key cannot change.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        label: { type: "string", maxLength: 80 },
        options: optionsSchema,
        position: { type: "integer", minimum: 0, maximum: 10000 },
      },
    },
  })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.contacts.updateField(workspace.workspaceId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a custom field",
    description:
      "Removes the field from the workspace. Values already stored on contacts are left in place and no longer shown.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.contacts.removeField(workspace.workspaceId, id);
  }
}
