import { redirect } from "next/navigation";
import { appHref } from "@/lib/navigation";

export default function AppIndexPage() {
  redirect(appHref("dashboard"));
}
