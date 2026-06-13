import { getRepo } from "@/db";
import { getCurrentTenantId } from "@/lib/session";
import { KeyManager } from "../KeyManager";
import { Badge } from "../ui";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const keys = await getRepo().listApiKeys(getCurrentTenantId());

  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">API keys</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Control access to Skilly runtimes.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          Publishable keys identify web and mobile clients. Secret keys are reserved for trusted server-side integrations.
        </p>
      </section>
      <KeyManager keys={keys} />
    </>
  );
}

