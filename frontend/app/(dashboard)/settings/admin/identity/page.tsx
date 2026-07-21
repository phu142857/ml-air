import { redirect } from "next/navigation";

export default function SettingsAdminIdentityRedirectPage() {
  redirect("/identity/settings");
}
