import { redirect } from "next/navigation";
import { areaHref } from "@/lib/navigation";

export default function SettingsIndexPage() {
  redirect(areaHref("settings"));
}
