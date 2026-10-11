import type { Metadata } from "next";
import { TemplateEditorScreen } from "@/features/templates/components/template-editor-screen";
import { TemplateUnavailable } from "@/features/templates/components/template-unavailable";
import {
  getMergeFields,
  getSourceOptions,
  getTemplate,
} from "@/features/templates/queries/templates";
import { loadAiSettings } from "@/lib/ai-server";
import { loadBrand } from "@/lib/brand-server";
import { getActiveWorkspace, getSession } from "@/lib/session";

type TemplateEditorPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getActiveWorkspace();
  return {
    title: workspace ? `Templates · ${workspace.name}` : "Templates",
  };
}

export default async function TemplateEditorPage({
  params,
}: TemplateEditorPageProps) {
  const { id } = await params;
  const [result, brand, ai, sources, fields, workspace, session] =
    await Promise.all([
      getTemplate(id),
      loadBrand(),
      loadAiSettings(),
      getSourceOptions(),
      getMergeFields(),
      getActiveWorkspace(),
      getSession(),
    ]);

  if (result.state !== "ready") {
    return <TemplateUnavailable />;
  }

  return (
    <TemplateEditorScreen
      template={result.template}
      brand={brand}
      workspaceName={workspace?.name ?? ""}
      userEmail={session?.user.email ?? ""}
      aiConfigured={ai?.configured === true}
      sources={sources}
      fields={fields}
    />
  );
}
