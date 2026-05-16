import { redirect } from "next/navigation"

/** Legacy route — design tokens live under Settings */
export default function DesignTokensRedirectPage() {
  redirect("/settings?tab=design-tokens")
}
