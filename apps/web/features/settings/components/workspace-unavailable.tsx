"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import { LoadFailed } from "@/features/settings/components/workspace-parts";

export function WorkspaceUnavailable() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();

  return (
    <SettingsStack>
      <SettingsSection
        title="Workspace"
        description="Settings for the workspace you are working in."
      >
        <LoadFailed
          title="Could not load this workspace."
          pending={pending}
          onRetry={() => startRetry(() => router.refresh())}
        />
      </SettingsSection>
    </SettingsStack>
  );
}
