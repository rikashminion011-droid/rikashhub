import { redirect } from "next/navigation";

/** People are managed in Customized Settings now, so there is one place for them. This keeps old links working. */
export default function PersonsPage() {
  redirect("/quick-pay/settings?tab=split");
}
