import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/guard";
import { SETTING, getSetting } from "@/lib/db/settings";
import { getEnv, getServices } from "@/lib/env";
import { getInstanceUrl, rememberInstanceUrl } from "@/lib/instance/url";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { getUpdateStatus } from "@/lib/update/check";
import { PageHeader } from "@/components/page-header";
import { AccountPanel, DangerZone, EmailSettingsForm, InstancePanel } from "./panels";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const { db } = await getServices();
  const env = await getEnv();
  const headerList = await headers();
  await rememberInstanceUrl(db, headerList.get("host"));

  const [notifyFrom, resendKey, instanceUrl, mail, update] = await Promise.all([
    getSetting(db, SETTING.notifyFrom),
    getSetting(db, SETTING.resendApiKey),
    getInstanceUrl(db, headerList.get("host")),
    mailerStatus(db, env),
    getUpdateStatus(db),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Settings"
        description="Inbox works without email. Sending alerts is optional."
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
        <EmailSettingsForm
          notifyFrom={notifyFrom ?? ""}
          provider={mail.provider}
          hasResendKey={Boolean(resendKey)}
          cloudflareBound={Boolean(env.EMAIL)}
          mailerAvailable={mail.available}
          instanceUrl={instanceUrl}
        />

        <AccountPanel email={user.email} />

        <InstancePanel
          current={update.current}
          latest={update.latest}
          newer={update.newer}
          htmlUrl={update.htmlUrl}
          error={update.error}
          checkedAt={update.checkedAt}
        />

        <DangerZone email={user.email} />
      </div>
    </div>
  );
}
