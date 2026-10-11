import type { EmailEditorRef } from "@react-email/editor";
import { composeReactEmail } from "@react-email/editor/core";
import {
  getEmailTheming,
  setCurrentTheme,
  setGlobalCssInjected,
  setGlobalStyles,
} from "@react-email/editor/plugins";
import {
  type InlineNode,
  textToInlineNodes,
} from "@/features/templates/lib/document";

export type Editor = NonNullable<EmailEditorRef["editor"]>;

export type EditorRange = { from: number; to: number };

export type ExportedEmail = { html: string; text: string };

export async function exportEmail(
  editor: Editor,
  previewText: string,
): Promise<ExportedEmail> {
  const result = await composeReactEmail({
    editor,
    preview: previewText === "" ? undefined : previewText,
  });
  return { html: result.unformattedHtml, text: result.text };
}

export function selectionRange(editor: Editor): EditorRange {
  const { from, to } = editor.state.selection;
  return { from, to };
}

export function selectedText(editor: Editor, range: EditorRange) {
  return editor.state.doc.textBetween(range.from, range.to, "\n");
}

function clamp(editor: Editor, range: EditorRange): EditorRange {
  const size = editor.state.doc.content.size;
  const from = Math.max(0, Math.min(range.from, size));
  return { from, to: Math.max(from, Math.min(range.to, size)) };
}

export function insertInline(
  editor: Editor,
  range: EditorRange,
  nodes: InlineNode[],
) {
  if (nodes.length === 0) {
    return false;
  }
  return editor
    .chain()
    .focus()
    .insertContentAt(clamp(editor, range), nodes)
    .run();
}

export function insertText(editor: Editor, range: EditorRange, text: string) {
  return insertInline(editor, range, textToInlineNodes(text));
}

function containerRange(editor: Editor): EditorRange | null {
  const { doc } = editor.state;
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (node.type.name === "container") {
      return { from: offset + 1, to: offset + node.nodeSize - 1 };
    }
    offset += node.nodeSize;
  }
  return null;
}

const parseOptions = { preserveWhitespace: false } as const;

export function replaceBody(editor: Editor, html: string) {
  const range = containerRange(editor);
  if (range) {
    return editor
      .chain()
      .focus()
      .insertContentAt(range, html, { parseOptions })
      .run();
  }
  const theming = getEmailTheming(editor);
  const replaced = editor.commands.setContent(html, { parseOptions });
  setGlobalStyles(editor, theming.styles);
  setCurrentTheme(editor, theming.theme);
  if (theming.css) {
    setGlobalCssInjected(editor, theming.css);
  }
  return replaced;
}
