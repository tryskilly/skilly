import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireDashboardSession } from "@/lib/dashboardAuth";
import { hasDashboardPeopleSurface } from "@/lib/dashboardSurfaces";

export default async function PeopleLayout({ children }: { children: ReactNode }) {
  const session = await requireDashboardSession();
  if (!hasDashboardPeopleSurface(session)) {
    redirect("/dashboard");
  }
  return children;
}
