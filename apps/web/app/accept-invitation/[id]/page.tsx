import type { Metadata } from "next";
import AuthLayout from "@/app/(auth)/layout";
import { InvitationSignedOut } from "@/features/auth/components/invitation-signed-out";
import { InvitationView } from "@/features/auth/components/invitation-view";
import { getSession, lookUpInvitation } from "@/lib/session";

export const metadata: Metadata = {
  title: "Workspace invitation · OpenCadence",
  referrer: "no-referrer",
  robots: { index: false },
};

const invitationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AcceptInvitationPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AcceptInvitationPage({
  params,
}: AcceptInvitationPageProps) {
  const { id } = await params;
  const session = await getSession();
  const wellFormed = invitationIdPattern.test(id);

  if (!session && wellFormed) {
    return (
      <AuthLayout>
        <InvitationSignedOut invitationId={id} />
      </AuthLayout>
    );
  }

  const email = session?.user.email ?? "";
  const lookup = wellFormed
    ? await lookUpInvitation(id, email)
    : ({ state: "not-found" } as const);

  return (
    <AuthLayout>
      <InvitationView
        key={`${session?.user.id ?? "guest"}:${lookup.state}`}
        invitationId={id}
        email={email}
        lookup={lookup}
      />
    </AuthLayout>
  );
}
