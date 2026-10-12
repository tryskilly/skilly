import type { WidgetConfig } from "@/db/repo";

type InstallSnippetInput = {
  publishableKey: string;
  skillId: string;
  widgetConfig?: Pick<WidgetConfig, "accentColor" | "locale" | "launcherLabel">;
};

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildInstallSnippet({ publishableKey, skillId, widgetConfig }: InstallSnippetInput): string {
  const appearanceAttributes = widgetConfig
    ? `\n        data-skilly-accent="${escapeAttribute(widgetConfig.accentColor)}"\n        data-skilly-locale="${escapeAttribute(widgetConfig.locale)}"`
    : "";
  const launcherAttribute = widgetConfig?.launcherLabel
    ? `\n        data-skilly-launcher="${escapeAttribute(widgetConfig.launcherLabel)}"`
    : "";

  return `<script src="https://cdn.tryskilly.app/web/v1.js"
        data-skilly-key="${escapeAttribute(publishableKey)}"
        data-skilly-skill="${escapeAttribute(skillId)}"${appearanceAttributes}${launcherAttribute}
        defer></script>`;
}
