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
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  CurrentWorkspace,
  WorkspaceAuth,
} from "../../common/decorators/workspace-auth.decorator";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import { ContactsService } from "./contacts.service";

const nullableText = { type: "string", nullable: true };

const contactProperties = {
  email: { type: "string", format: "email" },
  firstName: nullableText,
  lastName: nullableText,
  company: nullableText,
  jobTitle: nullableText,
  phone: nullableText,
  city: nullableText,
  country: nullableText,
  timezone: { ...nullableText, example: "Europe/Paris" },
  fields: {
    type: "object",
    additionalProperties: true,
    description:
      "Custom values keyed by the custom field key. Values are converted to the type of the field. A null value removes the stored value.",
  },
};

const idList = {
  type: "array",
  maxItems: 50,
  items: { type: "string", format: "uuid" },
};

const filterSchema = {
  type: "object",
  description:
    "A group of conditions. A group can hold groups one level deep, and a filter can hold up to 30 conditions.",
  required: ["match", "conditions"],
  properties: {
    match: { type: "string", enum: ["all", "any"] },
    conditions: { type: "array", items: { type: "object" } },
  },
};

const scopeProperties = {
  search: {
    type: "string",
    description:
      "Matches text anywhere in the email address, first name, last name or company, ignoring case. One or two characters match the start of the email address.",
  },
  filter: filterSchema,
  listId: { type: "string", format: "uuid" },
  tagId: { type: "string", format: "uuid" },
};

@ApiTags("contacts")
@Controller("contacts")
export class ContactsController {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
  ) {}

  @Get()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "List contacts",
    description:
      "Contacts in the workspace, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: scopeProperties.search.description,
  })
  @ApiQuery({ name: "listId", required: false })
  @ApiQuery({ name: "tagId", required: false })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  })
  list(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Query("search") search?: string,
    @Query("listId") listId?: string,
    @Query("tagId") tagId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.contacts.list(workspace.workspaceId, {
      search: search || undefined,
      listId: listId || undefined,
      tagId: tagId || undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Post("search")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Search and filter contacts",
    description:
      "Lists the contacts that match a search, a filter, a list and a tag, newest first. Pass nextCursor back as cursor to read the next page.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        ...scopeProperties,
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
    },
  })
  search(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.contacts.search(workspace.workspaceId, input);
  }

  @Post("count")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Count contacts",
    description:
      "Counts the contacts that match a search, a filter, a list and a tag.",
  })
  @ApiBody({ schema: { type: "object", properties: scopeProperties } })
  count(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.contacts.countMatching(workspace.workspaceId, input);
  }

  @Post("bulk")
  @HttpCode(200)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Change many contacts at once",
    description:
      "Applies one action to up to 1000 contacts. Ids that are not contacts in the workspace are ignored and not counted.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["ids", "action"],
      properties: {
        ids: {
          type: "array",
          minItems: 1,
          maxItems: 1000,
          items: { type: "string", format: "uuid" },
        },
        action: {
          type: "string",
          enum: [
            "delete",
            "add_tags",
            "remove_tags",
            "add_to_lists",
            "remove_from_lists",
          ],
        },
        tagIds: idList,
        listIds: idList,
      },
    },
  })
  bulk(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.contacts.bulk(workspace.workspaceId, input);
  }

  @Post()
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Create a contact",
    description:
      "Adds one contact. The email address is stored in lower case and is unique in the workspace.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email"],
      properties: { ...contactProperties, listIds: idList, tagIds: idList },
    },
  })
  create(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Body() input: unknown,
  ) {
    return this.contacts.create(
      workspace.workspaceId,
      workspace.method === "apiKey" ? "api" : "manual",
      input,
    );
  }

  @Get(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({ summary: "Get a contact" })
  get(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    return this.contacts.get(workspace.workspaceId, id);
  }

  @Patch(":id")
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Update a contact",
    description:
      "Changes the properties that are sent. Custom values are merged into the stored ones, and a null value removes that custom value.",
  })
  @ApiBody({ schema: { type: "object", properties: contactProperties } })
  update(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    return this.contacts.update(workspace.workspaceId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  @WorkspaceAuth("session", "apiKey")
  @ApiOperation({
    summary: "Delete a contact",
    description:
      "Removes the contact with its list memberships and tags. The suppression list is not changed, so a suppressed address stays suppressed.",
  })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceAuthContext,
    @Param("id") id: string,
  ) {
    await this.contacts.remove(workspace.workspaceId, id);
  }
}
