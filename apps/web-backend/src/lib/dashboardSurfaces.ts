import type { DashboardSession } from "./dashboardAuth";

export function hasDashboardPeopleSurface(session: DashboardSession): boolean {
  if (process.env.SKILLY_DASHBOARD_ENABLE_PEOPLE_SURFACE === "true") {
    return true;
  }
  if (session.role === "super_admin") {
    return true;
  }
  const allowedEmails = (process.env.SKILLY_DASHBOARD_PEOPLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(session.email && allowedEmails.includes(session.email.toLowerCase()));
}
