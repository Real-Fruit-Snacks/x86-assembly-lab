# Contributing

Contributions are welcome. This project is a static x86 assembly learning tool -- no build step, no framework, no dependencies.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Open `index.html` in a browser (or run `python -m http.server 3456`)
4. Make your changes
5. Test manually and verify the sandbox simulator handles your changes

## Project Structure

```
index.html      All sections and HTML structure
style.css       Styling (dark theme, layout, components)
simulator.js    x86 engine (parser, executor, registers, memory, branches)
app.js          UI logic (sandbox, mini-sims, tools, navigation)
```

## Guidelines

- Keep it dependency-free. No npm, no frameworks, no build tools.
- Test new instructions in the sandbox with edge cases (overflow, negative values, zero).
- Follow the existing code style -- no semicolons are fine, consistent indentation matters.
- New instructions should include typo aliases in `_correctOpcode()` and an example in `SANDBOX_EXAMPLES`.
- New learning sections should include at least one interactive mini-sim.

## Adding a New Instruction

1. Add the `case` in `simulator.js` `execute()` switch
2. Add it to the `valid` set in `_correctOpcode()`
3. Add it to `needsOps` with the correct operand count
4. Add a sandbox example in `app.js` `SANDBOX_EXAMPLES`
5. Add an `<option>` in the sandbox dropdown in `index.html`
6. Add it to the Instruction Reference in `REF_DATA` in `app.js`

## Reporting Bugs

Open an issue with:
- The assembly code you entered
- What you expected to happen
- What actually happened
- Screenshot if relevant
