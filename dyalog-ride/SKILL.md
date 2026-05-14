---
name: dyalog-ride
description: Connect to a persistent Dyalog APL session via the RIDE protocol for stateful, interactive APL work. Use this skill when the user wants a persistent APL workspace, says "RIDE", "keep workspace", "stateful session", "interactive APL", "connect to Dyalog", "persistent session", or needs variables/functions defined in one interaction to survive to the next. Do NOT use for quick one-off expressions — use dyalog-apl-runner for those.
---

# Dyalog APL — RIDE Persistent Session

Drive a persistent Dyalog APL interpreter through the RIDE protocol. Unlike `dyalog-apl-runner` (stateless one-shot execution), this skill maintains a live workspace across interactions — variables, functions, and state persist.

## Documentation

**IMPORTANT**: Full Dyalog APL documentation is at `d:\devel\dyalog_documentation\`. Before guessing about APL syntax, system functions (⎕-names), system commands (), operators, or configuration — spend a minute browsing the docs. Key subdirectories:

- `language-reference-guide/` — all primitive functions, operators, system functions, system commands
- `programming-reference-guide/` — namespaces, classes, interfaces, threads, error handling
- `windows-installation-and-configuration-guide/` — configuration parameters, RIDE setup
- `object-reference/` — GUI objects (if needed)

Do not hallucinate system function names or syntax. Look them up.

## Environment

- **Interpreter**: `D:\devel\dyalog\20.0\dyalog.exe` (Version 20.0, 64-bit Unicode)
- **RIDE client script**: `C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs`
- **Default port**: 4502 (localhost)
- **State file**: `C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-state.json`

## Commands

All commands are run via Node.js:

```powershell
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" <verb> [options]
```

### Verbs

| Verb | Description |
|------|-------------|
| `start` | Launch a new Dyalog interpreter in RIDE serve mode |
| `stop` | Send Exit to the interpreter and clean up |
| `status` | Check if interpreter is reachable on the configured port |
| `execute` | Run APL expression(s), return output |
| `getlog` | Retrieve session log (what happened previously) |
| `getsistack` | Get current SI (state indicator) stack |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `localhost` | Host to connect to |
| `--port` | `4502` | RIDE port |
| `--timeout` | `30` | Seconds to wait for output |
| `--file` | — | Read APL from this file instead of argument |

### Examples

```powershell
# Start a fresh interpreter
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" start --port 4502

# Check it's running
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" status

# Execute APL (inline)
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" execute "⎕←+/⍳10"

# Execute APL from file (for complex/multi-line code)
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" execute --file "$env:TEMP\mycode.apls"

# Check SI stack (is interpreter stuck in an error?)
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" getsistack

# Get session log (see history after reconnecting)
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" getlog

# Stop the interpreter
node "C:\Users\stf\.copilot\skills\dyalog-ride\scripts\ride-client.mjs" stop
```

## Output Format

All commands return structured JSON to stdout:

```json
{"ok": true, "output": "55\n", "promptType": 1}
```

Fields:
- `ok` — `true` if execution completed normally, `false` on error or timeout
- `output` — concatenated session output text
- `promptType` — interpreter state: `1` = ready (normal prompt), `2` = waiting for ⎕ input, `4` = waiting for ⍞ input, `0` = not ready
- `timeout` — (optional) `true` if the command timed out
- `waiting_for_input` — (optional) `"quad"` or `"quote-quad"` if interpreter is waiting for input
- `stack` — (only for `getsistack`) array of stack frames
- `log` — (only for `getlog`) array of session log lines

## Workflow

### Starting a session

1. Run `status` to check if an interpreter is already running on the port
2. If not, run `start` to launch one
3. Use `execute` to interact

### Passing APL code

For simple expressions, pass inline:
```powershell
node ...\ride-client.mjs execute "x←⍳10"
```

For multi-line code or code with complex APL characters, write to a temp file (UTF-8 with BOM) and use `--file`:
```powershell
$code = @"
avg←{(+⌿⍵)÷≢⍵}
⎕←avg 1 2 3 4 5
"@
[System.IO.File]::WriteAllText("$env:TEMP\ride_expr.apls", $code, [System.Text.UTF8Encoding]::new($true))
node ...\ride-client.mjs execute --file "$env:TEMP\ride_expr.apls"
```

### Error handling

If an APL error occurs, the output will contain the error message (e.g., `DOMAIN ERROR`) and the SI stack will have entries.

**Do not blindly clear the stack.** Instead:

1. **Inspect**: Run `getsistack` to see where execution stopped
2. **Examine**: Use `execute` to inspect variables in the suspended scope (they're still accessible)
3. **Understand**: Read the error message and the caret position to understand what went wrong
4. **Then decide**:
   - `execute "→"` — escape one level (peel one frame off the stack)
   - `execute ")RESET"` — clear the entire SI stack (preserving workspace definitions)
   - `execute ")CLEAR"` — nuclear option: wipe the entire workspace clean

### Connecting to a pre-existing session

If a Dyalog interpreter is already running with `RIDE_INIT=serve:*:<port>`:
- Simply use `execute`, `getlog`, etc. with the correct `--port`
- No `start` needed — the skill connects on each invocation

### Timeout behavior

If execution exceeds `--timeout` seconds:
- The script disconnects and returns `{"ok":false,"timeout":true,"output":"...partial..."}`
- The interpreter keeps running — the computation is NOT interrupted
- On next connect, use `getlog` to see what happened, or `getsistack` to check state

## Dual mode: when to use this vs. dyalog-apl-runner

| Use `dyalog-ride` when | Use `dyalog-apl-runner` when |
|------------------------|------------------------------|
| Building up definitions across interactions | Quick one-off expression |
| Need workspace state to persist | Running a self-contained script |
| Debugging (inspecting SI stack, variables) | Testing a snippet in isolation |
| User says "persistent", "session", "RIDE" | User says "run this", "try this" |
