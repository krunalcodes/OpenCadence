import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { AiSettingsScreen } from "@/features/settings/components/ai/ai-settings";
import { WorkspaceUnavailable } from "@/features/settings/components/workspace-unavailable";
import { aiCopy } from "@/features/settings/lib/ai-copy";
import { loadAiSettings } from "@/lib/ai-server";
import { getActiveWorkspace, requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: aiCopy.metaTitle,
};

export default async function AiSettingsPage() {
  await requireSession();
  const [workspace, settings] = await Promise.all([
    getActiveWorkspace(),
    loadAiSettings(),
  ]);

  return (
    <>
      <PageHeader title={aiCopy.title} description={aiCopy.description} />
      {workspace ? (
        <AiSettingsScreen
          key={workspace.id}
          settings={settings}
          workspaceName={workspace.name}
        />
      ) : (
        <WorkspaceUnavailable />
      )}
    </>
  );
}
