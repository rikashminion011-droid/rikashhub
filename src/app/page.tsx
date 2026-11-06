import { redirect } from "next/navigation";

// The proxy sends signed-out visitors to /login before they get here.
export default function Home() {
  redirect("/dashboard");
}
