import { BUNDLED_SKILLS } from "../../src/bundledSkills";
import { GENERIC_SKILL_VALUE } from "../../src/skillMatcher";
import type { PopupToBackgroundMessage, SessionStatusReply, LoginReply } from "../../src/messages";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`popup is missing #${id}`);
  }
  return element as T;
}

function populateSkillOptions(select: HTMLSelectElement, selectedValue: string): void {
  select.innerHTML = "";

  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto-detect";
  select.appendChild(autoOption);

  for (const skill of BUNDLED_SKILLS) {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.name;
    select.appendChild(option);
  }

  const genericOption = document.createElement("option");
  genericOption.value = GENERIC_SKILL_VALUE;
  genericOption.textContent = "Generic (this page)";
  select.appendChild(genericOption);

  select.value = selectedValue;
}

async function render(): Promise<void> {
  const stored = await chrome.storage.local.get(["sessionToken", "email", "skillOverride"]);
  const signedOutSection = requireElement("signed-out");
  const signedInSection = requireElement("signed-in");

  if (!stored.sessionToken) {
    signedOutSection.hidden = false;
    signedInSection.hidden = true;
    return;
  }

  signedOutSection.hidden = true;
  signedInSection.hidden = false;
  requireElement("email").textContent = (stored.email as string) ?? "";

  populateSkillOptions(requireElement<HTMLSelectElement>("skill-override"), (stored.skillOverride as string) ?? "");

  const statusMessage: PopupToBackgroundMessage = { type: "get-session-status" };
  chrome.runtime.sendMessage(statusMessage, (response: SessionStatusReply | undefined) => {
    requireElement<HTMLButtonElement>("toggle-session").textContent = response?.active
      ? "Stop on this page"
      : "Start on this page";
  });
}

requireElement("sign-in").addEventListener("click", () => {
  const loginMessage: PopupToBackgroundMessage = { type: "login-start" };
  chrome.runtime.sendMessage(loginMessage, (_response: LoginReply | undefined) => {
    void render();
  });
});

requireElement("sign-out").addEventListener("click", () => {
  void chrome.storage.local.remove(["sessionToken", "email"]).then(render);
});

requireElement("toggle-session").addEventListener("click", () => {
  const toggleMessage: PopupToBackgroundMessage = { type: "toggle-session" };
  chrome.runtime.sendMessage(toggleMessage, (_response: SessionStatusReply | undefined) => {
    void render();
  });
});

requireElement("skill-override").addEventListener("change", (event) => {
  const value = (event.target as HTMLSelectElement).value;
  void chrome.storage.local.set({ skillOverride: value || null });
});

void render();
