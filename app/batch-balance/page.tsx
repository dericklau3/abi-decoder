import { redirect } from "next/navigation";

export default function BatchBalancePage() {
  redirect("/batch/?tool=balance");
}
