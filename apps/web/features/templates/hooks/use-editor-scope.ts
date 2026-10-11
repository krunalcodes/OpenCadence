import { useCallback } from "react";
import type { Editor } from "@/features/templates/lib/editor";

export function useEditorScope(editor: Editor | null) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!editor || !element) {
        return;
      }
      const scopes = editor.storage.focusScope;
      scopes.registerScope(element);
      return () => {
        scopes.unregisterScope(element);
      };
    },
    [editor],
  );
}
