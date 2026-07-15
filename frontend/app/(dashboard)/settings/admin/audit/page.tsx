import { redirect } from "next/navigation";

export default function SettingsAdminAuditRedirectPage() {
  redirect("/identity/platform/config-audit");
}
