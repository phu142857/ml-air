import { redirect } from "next/navigation";

type Props = { params: Promise<{ saId: string }> };

export default async function AdminServiceAccountDetailRedirectPage({ params }: Props) {
  const { saId } = await params;
  redirect(`/identity/service-accounts/${saId}`);
}
