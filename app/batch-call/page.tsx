import { redirect } from "next/navigation";

export default function BatchCallPage() {
  redirect("/batch/?tool=call");
}
