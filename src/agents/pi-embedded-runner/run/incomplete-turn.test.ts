import { describe, expect, it } from "vitest";
import { resolveIncompleteTurnPayloadText } from "./incomplete-turn.js";
import type { EmbeddedRunAttemptResult } from "./types.js";

type AttemptStub = Pick<
  EmbeddedRunAttemptResult,
  | "clientToolCall"
  | "yieldDetected"
  | "didSendDeterministicApprovalPrompt"
  | "lastToolError"
  | "lastAssistant"
  | "replayMetadata"
  | "didSendViaMessagingTool"
>;

function makeAttempt(overrides: Partial<AttemptStub> = {}): AttemptStub {
  return {
    clientToolCall: undefined,
    yieldDetected: undefined,
    didSendDeterministicApprovalPrompt: undefined,
    lastToolError: undefined,
    lastAssistant: undefined,
    replayMetadata: { hadPotentialSideEffects: false, replaySafe: true },
    didSendViaMessagingTool: false,
    ...overrides,
  };
}

function makeLastAssistant(stopReason: string) {
  return {
    role: "assistant" as const,
    content: [],
    api: "anthropic-messages" as const,
    provider: "custom-api",
    model: "deepseek-chat",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    stopReason,
    timestamp: Date.now(),
  };
}

describe("resolveIncompleteTurnPayloadText", () => {
  it("returns null when payloads were produced", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 1,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("stop"),
      }),
    });
    expect(result).toBeNull();
  });

  it("returns null when run was aborted", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: true,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("stop"),
      }),
    });
    expect(result).toBeNull();
  });

  it("returns null when run was timed out", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: true,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("stop"),
      }),
    });
    expect(result).toBeNull();
  });

  it("returns null when message was already sent via messaging tool", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("stop"),
        didSendViaMessagingTool: true,
      }),
    });
    expect(result).toBeNull();
  });

  it("returns null when silentExpected is true and model returned empty stop", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      silentExpected: true,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("stop"),
      }),
    });
    expect(result).toBeNull();
  });

  it("returns null when there is no lastAssistant (model never responded)", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({ lastAssistant: undefined }),
    });
    expect(result).toBeNull();
  });

  it("returns fallback text when model returns stopReason=stop with empty content", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("stop"),
      }),
    });
    expect(result).toBe("The model completed but produced no response. Please try again.");
  });

  it("returns fallback text when model returns stopReason=end_turn with empty content", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("end_turn"),
      }),
    });
    expect(result).toBe("The model completed but produced no response. Please try again.");
  });

  it("preserves existing toolUse error message (no side effects)", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("toolUse"),
        replayMetadata: { hadPotentialSideEffects: false, replaySafe: true },
      }),
    });
    expect(result).toBe("⚠️ Agent couldn't generate a response. Please try again.");
  });

  it("preserves existing toolUse error message with side effects", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("toolUse"),
        replayMetadata: { hadPotentialSideEffects: true, replaySafe: false },
      }),
    });
    expect(result).toContain("some tool actions may have already been executed");
  });

  it("preserves existing error stop reason message", () => {
    const result = resolveIncompleteTurnPayloadText({
      payloadCount: 0,
      aborted: false,
      timedOut: false,
      attempt: makeAttempt({
        lastAssistant: makeLastAssistant("error"),
      }),
    });
    expect(result).toBe("⚠️ Agent couldn't generate a response. Please try again.");
  });
});
