import { redirect } from "next/navigation";

/** Webhooks now live on each form's Settings tab. */
export default function WebhooksRedirect() {
  redirect("/forms");
}
