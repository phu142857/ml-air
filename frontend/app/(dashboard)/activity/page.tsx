import { redirect } from "next/navigation"

/** Activity was merged into Lifecycle — keep bookmarks working. */
export default function ActivityRedirectPage() {
  redirect("/lifecycle")
}
