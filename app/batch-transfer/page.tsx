import { redirect } from "next/navigation";

export default function BatchTransferPage() {
  redirect("/batch/?tool=transfer");
}
