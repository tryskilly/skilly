export type ConversationRole = "user" | "assistant";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  text: string;
  createdAt: number;
}

export interface GuidanceProgress {
  title: string;
  steps: string[];
  /** One-based current step, matching the visitor-facing label. */
  currentStep: number;
  status: "in_progress" | "completed";
}

export interface WidgetSessionSnapshot {
  messages: ConversationMessage[];
  guidance: GuidanceProgress | null;
}

export interface SessionStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_VERSION = 1;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARACTERS = 2_000;
const MAX_TOTAL_CHARACTERS = 20_000;
const MAX_GUIDANCE_STEPS = 6;
const MAX_GUIDANCE_LABEL_CHARACTERS = 80;

interface PersistedWidgetSession extends WidgetSessionSnapshot {
  version: typeof STORAGE_VERSION;
}

function cleanText(value: unknown, maximumCharacters: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumCharacters) : "";
}

function sanitizeMessage(value: unknown): ConversationMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ConversationMessage>;
  const role = candidate.role === "user" || candidate.role === "assistant" ? candidate.role : null;
  const id = cleanText(candidate.id, 120);
  const text = cleanText(candidate.text, MAX_MESSAGE_CHARACTERS);
  const createdAt = typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
    ? candidate.createdAt
    : null;
  if (!role || !id || !text || createdAt === null) {
    return null;
  }
  return { id, role, text, createdAt };
}

function trimMessagesToLimits(messages: ConversationMessage[]): ConversationMessage[] {
  const boundedMessages = messages.slice(-MAX_MESSAGES);
  let retainedCharacters = 0;
  const retainedMessages: ConversationMessage[] = [];
  for (let index = boundedMessages.length - 1; index >= 0; index -= 1) {
    const message = boundedMessages[index];
    if (!message || retainedCharacters + message.text.length > MAX_TOTAL_CHARACTERS) {
      continue;
    }
    retainedMessages.unshift(message);
    retainedCharacters += message.text.length;
  }
  return retainedMessages;
}

/** Validate the model's explicit progress-tool payload before it reaches visitor UI. */
export function parseGuidanceProgress(value: unknown): GuidanceProgress | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as {
    title?: unknown;
    steps?: unknown;
    current_step?: unknown;
    currentStep?: unknown;
    status?: unknown;
  };
  if (!Array.isArray(candidate.steps)) {
    return null;
  }
  const steps = candidate.steps
    .map((step) => cleanText(step, MAX_GUIDANCE_LABEL_CHARACTERS))
    .filter(Boolean);
  if (steps.length < 2 || steps.length > MAX_GUIDANCE_STEPS || steps.length !== candidate.steps.length) {
    return null;
  }
  const currentStepValue = candidate.current_step ?? candidate.currentStep;
  if (!Number.isInteger(currentStepValue) || Number(currentStepValue) < 1 || Number(currentStepValue) > steps.length) {
    return null;
  }
  if (candidate.status !== "in_progress" && candidate.status !== "completed") {
    return null;
  }
  return {
    title: cleanText(candidate.title, MAX_GUIDANCE_LABEL_CHARACTERS) || "Guided task",
    steps,
    currentStep: Number(currentStepValue),
    status: candidate.status,
  };
}

function storageKey(publishableKey: string, skillId?: string): string {
  return `skilly:web:session:v${STORAGE_VERSION}:${publishableKey}:${skillId?.trim() || "default"}`;
}

/**
 * Text-only, current-tab session state. The adapter is sessionStorage in the
 * browser and may be null when storage is blocked; the in-memory copy remains usable.
 */
export class WidgetSessionStore {
  private messages: ConversationMessage[] = [];
  private guidance: GuidanceProgress | null = null;
  private messageCounter = 0;
  private readonly key: string;

  constructor(
    private readonly storage: SessionStorageAdapter | null,
    publishableKey: string,
    skillId?: string,
  ) {
    this.key = storageKey(publishableKey, skillId);
    this.restore();
  }

  snapshot(): WidgetSessionSnapshot {
    return {
      messages: this.messages.map((message) => ({ ...message })),
      guidance: this.guidance ? { ...this.guidance, steps: [...this.guidance.steps] } : null,
    };
  }

  appendMessage(role: ConversationRole, text: string, createdAt = Date.now()): void {
    const cleanedText = cleanText(text, MAX_MESSAGE_CHARACTERS);
    if (!cleanedText) {
      return;
    }
    this.messageCounter += 1;
    this.messages.push({
      id: `${createdAt}-${this.messageCounter}`,
      role,
      text: cleanedText,
      createdAt,
    });
    this.messages = trimMessagesToLimits(this.messages);
    this.persist();
  }

  upsertAssistantMessage(id: string, text: string, createdAt = Date.now()): void {
    const cleanedId = cleanText(id, 120);
    const cleanedText = cleanText(text, MAX_MESSAGE_CHARACTERS);
    if (!cleanedId || !cleanedText) {
      return;
    }
    const existingMessage = this.messages.find((message) => message.id === cleanedId);
    if (existingMessage) {
      existingMessage.text = cleanedText;
    } else {
      this.messages.push({ id: cleanedId, role: "assistant", text: cleanedText, createdAt });
    }
    this.messages = trimMessagesToLimits(this.messages);
    this.persist();
  }

  setGuidanceProgress(guidance: GuidanceProgress): void {
    const validatedGuidance = parseGuidanceProgress(guidance);
    if (!validatedGuidance) {
      return;
    }
    this.guidance = validatedGuidance;
    this.persist();
  }

  clear(): void {
    this.messages = [];
    this.guidance = null;
    this.messageCounter = 0;
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // Storage can be disabled by browser privacy settings; in-memory clear still succeeds.
    }
  }

  private restore(): void {
    let rawValue: string | null = null;
    try {
      rawValue = this.storage?.getItem(this.key) ?? null;
    } catch {
      return;
    }
    if (!rawValue) {
      return;
    }
    try {
      const parsedValue = JSON.parse(rawValue) as Partial<PersistedWidgetSession>;
      if (parsedValue.version !== STORAGE_VERSION || !Array.isArray(parsedValue.messages)) {
        return;
      }
      this.messages = trimMessagesToLimits(
        parsedValue.messages.map(sanitizeMessage).filter((message): message is ConversationMessage => message !== null),
      );
      this.guidance = parseGuidanceProgress(parsedValue.guidance);
      this.messageCounter = this.messages.length;
    } catch {
      // Ignore corrupt or externally modified storage and start a clean in-memory session.
    }
  }

  private persist(): void {
    const payload: PersistedWidgetSession = {
      version: STORAGE_VERSION,
      messages: this.messages,
      guidance: this.guidance,
    };
    try {
      this.storage?.setItem(this.key, JSON.stringify(payload));
    } catch {
      // History remains available in memory when sessionStorage is unavailable or full.
    }
  }
}
