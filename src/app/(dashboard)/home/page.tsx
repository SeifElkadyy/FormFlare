import { redirect } from "next/navigation";

/** Home was folded into Forms. Kept so old bookmarks and links still land somewhere. */
export default function HomeRedirect() {
  redirect("/forms");
}
