# Template "Use" form pre-fills a `directory` param with the literal `{directory}`

**Switch Console 0.40.1 · switch-core 0.31.0 · macOS (arm64) · local server**

## What happens
A v2 template with a `directory` param bound into the agent's `directory:` field:

```yaml
params:
  directory:
    type: directory
    label: OrderRoom agent directory
    input: ask
resources:
  desk:
    type: agent
    directory: "{directory}"
```

On **Templates → Use template**, the directory input is pre-filled with the text `{directory}` rather than left empty. Typing a path inside it produced `{/Users/me/orderroom/agent}`. The run succeeds (agent and room created, kickoff posted), but the agent never starts:

```
ERROR Could not start agent {"reason":"definition_invalid",
  "error":"The working directory '{/Users/me/orderroom/agent}' is not an absolute path."}
```

The only visible sign in Console is a red dot on the agent.

## Expected
- The input starts empty (or shows a placeholder, not a value).
- Create is blocked with a clear message when a `directory` value is not an absolute path, before anything is created. The path check exists at runtime (`console/packages/agent-controller/src/runtime.ts:443`) but not at the form.

## Pointers (from reading the source, not verified by stepping through)
- `console/apps/switch-console-desktop/src/renderer/features/templates/template-use-view.tsx` (`unboundOfType('directory')`, `directoryShownFor`, the `interpolate(...)` of the directory value around line 620)
- `use/use-template-model.ts` (`defaultsFor`) starts params empty, so the `{directory}` text appears to come from the agent's raw `directory:` field.

## Repro
Template: https://github.com/kumarrohitkumar/orderroom/blob/main/switch/orderroom.template.yaml
