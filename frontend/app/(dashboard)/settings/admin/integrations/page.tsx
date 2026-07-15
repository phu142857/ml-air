import { redirect } from "next/navigation";

export default function SettingsAdminIntegrationsRedirectPage() {
  redirect("/identity/platform/integrations");
}
