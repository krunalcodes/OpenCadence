import { cookies } from "next/headers";
import {
  findSampleWorkspace,
  type SampleWorkspace,
  sampleWorkspaces,
} from "@/lib/sample-data";

export const ACTIVE_WORKSPACE_COOKIE = "oc_active_workspace";

export async function getActiveWorkspace(): Promise<SampleWorkspace> {
  const store = await cookies();
  const id = store.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const fallback = sampleWorkspaces[0];
  if (!fallback) {
    throw new Error("No sample workspaces are defined.");
  }
  return (id ? findSampleWorkspace(id) : null) ?? fallback;
}
