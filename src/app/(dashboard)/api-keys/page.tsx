import { redirect } from "next/navigation";

/** API keys moved into Settings. */
export default function ApiKeysRedirect() {
  redirect("/settings#api");
}
