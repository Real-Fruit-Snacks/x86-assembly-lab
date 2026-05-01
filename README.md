<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="x86 Assembly Learning Lab" src="docs/assets/logo-dark.svg" width="100%">
</picture>

> [!IMPORTANT]
> **Interactive x86 assembly simulator and learning lab.** A complete browser-based environment for learning x86 assembly from scratch — step-through simulator, visual stack playground with nested frame tracking, register quiz game, 23 tutorial sections, and 7 interactive tools. No backend, no build step, no dependencies.

> *Reading assembly is easier when you can step it. Felt fitting for a single-file lab that runs the engine in your browser tab.*

---

## §1 / Premise

A self-contained x86 assembly classroom. Paste any x86 listing into the sandbox and step through it — registers, flags, byte-addressable memory, and the stack update in real time with DEC/HEX/BIN displays. The stack playground has four modes (Explore, Step-Through, Puzzle, Errors) and tracks nested frames with color-coded borders and a `main → caller → current` call-chain overview.

A register quiz game generates random problems across three difficulty levels with scoring, streaks, and best-record memory. Twenty-three tutorial sections cover fundamentals through advanced topics — calling conventions, structs, floating point, dynamic memory — each with mini-simulators and practice challenges.

▶ **[Live demo](https://Real-Fruit-Snacks.github.io/x86-assembly-lab/)**

---

## §2 / Specs

| KEY        | VALUE                                                                       |
|------------|-----------------------------------------------------------------------------|
| SIMULATOR  | EAX–EDX with sub-registers (AL/AH/AX) · ESI · EDI · EBP · ESP · ZF/CF/SF/OF |
| INSTRUCTIONS | MOV(SX/ZX), arithmetic, bitwise, shifts, MUL/IMUL/DIV/IDIV/CDQ, stack/branch/call/ret |
| TUTORIALS  | **23 sections** · 23+ interactive mini-simulators · before/after snapshots  |
| TOOLS      | **7 interactive** · instruction reference · number / bitwise / endianness · ASCII · flags · address calc |
| STACK MODES | Explore · Step-Through · Puzzle · Errors                                   |
| TESTS      | **710 automated** (correctness + fuzz + scenario verification)              |
| THEME      | **Catppuccin Mocha** with custom scrollbars                                 |
| STACK      | **Vanilla** HTML/CSS/JS · no framework, no build, no dependencies · MIT     |

Architecture in §5 below.

---

## §3 / Quickstart

```bash
git clone https://github.com/Real-Fruit-Snacks/x86-assembly-lab.git
cd x86-assembly-lab

# Option 1 — open directly
open index.html

# Option 2 — local server
python -m http.server 3456
# → http://localhost:3456

# Option 3 — Node
npx serve . -l 3456
```

---

## §4 / Reference

```
SUPPORTED INSTRUCTIONS

  MOV, MOVSX, MOVZX, ADD, SUB, INC, DEC, NEG, XCHG, LEA
  AND, OR, XOR, NOT, TEST, CMP
  SHL, SHR, SAR, ROL, ROR, MUL, IMUL, DIV, IDIV, CDQ
  PUSH, POP, CALL, RET, LEAVE, NOP
  JMP, JE, JNE, JB, JBE, JA, JAE, JL, JLE, JG, JGE
  (+ all aliases: JZ, JNZ, JNA, JNBE, SAL, RETN, etc.)

INPUT FORMATS

  Decimal       mov eax, 42         mov eax, -5
  Hex (0x)      mov eax, 0xFF       mov eax, -0xFF
  Hex (IDA)     mov eax, 0FFh       mov eax, 0Ch
  Binary        mov al, 0b11001100  mov al, 11001100b
  Character     mov al, 'A'
  IDA vars      mov eax, [ebp+var_4]
  IDA args      mov eax, [ebp+arg_0]
  Memory        mov dword ptr [ebp-8], 45

REGISTER QUIZ

  Easy   (1 pt)   2-4 instructions, MOV/ADD/SUB/INC/DEC/NEG/XCHG
  Medium (2 pt)  4-6 instructions, adds MUL/DIV/shifts/AND/OR/XOR/NOT
  Hard   (3 pt)  6-10 instructions, chained IMUL/DIV/remainder tracking

STACK PLAYGROUND MODES

  Explore         7 action buttons + 6 preset scenarios + free EXECUTE
  Step-Through    5 guided walkthroughs (call, prologue/epilogue, args, locals, LIFO)
  Puzzle          Random stack-state predictions with scoring + streaks
  Errors          6 common stack bugs explained step-by-step

INTERACTIVE TOOLS

  Instruction Reference   Searchable lookup with flag behavior, examples
  Number Converter        DEC ↔ HEX ↔ BIN, signed/unsigned, boundary table
  Bitwise Calculator      AND/OR/XOR/NOT with truth tables, color-coded bits
  Endianness Guide        Interactive byte-order explorer
  ASCII Table             128-character clickable grid (char/dec/hex)
  Flags Calculator        Operation + values → all flags + jump verdicts
  Address Calculator      Effective address math + EBP frame-offset helper
```

---

## §5 / Architecture

```
.
  index.html            Single-page app with 34 sections
  style.css             Catppuccin Mocha theme + custom scrollbars
  simulator.js          x86 engine: registers, flags, memory, stack, branches
  app.js                UI: sandbox, playground, quiz, mini-sims, tools
  docs/assets/          Dark + light logo SVGs
```

| Layer        | Implementation                                                  |
|--------------|-----------------------------------------------------------------|
| **Engine**   | Hand-rolled parser + evaluator over registers/flags/memory      |
| **Frames**   | Per-frame EBP anchor · `argBoundary` cell assignment · frame-relative labels |
| **IDA notation** | `var_N` → `[ebp-N]` · `arg_N` → `[ebp+N+8]` · hex with `h` suffix |
| **UI**      | Vanilla DOM · responsive · sidebar collapses · state persists in localStorage |
| **Tests**    | 507 correctness + 203 scenario verifications across all examples + scenarios |
| **Deploy**   | Static · single repo · `index.html` + 3 sibling files           |

**Key patterns:** No framework. The simulator engine is a pure function from `(state, instruction)` to `state`, which makes step-through, puzzles, and tests share one source of truth. Every example, walkthrough, mini-sim, and quiz round runs through the same engine.

---

[License: MIT](LICENSE) · Part of [Real-Fruit-Snacks](https://github.com/Real-Fruit-Snacks) — building offensive security tools, one wave at a time.
