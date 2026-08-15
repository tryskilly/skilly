import { describe, expect, test } from "bun:test";
import {
  WidgetSessionStore,
  parseGuidanceProgress,
  type SessionStorageAdapter,
} from "../src/sessionState";

class MemoryStorage implements SessionStorageAdapter {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("widget session history", () => {
  test("persists text-only conversation and progress for the current tab", () => {
    const storage = new MemoryStorage();
    const firstStore = new WidgetSessionStore(storage, "pk_live_test", "onboarding");

    firstStore.appendMessage("user", "Where do I invite my team?", 100);
    firstStore.upsertAssistantMessage("answer-1", "Open Settings, then Team.", 101);
    firstStore.setGuidanceProgress({
      title: "Invite your team",
      steps: ["Open Settings", "Choose Team", "Send invitations"],
      currentStep: 2,
      status: "in_progress",
    });

    const restoredStore = new WidgetSessionStore(storage, "pk_live_test", "onboarding");
    expect(restoredStore.snapshot()).toEqual({
      messages: [
        { id: "100-1", role: "user", text: "Where do I invite my team?", createdAt: 100 },
        { id: "answer-1", role: "assistant", text: "Open Settings, then Team.", createdAt: 101 },
      ],
      guidance: {
        title: "Invite your team",
        steps: ["Open Settings", "Choose Team", "Send invitations"],
        currentStep: 2,
        status: "in_progress",
      },
    });
  });

  test("updates a streaming assistant message instead of duplicating it", () => {
    const store = new WidgetSessionStore(new MemoryStorage(), "pk_live_test");

    store.upsertAssistantMessage("answer-1", "Open", 100);
    store.upsertAssistantMessage("answer-1", "Open Settings", 100);

    expect(store.snapshot().messages).toHaveLength(1);
    expect(store.snapshot().messages[0]?.text).toBe("Open Settings");
  });

  test("clear removes both transcript and guided-task progress", () => {
    const storage = new MemoryStorage();
    const store = new WidgetSessionStore(storage, "pk_live_test");
    store.appendMessage("user", "Help", 100);
    store.setGuidanceProgress({
      title: "Setup",
      steps: ["First", "Second"],
      currentStep: 1,
      status: "in_progress",
    });

    store.clear();

    expect(store.snapshot()).toEqual({ messages: [], guidance: null });
  });
});

describe("guided-task progress validation", () => {
  test("accepts a complete explicit plan", () => {
    expect(
      parseGuidanceProgress({
        title: "Publish your first project",
        steps: ["Create a project", "Add content", "Publish"],
        current_step: 2,
        status: "in_progress",
      }),
    ).toEqual({
      title: "Publish your first project",
      steps: ["Create a project", "Add content", "Publish"],
      currentStep: 2,
      status: "in_progress",
    });
  });

  test("rejects fake or incomplete progress", () => {
    expect(parseGuidanceProgress({ steps: ["Only one"], current_step: 1, status: "in_progress" })).toBeNull();
    expect(
      parseGuidanceProgress({ steps: ["First", "Second"], current_step: 3, status: "in_progress" }),
    ).toBeNull();
    expect(parseGuidanceProgress({ steps: ["First", "Second"], current_step: 1 })).toBeNull();
  });
});
