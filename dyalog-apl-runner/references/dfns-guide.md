# Dfns (Dynamic Functions) — Quick Reference

Source: https://github.com/dyalog/documentation — programming-reference-guide/docs/defined-functions-and-operators/dfns-and-dops/

## Key Rules

### NO control structures in dfns
Dfns **do not** support `:If`, `:Else`, `:EndIf`, `:For`, `:While`, `:Repeat`, `:Trap`, `:Select`, `:Case`, or any colon-prefixed control structure. These only work in tradfns (traditional functions defined with `∇`).

### NO branch (→) in dfns

### Guards (conditional execution)
Use guards instead of `:If`/`:Else`. A guard is `condition: expression` — if condition is 1, the expression is evaluated as the function's result and execution stops.

```apl
sign←{
    ⍵>0: '+ve'      ⍝ Positive
    ⍵=0: 'zero'     ⍝ Zero
         '-ve'      ⍝ Negative (default — no guard = always executes)
}
```

Multiple guards are evaluated top-to-bottom. First one that yields 1 wins. An unguarded expression is the default (catches everything else).

### Error-Guards (exception handling)
Use `errno :: expr` instead of `:Trap`. The `::` digraph (not single `:`) signals an error-guard.

```apl
safe_div←{
    11::0           ⍝ DOMAIN ERROR → return 0
    ⍺÷⍵
}

open←{
    0::0               ⍝ Any error → return 0
    22::⍵ ⎕FCREATE 0  ⍝ FILE NAME → create new
    24 25::⍵ ⎕FSTIE 0 ⍝ FILE TIED → share tie
    ⍵ ⎕FTIE 0         ⍝ Try exclusive tie
}
```

Error numbers: 0 = catch-all synchronous, 1000 = catch-all interrupts.

### Localisation
- `name←value` localises the name (creates a local binding)
- `+←` does NOT localise — it modifies the outer/global variable
- `⍺` and `⍵` are the only implicit locals (left and right arguments)
- `∇` refers to the function itself (for recursion)
- `⍺⍺` and `⍵⍵` are operands (in dops)

### Other Restrictions
- Dfns do not support `⎕CS` (NONCE ERROR)
- `⎕SHADOW` ignores dfns
- `⎕MONITOR` does not apply to dfns
- Modified assignment like `X plus←10` doesn't work as expected
- Single-line dfns cannot be traced (executed atomically)
- Non-result-returning calls terminate the function

## Patterns

### If-else equivalent
```apl
⍝ :If cond ... :Else ... :EndIf  →  guards
fn←{
    cond: true_expr
    false_expr
}
```

### Multi-branch
```apl
fn←{
    cond1: expr1
    cond2: expr2
    cond3: expr3
    default_expr
}
```

### Side effects before returning (use ⊣)
```apl
check←{
    (name exp got)←⍵
    exp≡got: pass+←1 ⊣ ⎕←'  ✓ ',name
    fail+←1 ⊣ ⎕←'  ✗ ',name,' — expected ',(⍕exp),' got ',(⍕got)
}
```
Note: `+←` here modifies outer `pass`/`fail` (not local). The `⊣` ensures the side-effect expression (⎕←...) executes but the guard returns the left side.

### Try-catch equivalent
```apl
safe←{
    0::'error'      ⍝ Catch any error
    risky_expr
}
```

### Cascading error handlers
```apl
resilient←{
    0::fallback_3
    0::fallback_2
    0::fallback_1
    primary_expr
}
```

## Tradfns vs Dfns

| Feature | Tradfn | Dfn |
|---------|--------|-----|
| Definition | `∇ result←fn args` | `fn←{...}` |
| Control structures | ✓ (`:If`, `:For`, etc.) | ✗ (use guards) |
| Branch (`→`) | ✓ | ✗ |
| Error handling | `:Trap` / `⎕TRAP` | Error-guards (`::`) |
| Local vars | `;name` in header | `name←` auto-localises |
| Arguments | Named in header | `⍺` (left), `⍵` (right) |
| Recursion | By name | `∇` self-reference |
| Multi-line | ∇...∇ block | `{` line `⋄` line `}` or multi-line |

## Script-level (.apls files)
At the top level of a `.apls` script, you CAN use control structures (`:If`, `:For`, etc.) because the script body is executed as tradfn-like code. Only inside `name←{...}` dfn definitions are control structures forbidden.
