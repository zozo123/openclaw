import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentTool, type StreamFn } from "openclaw/plugin-sdk/agent-core";
import { attachModelProviderRequestTransport } from "openclaw/plugin-sdk/agent-harness-runtime";
import { stream, type Context, type Model } from "openclaw/plugin-sdk/llm";
import {
  createRuntimeEnv,
  registerSingleProviderPlugin,
} from "openclaw/plugin-sdk/plugin-test-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/provider-onboard";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

const LIVE = process.env.RUN_DATABRICKS_LIVE_PROOF === "1";

describe.runIf(LIVE)("databricks live workspace proof", () => {
  it(
    "onboards and completes a real streaming tool round-trip through Unity Gateway",
    async () => {
      const host = process.env.DATABRICKS_HOST?.trim();
      const token = process.env.DATABRICKS_TOKEN?.trim();
      const modelId = process.env.DATABRICKS_MODEL?.trim() || "system.ai.claude-sonnet-4-5";

      if (!host || !token) {
        throw new Error(
          "Databricks live proof requires DATABRICKS_HOST and DATABRICKS_TOKEN GitHub Secrets.",
        );
      }

      const provider = await registerSingleProviderPlugin(plugin);
      const auth = provider.auth[0];
      if (!auth?.runNonInteractive) {
        throw new Error("Databricks non-interactive auth handler is missing.");
      }

      const agentDir = mkdtempSync(join(tmpdir(), "openclaw-databricks-live-"));
      const existingProvider = {
        baseUrl: "https://existing.invalid/v1",
        models: [],
      };
      const initialConfig: OpenClawConfig = {
        models: { providers: { existing: existingProvider } },
        agents: { defaults: { models: { "existing/model": { alias: "Keep me" } } } },
      };

      try {
        const onboarded = await auth.runNonInteractive({
          authChoice: "databricks-token",
          config: initialConfig,
          baseConfig: initialConfig,
          opts: { databricksToken: token },
          runtime: createRuntimeEnv(),
          agentDir,
          resolveApiKey: async () => ({ key: token, source: "flag" }),
          toApiKeyCredential: ({ provider: providerId, resolved }) => ({
            type: "api_key",
            provider: providerId,
            key: resolved.key,
          }),
        });
        if (!onboarded) {
          throw new Error("Databricks onboarding returned no configuration.");
        }

        expect(onboarded.models?.providers?.existing).toEqual(existingProvider);
        expect(onboarded.agents?.defaults?.models?.["existing/model"]).toEqual({
          alias: "Keep me",
        });

        const baseUrl = onboarded.models?.providers?.databricks?.baseUrl;
        if (!baseUrl?.endsWith("/ai-gateway/mlflow/v1")) {
          throw new Error("Databricks onboarding did not produce the Unity Gateway base path.");
        }

        const resolved = provider.resolveDynamicModel?.({
          provider: "databricks",
          modelId,
          providerConfig: { baseUrl, models: [] },
          config: onboarded,
        } as never) as Model | undefined;
        if (!resolved) {
          throw new Error("Databricks dynamic model resolution failed.");
        }

        const runtimeModel = attachModelProviderRequestTransport(resolved, {
          allowPrivateNetwork: true,
        }) as Model;

        let executedMarker: string | undefined;
        const probe = {
          name: "platinum_probe",
          label: "platinum_probe",
          description:
            "Return a deterministic marker. Use this tool exactly when the user explicitly asks for the Databricks live proof.",
          parameters: {
            type: "object",
            properties: {
              marker: { type: "string" },
            },
            required: ["marker"],
            additionalProperties: false,
          },
          execute: async (_id: string, input: { marker: string }) => {
            executedMarker = input.marker;
            return {
              content: [
                {
                  type: "text" as const,
                  text: "OPENCLAW_DATABRICKS_TOOL_RESULT_OK",
                },
              ],
              details: { ok: true },
            };
          },
        } as AgentTool;

        const realStream: StreamFn = (model, context, options) =>
          stream(model, context as Context, { ...options, apiKey: token });

        const agent = new Agent({
          initialState: {
            model: runtimeModel,
            tools: [probe],
          },
          streamFn: realStream,
        });

        await agent.prompt(
          [
            "This is an integration validation.",
            "You MUST call the platinum_probe tool exactly once.",
            'Pass marker "OPENCLAW_PLATINUM".',
            'After receiving the tool result, answer with the exact text "LIVE_PROOF_OK".',
            "Do not answer before calling the tool.",
          ].join(" "),
        );

        expect(executedMarker).toBe("OPENCLAW_PLATINUM");

        const finalMessage = agent.state.messages.at(-1);
        const finalSerialized = JSON.stringify(finalMessage);
        expect(finalSerialized).toContain("LIVE_PROOF_OK");

        console.log("[databricks-live-proof] onboarding=ok");
        console.log("[databricks-live-proof] existing_config_preserved=ok");
        console.log("[databricks-live-proof] unity_gateway_request=ok");
        console.log("[databricks-live-proof] streaming=ok");
        console.log("[databricks-live-proof] tool_call=ok");
        console.log("[databricks-live-proof] tool_result_second_turn=ok");
        console.log("[databricks-live-proof] final_response=ok");
        console.log(`[databricks-live-proof] model=${modelId}`);
        console.log("[databricks-live-proof] workspace=REDACTED");
      } finally {
        rmSync(agentDir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
