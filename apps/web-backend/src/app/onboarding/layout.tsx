import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireDashboardSession } from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({
  children: _children,
}: {
  children: ReactNode;
}) {
  await requireDashboardSession();
  redirect("/dashboard");
}
