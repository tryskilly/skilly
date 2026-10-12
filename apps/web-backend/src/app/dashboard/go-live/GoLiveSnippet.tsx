"use client";

import { useState } from "react";
import type { WidgetConfig } from "@/db/repo";
import { ButtonLink, CodeBlock } from "../v2";
import { buildFrameworkSnippets, INSTALL_FRAMEWORKS, type InstallFramework } from "./frameworkSnippets";
import { StepBadge } from "./StepBadge";

export function GoLiveSnippet({ skillId, widgetConfig, publishableKey }: {
  skillId: string;
  widgetConfig: Pick<WidgetConfig, "accentColor" | "locale" | "launcherLabel">;
  publishableKey: string;
}) {
  const [selectedFramework, setSelectedFramework] = useState<InstallFramework>("html");
  const frameworkSnippets = buildFrameworkSnippets({ publishableKey, skillId, widgetConfig });
  const framework = INSTALL_FRAMEWORKS.find((candidate) => candidate.id === selectedFramework);
  const developerInstructions = `${framework?.instruction ?? ""} The publishable key is already filled in. Reload the page on our allowed site.`;
  const developerEmailHref = `mailto:?subject=${encodeURIComponent("Add Skilly to our site")}&body=${encodeURIComponent(`${developerInstructions}\n\n${frameworkSnippets[selectedFramework]}`)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StepBadge step={2} />
          <h2 className="text-base font-bold text-fg">Add one line to your site</h2>
        </div>
        <a href={developerEmailHref} data-analytics-event="dashboard_go_live_email_developer_clicked"
          className="text-xs font-bold text-accent-text hover:underline">Email this to my developer</a>
      </div>
      <div role="tablist" aria-label="Install framework" className="flex gap-2">
        {INSTALL_FRAMEWORKS.map((framework) => (
          <button key={framework.id} type="button" role="tab" id={`install-tab-${framework.id}`}
            aria-controls="install-snippet" aria-selected={selectedFramework === framework.id}
            onClick={() => setSelectedFramework(framework.id)}
            className={`rounded-[8px] border px-3 py-2 text-xs font-bold transition ${selectedFramework === framework.id
              ? "border-accent-line bg-accent-soft text-accent-text"
              : "border-line-soft bg-surface text-fg-muted hover:bg-surface-strong"}`}>
            {framework.label}
          </button>
        ))}
      </div>
      <div id="install-snippet" role="tabpanel" aria-labelledby={`install-tab-${selectedFramework}`}>
        <CodeBlock language={selectedFramework === "html" ? "html" : "tsx"} label={framework?.label}
          highlight={["data-skilly-key", "data-skilly-skill", "data-skilly-accent", "data-skilly-locale"]}
          code={frameworkSnippets[selectedFramework]} />
      </div>
      <p className="text-xs leading-5 text-fg-muted">{framework?.instruction}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-fg-muted">
          Your publishable key is filled in. It&apos;s safe in the browser; Skilly only runs on the sites above.
        </p>
        <ButtonLink href="/dashboard/keys" variant="ghost">Manage keys</ButtonLink>
      </div>
    </div>
  );
}
