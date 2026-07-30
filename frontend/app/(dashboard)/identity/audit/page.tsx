import { redirect } from "next/navigation";

export default function IdentityAuditRedirectPage() {
  redirect("/identity/dashboard");
}
