import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PasswordForm } from "@/features/settings/components/security/password-form";
import {
  type SessionRow,
  SessionsList,
} from "@/features/settings/components/security/sessions-list";
import { TwoFactor } from "@/features/settings/components/security/two-factor";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import {
  SettingsRowsSkeleton,
  SettingsSectionSkeleton,
} from "@/features/settings/components/settings-skeleton";
import {
  describeLoginMethod,
  formatDate,
  formatLastActive,
} from "@/features/settings/lib/format";
import {
  getAccounts,
  getSession,
  getSessions,
  requireSession,
  type SessionUser,
} from "@/lib/session";
import { describeDevice, parseUserAgent } from "@/lib/user-agent";

export const metadata: Metadata = {
  title: "Security · OpenCadence",
};

const lastLoginCookieNames = [
  "better-auth.last_used_login_method",
  "__Secure-better-auth.last_used_login_method",
];

async function hasPassword() {
  const accounts = await getAccounts();
  return accounts
    ? accounts.some((account) => account.providerId === "credential")
    : null;
}

function LoadError({ what }: { what: string }) {
  return (
    <p role="alert" className="p-5 text-muted-foreground">
      {`${what} could not be loaded. Reload the page to try again.`}
    </p>
  );
}

async function PasswordSection({ email }: { email: string }) {
  const password = await hasPassword();

  if (password === null) {
    return (
      <SettingsSection title="Password">
        <LoadError what="Your password settings" />
      </SettingsSection>
    );
  }

  return <PasswordForm hasPassword={password} email={email} />;
}

async function TwoFactorRows({ user }: { user: SessionUser }) {
  const password = await hasPassword();

  if (password === null) {
    return <LoadError what="Your two-factor settings" />;
  }

  return (
    <TwoFactor
      enabled={user.twoFactorEnabled === true}
      hasPassword={password}
      email={user.email}
    />
  );
}

async function SessionRows() {
  const [result, current] = await Promise.all([getSessions(), getSession()]);

  if (result.status === "stale") {
    return (
      <p className="p-5 text-muted-foreground leading-normal">
        For your security, the list of devices is only shown shortly after you
        sign in. Sign out and sign in again to see and manage your devices.
      </p>
    );
  }
  if (result.status === "unavailable") {
    return <LoadError what="Your devices" />;
  }

  const now = Date.now();
  const rows: SessionRow[] = result.sessions.map((session) => {
    const info = parseUserAgent(session.userAgent);
    return {
      id: session.id,
      token: session.token,
      device: describeDevice(info),
      kind: info.kind,
      ipAddress: session.ipAddress,
      lastActive: formatLastActive(session.updatedAt, now),
      signedIn: formatDate(session.createdAt),
      current: session.id === current?.session.id,
    };
  });
  rows.sort((a, b) => Number(b.current) - Number(a.current));

  return <SessionsList sessions={rows} />;
}

async function lastLoginMethod(user: SessionUser) {
  const store = await cookies();
  const fromCookie = lastLoginCookieNames
    .map((name) => store.get(name)?.value)
    .find(Boolean);
  return describeLoginMethod(user.lastLoginMethod ?? fromCookie);
}

export default async function SecuritySettingsPage() {
  const { user } = await requireSession();
  const method = await lastLoginMethod(user);

  return (
    <>
      <PageHeader
        title="Security"
        description="Your password, two-factor authentication, and the devices signed in to your account."
      />
      <SettingsStack>
        <Suspense fallback={<SettingsSectionSkeleton rows={2} />}>
          <PasswordSection email={user.email} />
        </Suspense>
        <SettingsSection
          title="Two-factor authentication"
          description="Ask for a code from your phone as well as your password, so a stolen password is not enough to sign in."
          flush
        >
          <Suspense
            fallback={
              <SettingsRowsSkeleton
                rows={1}
                label="Loading two-factor status"
              />
            }
          >
            <TwoFactorRows user={user} />
          </Suspense>
        </SettingsSection>
        <SettingsSection
          title="Devices"
          description={
            <>
              <p>
                Every browser and device signed in to your account. Sign out any
                you do not recognise, then change your password.
              </p>
              {method ? (
                <p className="mt-2 text-ink-tertiary text-xs">
                  {`Last signed in with ${method}.`}
                </p>
              ) : null}
            </>
          }
          flush
        >
          <Suspense
            fallback={
              <SettingsRowsSkeleton rows={3} label="Loading your devices" />
            }
          >
            <SessionRows />
          </Suspense>
        </SettingsSection>
      </SettingsStack>
    </>
  );
}
