import { redirect } from "next/navigation";

type Props = { params: Promise<{ userId: string }> };

export default async function AdminUserDetailRedirectPage({ params }: Props) {
  const { userId } = await params;
  redirect(`/identity/users/${userId}`);
}
