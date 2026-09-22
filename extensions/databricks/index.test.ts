import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";
import {
  DATABRICKS_DEFAULT_MODEL_REF,
  normalizeDatabricksHost,
  resolveDatabricksBaseUrl,
} from "./models.js";

describe("databricks provider plugin", () => {
  it("registers Databricks auth and provider metadata", () => {
    const captured = capturePluginRegistration(plugin);
    const provider = captured.providers[0];
    expect(provider?.id).toBe("databricks");
    expect(provider?.label).toBe("Databricks");
    expect(provider?.envVars).toEqual(["DATABRICKS_TOKEN"]);
    expect(provider?.auth[0]?.id).toBe("api-token");
  });

  it("normalizes workspace hosts and builds the Unity Gateway base URL", () => {
    expect(normalizeDatabricksHost("dbc-example.cloud.databricks.com/")).toBe(
      "https://dbc-example.cloud.databricks.com",
    );
    expect(
      resolveDatabricksBaseUrl("https://dbc-example.cloud.databricks.com/"),
    ).toBe("https://dbc-example.cloud.databricks.com/ai-gateway/mlflow/v1");
    expect(normalizeDatabricksHost("http://dbc-example.cloud.databricks.com")).toBeUndefined();
  });

  it("uses a Databricks-qualified default model ref", () => {
    expect(DATABRICKS_DEFAULT_MODEL_REF).toBe(
      "databricks/system.ai.claude-sonnet-4-5",
    );
  });
});
