# Plugin

A plugin is the **name and contract** of a pipeline step (for example `app_train_adapter`, `yolo_train`). It identifies which capability or adapter executes that step.

Plugins define task behavior while MLAir provides orchestration, tracking, and retries. The **runtime location** is separate: with **internal** mode the built-in [executor](../concepts/task-execution-mode.md) runs the plugin subprocess; with **external** mode your worker implements the leased plugin name.

Next: [Create a Plugin](../guides/create-plugin.md), [Validate a Plugin](../guides/validate-plugin.md), [Task execution mode](./task-execution-mode.md).
