# MLAir Documentation

MLAir documentation follows a task-oriented, production-first approach inspired by MLflow and Apache Airflow.

## Documentation Philosophy

The goal is not to explain the system in theory, but to help users run, extend, and debug MLAir with minimal friction.

### Core Principles

- Action over explanation
- Copy-paste runnable commands
- Minimal theory upfront
- Short, predictable structure
- Real-world scenarios first

Each guide follows:

`Goal -> Steps -> Command -> Result -> Done`

## Documentation Structure

- [Getting Started](./getting-started/quickstart.md)
- [Guides](./guides/run-pipeline.md)
- [Concepts](./concepts/pipelines.md)
- [CLI](./cli/commands.md)
- [API](./api/overview.md)
- [Troubleshooting](./troubleshooting/common-errors.md)

## Documentation Rules

- One file = one task
- Use relative links only
- Do not create folders outside the agreed docs structure
- No hidden setup steps
- No outdated snippets

## Definition of Done (Docs)

- New user completes Quickstart without asking for help
- New user builds a plugin successfully
- Debug guide can be used to resolve a real failure
- No dependency on tribal knowledge
