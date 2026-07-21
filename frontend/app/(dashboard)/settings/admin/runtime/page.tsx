import { redirect } from "next/navigation";

export default function SettingsAdminRuntimeRedirectPage() {
  redirect("/identity/platform/runtime");
}
