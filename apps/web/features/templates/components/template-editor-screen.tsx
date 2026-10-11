"use client";

import dynamic from "next/dynamic";
import { EditorSkeleton } from "@/features/templates/components/editor-skeleton";
import type { TemplateEditorProps } from "@/features/templates/components/template-editor";

const TemplateEditor = dynamic(
  () =>
    import("@/features/templates/components/template-editor").then(
      (module) => module.TemplateEditor,
    ),
  { ssr: false, loading: () => <EditorSkeleton /> },
);

export function TemplateEditorScreen(props: TemplateEditorProps) {
  return <TemplateEditor key={props.template.id} {...props} />;
}
