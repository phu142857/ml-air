import { redirect } from "next/navigation";

type Props = { params: Promise<{ clusterId: string }> };

export default async function ClusterDetailRedirectPage({ params }: Props) {
  const { clusterId } = await params;
  redirect(`/infra?cluster=${encodeURIComponent(clusterId)}`);
}
