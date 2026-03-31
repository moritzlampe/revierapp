import { redirect } from "next/navigation";

export default function Home() {
  // TODO: Check auth, redirect to login or last visited revier
  redirect("/revier/demo");
}
