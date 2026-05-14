# Dyalog Skills

This repository contains two GitHub Copilot skills for working with Dyalog APL:

- `dyalog-apl-runner`: run one-off APL expressions and scripts with `dyascript`.
- `dyalog-ride`: connect to a persistent Dyalog session through RIDE for stateful workflows.

## Structure

- `dyalog-apl-runner/SKILL.md`
- `dyalog-apl-runner/references/`
- `dyalog-apl-runner/evals/`
- `dyalog-ride/SKILL.md`
- `dyalog-ride/scripts/ride-client.mjs`

## Purpose

These skills are intended to make APL workflows faster by choosing the right execution mode:

- use runner mode for quick, stateless checks;
- use RIDE mode when you need a persistent workspace and iterative exploration.

## License

This project is released under the Unlicense. See `LICENSE` for details.