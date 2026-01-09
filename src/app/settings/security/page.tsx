import { redirect } from "next/navigation";

export default function LegacySecurityRedirect() {
  redirect("/app/settings/security");
}
