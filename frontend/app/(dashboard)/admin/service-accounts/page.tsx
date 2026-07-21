import { redirect } from "next/navigation";

export default function AdminServiceAccountsRedirectPage() {
  redirect("/identity/service-accounts");
}
