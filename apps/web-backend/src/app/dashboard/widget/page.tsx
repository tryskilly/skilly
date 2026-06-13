import Image from "next/image";
import { Badge, Card, SectionHeader } from "../ui";

const states = [
  { label: "Idle", text: "Floating launcher waits bottom-right." },
  { label: "Connecting", text: "Token, skill, and Realtime session setup." },
  { label: "Listening", text: "Listening... ask me anything." },
  { label: "Error", text: "Permission, quota, or token issue." },
];

export default function WidgetPage() {
  return (
    <>
      <section className="mb-8">
        <Badge tone="amber">Widget</Badge>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.045em]">Shape the embedded companion experience.</h1>
        <p className="mt-3 max-w-3xl text-neutral-400">
          The web widget is a Shadow DOM surface with launcher, voice bubble, and cursor pointing. This page is the control surface for appearance and behavior.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionHeader title="Live preview" description="Amber replaces the prototype blue and uses the same cursor family as the macOS app." />
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#242426,#151516)] p-5">
            <div className="min-h-[360px] rounded-xl bg-[#f7f4ec] p-5 text-neutral-900">
              <div className="mb-5 flex items-center justify-between border-b border-[#e2ded4] pb-3">
                <strong>Acme App</strong>
                <span className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">Create project</span>
              </div>
              <div className="w-full max-w-md rounded-xl border border-[#e2ded4] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                <h3 className="text-lg font-bold">Project setup</h3>
                <p className="mt-2 text-sm text-neutral-600">Skilly can guide users through this flow and point at the next action.</p>
                <span className="mt-4 inline-block rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">Start setup</span>
              </div>
            </div>
            <div className="absolute bottom-[92px] right-6 w-80 rounded-2xl border border-white/15 bg-neutral-900 p-4 text-sm text-neutral-200 shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
              I can help your users set up their first project and show them where to click.
            </div>
            <div className="absolute bottom-6 right-6 grid h-14 w-14 place-items-center rounded-full bg-amber-500 text-neutral-950 shadow-[0_0_0_8px_rgba(245,158,11,0.14),0_16px_34px_rgba(0,0,0,0.28)]">
              <Image src="/brand/skilly-cursor.png" alt="" width={28} height={28} />
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Widget states" />
          <div className="grid gap-3">
            {states.map((state) => (
              <div key={state.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="font-bold text-neutral-200">{state.label}</h3>
                <p className="mt-1 text-sm text-neutral-500">{state.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

