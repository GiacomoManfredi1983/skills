---
name: dyalog-apl-runner
description: Run Dyalog APL scripts and inline expressions using dyascript.exe, and debug APL errors. Use this skill whenever the user wants to execute APL code, run .apls script files, test APL expressions, or encounters APL errors (DOMAIN ERROR, RANK ERROR, LENGTH ERROR, etc.) that need diagnosis. Also trigger when the user mentions Dyalog, APL, ⎕NA, dfns, or wants to test DWA extensions from APL. Even casual mentions like "run this in APL", "try this expression", or "what does this APL do" should activate this skill.
---

# Dyalog APL Runner

Execute Dyalog APL scripts and expressions, and diagnose APL errors.

## Environment

The Dyalog APL script runner is at:

```
"C:\Program Files\Dyalog\Dyalog APL-64 20.0 Unicode\scriptbin\dyalogscript.ps1"
```

This is `dyascript` (Dyalog Script), a non-interactive runner for `.apls` files. It provides a full APL environment without the GUI session.

## Running APL Scripts

### Script files (.apls)

To run an existing `.apls` file:

```powershell
& "C:\Program Files\Dyalog\Dyalog APL-64 20.0 Unicode\scriptbin\dyalogscript.ps1" path\to\script.apls
```

Scripts use the shebang `#!/usr/local/bin/dyalogscript` by convention but this isn't required on Windows.

**IMPORTANT — dyascript may hang**: If `dyalogscript.ps1` appears to hang (no output after a few seconds), it has likely hit an error and dropped into an interactive APL session. In that case:
1. Kill the process
2. Fall back to running via the main interpreter with stdin redirect:

```powershell
# Fallback: run script via cmd.exe stdin redirect (preserves Unicode correctly)
cmd.exe /c "`"C:\Program Files\Dyalog\Dyalog APL-64 20.0 Unicode\dyalog.exe`" lx=`"⍎⊃⎕NGET 'path\to\script.apls' 1`""
```

Always run dyascript with a timeout (e.g., `Start-Process` with `-Wait` and a timer, or use async mode with `initial_wait`). If it doesn't produce output within 10 seconds, assume it's hung.

### Inline expressions

For quick one-off APL expressions, create a temporary `.apls` file and run it. Don't try to pass APL characters on the command line or pipe them through PowerShell — encoding issues will mangle APL Unicode characters (e.g., `≡` becomes `Γëí`). Instead:

1. Write the expression to a temp file (UTF-8 with BOM for APL characters):

```powershell
$expr = @"
⎕←+/⍳10
"@
[System.IO.File]::WriteAllText("$env:TEMP\apl_expr.apls", $expr, [System.Text.UTF8Encoding]::new($true))
& "C:\Program Files\Dyalog\Dyalog APL-64 20.0 Unicode\scriptbin\dyalogscript.ps1" "$env:TEMP\apl_expr.apls"
```

2. Clean up the temp file afterward.

APL source files must be UTF-8 encoded. The BOM (`$true` in UTF8Encoding) helps Dyalog reliably detect the encoding.

**Never pipe APL source through PowerShell** — `Get-Content | &` or here-string piping will corrupt Unicode APL glyphs. Always use file-based execution.

### Multi-line scripts

For anything beyond a single expression, write a proper `.apls` file. Key syntax elements:

```apl
⍝ This is a comment
⎕←expr          ⍝ Print to stdout
var←expr         ⍝ Assignment
:If cond         ⍝ Control structures (script top-level / tradfns ONLY)
:EndIf
fn←{⍺ ⍵}        ⍝ Dfn (anonymous function)
```

**CRITICAL — dfns vs control structures**: Control structures (`:If`, `:For`, `:While`, `:Trap`, etc.) are ONLY valid at script top-level or inside tradfns. Inside dfns (`name←{...}`), use **guards** (`cond: expr`) and **error-guards** (`errno :: expr`) instead. See `references/dfns-guide.md` for full details.

### Loading DWA extensions (⎕NA)

APL loads native DLLs via `⎕NA`. The PP type is DWA-specific for LOCALP* parameters:

```apl
dll←'path\to\extension'
⎕NA 'dll|function_name <PP >PP'    ⍝ input PP, output PP
result←function_name input 0        ⍝ 0 is placeholder for output PP
```

The `0` trailing argument is a DWA convention — it's the output pocket that gets filled by the extension.

## Interpreting Output

- `⎕←` prints to stdout — this is the primary output mechanism
- Exit code: `⎕OFF n` exits with code `n`; `⎕OFF 0` (or script ending normally) means success
- APL arrays print in APL display format: vectors space-separated, matrices row-per-line

## Error Diagnosis

When an APL error occurs, the output typically looks like:

```
DOMAIN ERROR
function_name[3] result←÷0
                        ∧
```

The caret (`∧`) points to where execution stopped. Read `references/apl-errors.md` for a comprehensive guide to common errors and their causes.

Key debugging approach:
1. Read the error class (DOMAIN, RANK, LENGTH, etc.)
2. Look at the line and caret position
3. Check the operand types and shapes
4. Suggest the most likely fix

When the user shares APL error output, always explain:
- **What** the error means
- **Why** it likely happened (the specific operand/value that triggered it)
- **How** to fix it (concrete APL code)
