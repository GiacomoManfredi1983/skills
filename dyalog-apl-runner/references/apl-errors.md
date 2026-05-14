# Dyalog APL Error Reference

Quick-reference for diagnosing APL runtime errors. Each section covers one error class: what it means, common causes, and typical fixes.

## Table of Contents

1. [DOMAIN ERROR](#domain-error)
2. [RANK ERROR](#rank-error)
3. [LENGTH ERROR](#length-error)
4. [INDEX ERROR](#index-error)
5. [VALUE ERROR](#value-error)
6. [SYNTAX ERROR](#syntax-error)
7. [WS FULL](#ws-full)
8. [NONCE ERROR](#nonce-error)
9. [FILE errors](#file-errors)
10. [⎕NA / DLL errors](#na--dll-errors)

---

## DOMAIN ERROR

**Meaning**: An argument's value is outside the valid domain for the operation.

**Common causes**:
- Division by zero: `÷0` or `3÷0`
- Log of zero or negative: `⍟0` or `⍟¯3`
- Boolean operation on non-boolean: `∧1.5`
- `⍳` with non-integer: `⍳3.5`
- Indexing with non-integer: `A[1.5]`
- `⎕NA` function received wrong argument type

**Fix pattern**: Check the actual value at the caret position. Often a guard or conditional is needed:
```apl
safe_div←{⍵=0: 0 ⋄ ⍺÷⍵}
```

## RANK ERROR

**Meaning**: An argument has the wrong number of dimensions (rank) for the operation.

**Common causes**:
- Scalar where vector expected, or vice versa
- Matrix operation on higher-rank array
- Dyadic function with mismatched ranks (when conformability rules aren't met)
- DWA function expecting vector, got matrix

**Fix pattern**: Check `⍴⍴arg` (rank). Use ravel `,arg` to flatten, or `⊂arg` to enclose.

## LENGTH ERROR

**Meaning**: Arguments have incompatible lengths/shapes.

**Common causes**:
- `A+B` where `⍴A ≠ ⍴B` and neither is scalar
- `A,[axis]B` with mismatched dimensions on non-join axes
- `⍉` with invalid axis permutation
- Assignment `A←B` where shapes don't match for selective assignment

**Fix pattern**: Check `⍴` of both arguments. One common fix is `(n↑vec)` or `(n↓vec)` to align lengths.

## INDEX ERROR

**Meaning**: Index out of bounds.

**Common causes**:
- `A[i]` where `i > ⍴A` (or `i < ⎕IO`)
- Bracket indexing with wrong number of subscripts
- `⌷` (index) with out-of-range values

**Fix pattern**: Check `⍴array` vs the index used. Remember `⎕IO` — if `⎕IO←1`, valid indices are 1 to `⍴A`.

## VALUE ERROR

**Meaning**: Referencing an undefined name.

**Common causes**:
- Typo in variable/function name
- Variable not assigned yet (used before ←)
- Function not loaded (missing `)COPY` or `⎕CY`)
- `⎕NA` not executed before calling the external function
- Namespace reference to non-existent member

**Fix pattern**: Check spelling. Use `)NMS` or `⎕NL 2` to list defined names.

## SYNTAX ERROR

**Meaning**: APL cannot parse the expression.

**Common causes**:
- Unmatched parentheses or brackets
- Missing operand: `+/` without right argument when used monadically in wrong context
- Stray characters or encoding issues (common with APL Unicode in wrong encoding)
- Using a value where a function is expected or vice versa

**Fix pattern**: Check the caret position carefully. Often an encoding issue if the APL chars look wrong.

## WS FULL

**Meaning**: Workspace memory exhausted.

**Common causes**:
- Creating very large arrays
- Recursive function without base case
- Accumulated temporary results

**Fix pattern**: Use `⎕WA` to check available workspace. Consider processing in chunks or increasing `MAXWS`.

## NONCE ERROR

**Meaning**: Feature not implemented or not available.

**Common causes**:
- Using a system function/variable not supported in this environment
- `dyascript` doesn't support all GUI-related system functions
- Platform-specific features

## FILE errors

Several file-related errors:
- **FILE NAME ERROR**: File not found or invalid path
- **FILE ACCESS ERROR**: Permission denied
- **FILE TIE ERROR**: File already tied or tie number in use

**Fix pattern**: Check paths with `⎕NEXISTS`. Use full absolute paths. On Windows, both `/` and `\` work in APL file operations.

## ⎕NA / DLL errors

When loading native DLLs via `⎕NA`:

- **FILE NAME ERROR on ⎕NA**: DLL not found at specified path. Check the path doesn't include the `.dll` extension (Dyalog adds it).
- **DOMAIN ERROR on call**: Wrong argument type. Check the `⎕NA` declaration matches what the DLL expects.
- **EXCEPTION**: The DLL threw an unhandled exception. Check the DLL's error handling.

**DWA-specific**: For PP-type arguments (LOCALP*), the convention is:
- `<PP` = input (read-only)
- `>PP` = output (allocated by the DLL)
- `=PP` = in-place modification

Common mistake: forgetting the trailing `0` placeholder for output PPs:
```apl
⍝ Wrong:
result←my_function input
⍝ Right:
result←my_function input 0
```
