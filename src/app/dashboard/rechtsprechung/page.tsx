import { redirect } from "next/navigation";

// Kanonische Fläche ist der Recherche-Hub; alte Bookmarks bleiben gültig.
export default function RechtsprechungRedirect() {
  redirect("/dashboard/research?tab=rechtsprechung");
}
