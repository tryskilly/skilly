import { PageHeader, Panel, PanelBody, PanelHeader, StatusPill } from "../v2";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust"
        eyebrowTone="neutral"
        title="Privacy and data handling."
        description="The practical privacy posture for Studio, web widgets, and customer project configuration."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="What Studio stores" action={<StatusPill label="Workspace data" />} />
          <PanelBody>
            <ul className="space-y-3 text-sm leading-relaxed text-gray-300">
              <li>Project SKILL.md content, allowed origins, native app IDs, widget appearance, keys, usage events, and team memberships.</li>
              <li>Usage events record operational metadata such as domain, page, duration, and result status.</li>
              <li>Secret API keys are hashed for lookup and are only revealed once at creation time.</li>
            </ul>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="What clients receive" action={<StatusPill tone="green" label="Scoped" showDot />} />
          <PanelBody>
            <ul className="space-y-3 text-sm leading-relaxed text-gray-300">
              <li>Widgets receive short-lived Realtime credentials from the backend after key and origin checks pass.</li>
              <li>OpenAI provider secrets stay server-side and are never exposed to browser or native SDK clients.</li>
              <li>Each project receives only the skill content and widget configuration assigned to that project.</li>
            </ul>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
