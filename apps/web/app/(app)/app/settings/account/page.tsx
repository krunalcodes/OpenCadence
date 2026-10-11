import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConnectedAccounts } from "@/features/settings/components/account/connected-accounts";
import { EmailForm } from "@/features/settings/components/account/email-form";
import { ProfileForm } from "@/features/settings/components/account/profile-form";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import { SettingsRowsSkeleton } from "@/features/settings/components/settings-skeleton";
import { formatDate } from "@/features/settings/lib/format";
import { getAccounts, requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Account · OpenCadence",
};

async function ConnectedAccountsRows() {
  const accounts = await getAccounts();

  if (!accounts) {
    return (
      <p role="alert" className="p-5 text-muted-foreground">
        Your connected accounts could not be loaded. Reload the page to try
        again.
      </p>
    );
  }

  const google = accounts.find((account) => account.providerId === "google");
  const hasPassword = accounts.some(
    (account) => account.providerId === "credential",
  );

  return (
    <ConnectedAccounts
      google={
        google
          ? {
              id: google.id,
              connectedOn: formatDate(google.createdAt),
            }
          : null
      }
      hasPassword={hasPassword}
      canDisconnect={hasPassword || accounts.length > 1}
    />
  );
}

export default async function AccountSettingsPage() {
  const { user } = await requireSession();

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile, your email address, and the ways you sign in."
      />
      <SettingsStack>
        <ProfileForm name={user.name} email={user.email} />
        <EmailForm email={user.email} verified={user.emailVerified} />
        <SettingsSection
          title="Connected accounts"
          description="The ways you can sign in to OpenCadence. Keep at least one."
          flush
        >
          <Suspense
            fallback={
              <SettingsRowsSkeleton
                rows={2}
                label="Loading connected accounts"
              />
            }
          >
            <ConnectedAccountsRows />
          </Suspense>
        </SettingsSection>
      </SettingsStack>
    </>
  );
}
