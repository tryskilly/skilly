import { Panel, PanelBody, StatusPill } from "./v2";

export function ProjectContextPanel({
  skillId,
  surfaces,
}: {
  skillId: string;
  surfaces?: string[];
}) {
  return (
    <Panel>
      <PanelBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-gray-100">Active project setup</div>
            <div className="mt-1 font-mono text-xs text-muted">{skillId}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(surfaces?.length ? surfaces : ["Skill", "Style", "Allow", "Install", "Test"]).map((surface) => (
              <StatusPill key={surface} tone="neutral" label={surface} />
            ))}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
