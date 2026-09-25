# Hermes Agent Integration

ABn now vendors a project-local Hermes Agent skill under `.hermes/skills/abn-production-audit/`.

Hermes Agent supports project-local skills from `<project-root>/.hermes/skills/`. Project skills are the highest-precedence skill tier, but Hermes requires the repository to be explicitly trusted before project skills load.

## Install Hermes

On Linux/macOS/WSL2:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc
```

On native Windows PowerShell:

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

Then configure a provider:

```bash
hermes setup
# or, for the Nous Portal path:
hermes setup --portal
```

## Trust ABn's project skill

From the ABn checkout:

```bash
cd /path/to/ABn
hermes skills trust
hermes skills list
```

The project skill should appear as `abn-production-audit`.

## Recommended first use

```bash
cd /path/to/ABn
hermes
```

Then ask Hermes to:

```text
Run the ABn production audit. Do not enable LIVE execution. Inspect the current Git state, CI, execution gates, capital model, CEX recovery/reconciliation, tests, and deployment state. Report blockers and the next safe implementation gate.
```

## GitHub MCP

Hermes supports MCP servers through its user-level `~/.hermes/config.yaml`. Do not commit GitHub tokens into ABn. If GitHub MCP is enabled, keep its token in Hermes' secret environment/config mechanism, not this repository.

Example shape:

```yaml
mcp_servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}"
```

Only expose the minimum MCP tools required for repository inspection and review. Do not give an agent unrestricted write/merge capability while ABn remains in DRY_RUN/review stages.

## ABn safety boundary

Hermes is an engineering/audit agent here, not an authorization mechanism for funded trading. It must not:

- obtain or expose raw private keys;
- bypass the runtime state machine;
- disable capital/risk/reconciliation gates;
- merge execution changes solely because CI is green;
- enable funded LIVE execution without the project's independent authorization gates.
