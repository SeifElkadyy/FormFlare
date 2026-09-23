import { desc } from "drizzle-orm";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/guard";
import { apiKeys } from "@/lib/db/schema";
import { SETTING, getSetting } from "@/lib/db/settings";
import { getEnv, getServices } from "@/lib/env";
import { getInstanceUrl, rememberInstanceUrl } from "@/lib/instance/url";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { getUpdateStatus } from "@/lib/update/check";
import { PageBody, PageHeader } from "@/components/page-header";
import { ApiKeysPanel } from "../api-keys/manager";
import { AccountPanel, DangerZone, EmailSettingsForm, InstancePanel } from "./panels";

export const dynamic = "force-dynamic";

/** Everything that isn't about one form. */
export default async function SettingsPage() {
  const user = await requireUser();
  const { db } = await getServices();
  const env = await getEnv();
  const headerList = await headers();
  await rememberInstanceUrl(db, headerList.get("host"));

  const [notifyFrom, resendKey, instanceUrl, mail, update, keys] = await Promise.all([
    getSetting(db, SETTING.notifyFrom),
    getSetting(db, SETTING.resendApiKey),
    getInstanceUrl(db, headerList.get("host")),
    mailerStatus(db, env),
    getUpdateStatus(db),
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        lastUsedAt: apiKeys.lastUsedAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt)),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      <PageBody narrow>
        <EmailSettingsForm
          notifyFrom={notifyFrom ?? ""}
          provider={mail.provider}
          hasResendKey={Boolean(resendKey)}
          cloudflareBound={Boolean(env.EMAIL)}
          mailerAvailable={mail.available}
          instanceUrl={instanceUrl}
        />
        <AccountPanel email={user.email} />
        <ApiKeysPanel keys={keys} />
        <InstancePanel
          current={update.current}
          latest={update.latest}
          newer={update.newer}
          htmlUrl={update.htmlUrl}
          error={update.error}
          checkedAt={update.checkedAt}
        />
        <DangerZone email={user.email} />
      </PageBody>
    </>
  );
}
