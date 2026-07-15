import { redirect } from "next/navigation";

const TAB_REDIRECTS: Record<string, string> = {
  runtime: "/settings/preferences",
  api: "/settings/security",
  scope: "/settings/profile",
  governance: "/settings/admin/runtime",
  system: "/settings/admin/runtime",
  plugins: "/settings/admin/integrations",
  "design-tokens": "/settings/preferences",
};

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function SettingsIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab?.trim();
  if (tab && TAB_REDIRECTS[tab]) {
    redirect(TAB_REDIRECTS[tab]);
  }
  redirect("/settings/profile");
}
