import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Db } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async getById(workspaceId: string) {
    const workspace = await this.db.query.workspaces.findFirst({
      columns: { id: true, name: true, slug: true },
      where: (candidate, { eq }) => eq(candidate.id, workspaceId),
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found.");
    }

    return workspace;
  }
}
