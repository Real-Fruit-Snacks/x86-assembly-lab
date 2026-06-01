<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="x86 Assembly Learning Lab" src="docs/assets/logo-dark.svg" width="100%">
</picture>

> [!IMPORTANT]
> **Interactive x86 & x86-64 assembly simulator and learning lab.** A complete browser-based environment for learning assembly from scratch — a step-through 32-bit simulator, an interactive 64-bit playground, a visual stack playground with nested frame tracking, a register quiz game, 27 tutorial sections, and 7 interactive tools. No backend, no build step, no dependencies.

> *Reading assembly is easier when you can step it. Felt fitting for a single-file lab that runs the engine in your browser tab.*

---

## §1 / Premise

A self-contained assembly classroom. Paste any x86 listing into the sandbox and step through it — registers, flags, byte-addressable memory, and the stack update in real time with DEC/HEX/BIN displays. The sandbox reads real disassembler notation: segment prefixes (`ss:[ebp-4]`), bare-hex addresses (`004940d8`), `dword ptr` size hints, and IDA-style `var_N`/`arg_N`.

A separate **64-bit engine** powers an interactive x64 Playground: drive a true `RAX`–`R15` machine with action buttons (push/pop, call/return, prologue/alloc/leave, and free-form execute), with a live call-chain, undo, and scenarios. Because it is genuinely 64-bit (built on `BigInt`), the real rules hold — a 32-bit write like `mov eax, 1` zeroes the upper half of `RAX`.

The stack playground has four modes (Explore, Step-Through, Puzzle, Errors) and tracks nested frames with color-coded borders and a `main → caller → current` call-chain overview. A register quiz game generates random problems across three difficulty levels with scoring, streaks, and best-record memory. Twenty-seven tutorial sections cover fundamentals through advanced topics — calling conventions, structs, floating point, dynamic memory, reading real disassembly, XOR deobfuscation, a keygen-reversing capstone, and x64 differences — each with mini-simulators and practice challenges.

▶ **[Live demo](https://Real-Fruit-Snacks.github.io/x86-assembly-lab/)**

---

## §2 / Specs

| KEY        | VALUE                                                                       |
|------------|-----------------------------------------------------------------------------|
| 32-BIT SIM | EAX–EDX with sub-registers (AL/AH/AX) · ESI · EDI · EBP · ESP · ZF/CF/SF/OF |
| 64-BIT SIM | RAX–RDX/RSI/RDI/RBP/RSP + R8–R15, with 32/16/8-bit sub-registers · BigInt-exact · 32-bit-write-zeroes-upper-half |
| INSTRUCTIONS | MOV(SX/ZX), arithmetic, bitwise, shifts/rotates, MUL/IMUL/DIV/IDIV, CBW/CWD/CWDE/CDQ, stack/branch/call/ret |
| TUTORIALS  | **27 sections** · 33 interactive mini-simulators · before/after snapshots  |
| TOOLS      | **7 interactive** · instruction reference · number / bitwise / endianness · ASCII · flags · address calc |
| STACK MODES | Explore · Step-Through · Puzzle · Errors                                   |
| x64 PLAYGROUND | Button-driven · 5 scenarios · live call-chain · undo · free-form execute |
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
SUPPORTED INSTRUCTIONS (32-bit engine)

  MOV, MOVSX, MOVZX, ADD, SUB, INC, DEC, NEG, XCHG, LEA
  AND, OR, XOR, NOT, TEST, CMP
  SHL, SHR, SAR, ROL, ROR, MUL, IMUL, DIV, IDIV
  CBW, CWD, CWDE, CDQ
  PUSH, POP, CALL, RET, LEAVE, NOP
  JMP, JE, JNE, JB, JBE, JA, JAE, JL, JLE, JG, JGE, JS, JNS, JO, JNO
  (+ all aliases: JZ, JNZ, JNA, JNBE, SAL, RETN, etc.)

SUPPORTED INSTRUCTIONS (64-bit engine)

  MOV, MOVSX, MOVSXD, MOVZX, LEA, XCHG
  ADD, SUB, INC, DEC, NEG
  MUL, IMUL (1-operand, plus 2- and 3-operand IMUL), DIV, IDIV
  CDQE, CQO
  AND, OR, XOR, NOT, TEST, CMP
  SHL, SHR, SAR, ROL, ROR
  PUSH, POP, CALL, RET, LEAVE, NOP, JMP + full Jcc family

INPUT FORMATS

  Decimal         mov eax, 42          mov eax, -5
  Hex (0x)        mov eax, 0xFF        mov eax, -0xFF
  Hex (IDA)       mov eax, 0FFh        mov eax, 0Ch
  Hex (address)   mov eax, [004940d8]
  Binary          mov al, 0b11001100   mov al, 11001100b
  Character       mov al, 'A'
  IDA vars        mov eax, [ebp+var_4]
  IDA args        mov eax, [ebp+arg_0]
  Memory          mov dword ptr [ebp-8], 45
  Segment prefix  mov edx, dword ptr ss:[ebp-4]

REGISTER QUIZ

  Easy   (1 pt)   2-4 instructions, MOV/ADD/SUB/INC/DEC/NEG/XCHG
  Medium (2 pt)  4-6 instructions, adds MUL/DIV/shifts/AND/OR/XOR/NOT
  Hard   (3 pt)  6-10 instructions, chained IMUL/DIV/remainder tracking

STACK PLAYGROUND MODES (32-bit)

  Explore         7 action buttons + preset scenarios + free EXECUTE
  Step-Through    Guided walkthroughs (call, prologue/epilogue, args, locals, LIFO)
  Puzzle          Random stack-state predictions with scoring + streaks
  Errors          Common stack bugs explained step-by-step

x64 PLAYGROUND (64-bit)

  Actions         PUSH / POP / CALL / RET / PROLOGUE / ALLOC / LEAVE / EXECUTE
  Scenarios       Empty · Three pushed · Inside a frame · Two calls deep · Ready to divide
  Live views      16 registers · flags · stack diagram · main → f → g call-chain
  Extras          Undo last action · DEC/HEX/BIN toggle · quick-try chips

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
  index.html            Single-page app with 39 sections
  style.css             Catppuccin Mocha theme + custom scrollbars
  simulator.js          32-bit x86 engine: registers, flags, memory, stack, branches
  app.js                32-bit UI: sandbox, stack playground, quiz, mini-sims, tools
  simulator64.js        64-bit x86-64 engine (BigInt): RAX–R15, sub-registers, flags, stack
  app64.js              x64 Playground UI: button-driven actions, scenarios, undo, call-chain
  docs/assets/          Dark + light logo SVGs
```

| Layer        | Implementation                                                  |
|--------------|-----------------------------------------------------------------|
| **32-bit engine** | Hand-rolled parser + evaluator over registers/flags/memory; JS-number values |
| **64-bit engine** | Parallel `BigInt`-based engine for exact 64-bit width and x64 sub-register rules |
| **Frames**   | Per-frame EBP/RBP anchor · `argBoundary` cell assignment · frame-relative labels |
| **Disasm notation** | `var_N` → `[ebp-N]` · `arg_N` → `[ebp+N+8]` · `h`-suffix and bare hex · `ss:`/`ds:` segment prefixes |
| **UI**      | Vanilla DOM · responsive · sidebar collapses · 32-bit state persists in localStorage |
| **Deploy**   | Static · single repo · `index.html` + 5 sibling files · GitHub Pages workflow |

**Key patterns:** No framework. Each simulator engine is a pure function from `(state, instruction)` to `state`, which makes step-through, the playgrounds, puzzles, and quizzes share one source of truth per engine. Every example, walkthrough, mini-sim, and quiz round runs through the same engine. The 64-bit engine is deliberately separate (`simulator64.js` / `app64.js`) so the 64-bit work carries zero regression risk to the 32-bit lab, while keeping the no-build, no-dependency model — it is just two more `<script>` tags.

---

[License: MIT](LICENSE) · Part of [Real-Fruit-Snacks](https://github.com/Real-Fruit-Snacks) — building offensive security tools, one wave at a time.