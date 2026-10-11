import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { ApiKeysSettings } from "@/features/settings/components/api-keys/api-keys-settings";
import { WorkspaceUnavailable } from "@/features/settings/components/workspace-unavailable";
import {
  getActiveWorkspace,
  getWorkspaceApiKeys,
  getWorkspaceRole,
  requireSession,
} from "@/lib/session";

export const metadata: Metadata = {
  title: "API keys · OpenCadence",
};

export default async function ApiKeysSettingsPage() {
  await requireSession();
  const workspace = await getActiveWorkspace();
  const role = workspace ? await getWorkspaceRole(workspace.id) : null;
  const result =
    workspace && (role === "owner" || role === "admin")
      ? await getWorkspaceApiKeys(workspace.id)
      : null;

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys that let other systems call the API as this workspace."
      />
      {workspace && role ? (
        <ApiKeysSettings workspace={workspace} role={role} result={result} />
      ) : (
        <WorkspaceUnavailable />
      )}
    </>
  );
}
