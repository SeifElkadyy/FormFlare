import { redirect } from "next/navigation";

/**
 * An instance's root is the deployer's URL, not a FormFlare ad. Send visitors to
 * /login, which forwards to /setup before an owner exists and to /home when signed in.
 */
export default function Root() {
  redirect("/login");
}
