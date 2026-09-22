# OpenClaw Databricks Provider

Databricks Unity Gateway model services as a native OpenClaw provider.

## Install

```bash
openclaw plugins install clawhub:@zozo123/openclaw-databricks-provider
```

## Configure

```bash
export DATABRICKS_HOST="https://<workspace>.cloud.databricks.com"
export DATABRICKS_TOKEN="..."
openclaw onboard --auth-choice databricks-token
```

The provider sends OpenAI-compatible Chat Completions requests to:

```text
$DATABRICKS_HOST/ai-gateway/mlflow/v1
```

Ready-to-use Databricks model services include:

```text
databricks/system.ai.claude-sonnet-4-5
databricks/system.ai.gpt-5-6-sol
```

Custom Unity Catalog model-service names are accepted as
`databricks/<catalog>.<schema>.<service>`.

## Security

Keep `DATABRICKS_TOKEN` out of source control. Personal access tokens are useful
for development; use your organization's Databricks machine-to-machine OAuth
policy for production deployments.

## Compatibility

Built and tested against OpenClaw 2026.9.5.
