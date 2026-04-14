<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="x86 Assembly Learning Lab" src="docs/assets/logo-dark.svg" width="520">
</picture>

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Theme](https://img.shields.io/badge/theme-Catppuccin%20Mocha-cba6f7)
![Platform](https://img.shields.io/badge/platform-Browser-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**Interactive x86 assembly simulator and learning lab**

A complete browser-based environment for learning x86: step-through simulator, visual stack playground with
nested frame tracking, register quiz game, fundamentals tutorials, and a full suite of reference tools. No
backend, no build step, no dependencies.

</div>

---

## Quick Start

### GitHub Pages

Visit the live site: **https://Real-Fruit-Snacks.github.io/x86-assembly-lab/**

### Run Locally

No build step, no dependencies. Open the HTML file directly or serve it:

```bash
# Option 1: Open directly
open index.html

# Option 2: Local server
python -m http.server 3456
# → http://localhost:3456

# Option 3: Node
npx serve . -l 3456
```

---

## Features

### Sandbox Simulator

Paste any x86 assembly and step through it. Full support for labels, branches, loops, function calls, memory operations, and IDA-style notation. Registers, flags, and memory update in real time with DEC/HEX/BIN display modes. 23 built-in examples organized by category with teaching comments.

```
Supported instructions:
  MOV, ADD, SUB, INC, DEC, NEG, XCHG, LEA
  AND, OR, XOR, NOT, TEST, CMP
  SHL, SHR, SAR, MUL, IMUL, DIV, IDIV, CDQ
  PUSH, POP, CALL, RET, LEAVE, NOP
  JMP, JE, JNE, JB, JBE, JA, JAE, JL, JLE, JG, JGE
  (+ all aliases: JZ, JNZ, JNA, JNBE, SAL, RETN, etc.)
```

A searchable always-visible reference panel below the code explains every register and flag.

### Stack Playground

Four modes for learning how the stack actually works, with full support for nested function calls and frame-relative labels.

```
Explore       Visual stack with 7 action buttons (PUSH, POP, CALL, RET,
              PROLOGUE, ALLOC, LEAVE), 6 preset scenarios, quick-try chips,
              key-facts card, and an EXECUTE input that accepts any x86
              instruction from the sandbox

Step-Through  5 guided walkthroughs (full function call, prologue/epilogue,
              reading arguments, locals, LIFO) with prev/next navigation,
              progress bar, and per-step explanations

Puzzle        Random stack-state prediction puzzles with scoring and
              streak tracking

Errors        6 common stack bugs explained step-by-step (unbalanced POP,
              missing prologue, missing caller cleanup, RET without return
              address, LEAVE without frame, stack overflow)
```

Each cell is automatically labeled with its frame-relative `[ebp±N]` address and semantic meaning ("arg 2", "saved EBP", "return address", "local 1"). Nested call frames are visually separated with color-coded borders (current=blue, caller=mauve, deeper=green/peach/teal) and an always-visible call chain overview: `main → Stack1 → Stack2 (current)`. Values that look negative in two's complement display in signed form (e.g. `-5 (4294967291)`).

### Register Quiz

Game-ified practice with three difficulty levels. Random problems, scoring, streak tracking, best-record memory, and a per-question timer. Every answer accepted in decimal, hex (`0x...` or `...h`), or negative form.

```
Easy (1 pt)    2-4 instructions, MOV/ADD/SUB/INC/DEC/NEG/XCHG
Medium (2 pt)  4-6 instructions, adds MUL/DIV/shifts/AND/OR/XOR/NOT
Hard (3 pt)    6-10 instructions, chained IMUL/DIV/remainder tracking
```

### Input Format Support

Multiple number and notation formats accepted across all inputs:

```
Decimal:     mov eax, 42         mov eax, -5
Hex (0x):    mov eax, 0xFF       mov eax, -0xFF
Hex (IDA):   mov eax, 0FFh       mov eax, 0Ch
Binary:      mov al, 0b11001100  mov al, 11001100b
Character:   mov al, 'A'
IDA vars:    mov eax, [ebp+var_4]
IDA args:    mov eax, [ebp+arg_0]
Memory:      mov dword ptr [ebp-8], 45
```

### Typo Correction

Detects misspellings, English-word equivalents, and near-misses with suggestions:

```
"move eax, 10"    → Did you mean "mov"?
"subtract eax, 5" → Did you mean "sub"?
"swap eax, ebx"   → Did you mean "xchg"?
"xhcg eax, ebx"   → Did you mean "xchg"?  (fuzzy match via edit distance)
```

Missing operands and invalid registers produce clear error messages with usage examples.

### Tutorials

Thirteen learning sections with embedded mini-simulators you can step through inline.

```
Fundamentals:
  - Register Map        Complete sub-register diagram for all 8 GPRs
  - Two's Complement    Step-by-step negation, ranges, key patterns
  - Flags               ZF/CF/SF/OF, which instructions set them, CMP truth table
  - Memory & Data Sizes Addressing modes, dword ptr, IDA var_/arg_ notation

Instructions:
  - Arithmetic          MOV, ADD, SUB, INC, DEC, NEG, XCHG
  - Bitwise Logic       AND, OR, XOR, NOT, TEST with binary visualization
  - Multiply & Divide   MUL, IMUL, DIV, IDIV, CDQ with 16-bit variants
  - Shifts              SHL, SHR, SAR with signed vs unsigned comparison
  - Branching           CMP, flags, conditional jumps, branch tracing method
  - Stack & Functions   PUSH, POP, CALL, RET, stack frames, calling convention
  - Common Idioms       xor reg,reg, test+jnz, LEA math, CDQ+IDIV, prologue/epilogue

Analysis:
  - Functional Analysis How to read a function and describe it as f(a,b) = ...
  - Control Structures  If/else, loops, switch statements, jump tables
```

### Tools

```
Instruction Reference  Searchable lookup for every instruction
Number Converter       Decimal ↔ Hex ↔ Binary with signed/unsigned (8/16/32-bit)
Bitwise Calculator     Visualize AND, OR, XOR, NOT bit by bit with colored output
Endianness Guide       Interactive byte-order explorer with worksheet walkthrough
```

### UI Polish

- **Catppuccin Mocha theme** throughout, including custom scrollbars
- **Collapsible sidebar** to expand working area; state persists across reloads
- **Responsive layout** adapts down to mobile widths
- **Verbose MUL/DIV explanations** (e.g. "unsigned divide: EDX:EAX / ecx = 17÷5 = 3 remainder 2. Good practice: EDX was zeroed first")

---

## Architecture

```
Assembly/
├── index.html          # Single-page app with 21 sections
├── style.css           # Catppuccin Mocha theme with custom scrollbars
├── simulator.js        # x86 engine: registers, flags, memory, stack, branches
├── app.js              # UI: sandbox, playground, quiz, mini-sims, tools
├── docs/assets/        # Dark + light mode logo SVGs
└── README.md
```

Pure client-side HTML, CSS, and JavaScript. No framework, no build step, no dependencies. The simulator engine parses and executes x86 instructions directly in the browser with a register file, flag model, byte-addressable memory, label resolution, and branch evaluation.

### Simulator Capabilities

| Feature | Implementation |
|---------|---------------|
| Registers | EAX-EDX with 8/16-bit sub-registers (AL/AH/AX), ESI, EDI, EBP, ESP |
| Flags | ZF, CF, SF, OF with correct setting per instruction |
| Memory | Byte-addressable read/write with BYTE/WORD/DWORD sizing |
| Stack | ESP-based PUSH/POP backed by real memory |
| Branches | Label resolution, all conditional jumps, nested loops |
| Functions | CALL/RET with return address stack, LEAVE, nested calls |
| Frame tracking | Per-frame EBP anchor, argBoundary-based cell assignment, frame-relative labels |
| IDA Notation | `var_N` → `[ebp-N]`, `arg_N` → `[ebp+N+8]`, hex with `h` suffix |
| Error Handling | Typo detection, operand validation, infinite loop protection (10K steps) |

---

## Test Coverage

Automated test suite covering correctness, fuzz robustness, and every scenario/example end-to-end.

### Correctness (507 tests)

| Category | Tests |
|----------|------:|
| All 21 nav links + all 23 sandbox examples + every instruction type | 73 |
| Register Quiz: 15 rounds × 3 difficulties + wrong answers + hex input | 53 |
| Stack Playground all 4 modes: Explore, Step-Through, Puzzle, Errors | 96 |
| Deep nesting (3+ levels), full unwind, worksheet-level execution | 16 |
| Number Converter (8/16/32-bit), Bitwise Calc, Endianness, Reference search | 75 |
| Fuzz: garbage input, rapid clicks, empty state, edge cases | 194 |

### Scenario verification (203 tests)

| Scenario type | Count | Verified |
|--------------|------:|---------:|
| Sandbox examples | 23 | 23 |
| Explore mode scenarios | 6 | 6 |
| Step-Through walkthroughs | 5 | 5 |
| Error scenarios | 6 | 6 |
| Puzzle generations | 30 | 30 |
| Mini-simulators across tutorials | 11 | 11 |

Every example, scenario, walkthrough, and mini-simulator has been verified to produce the expected register/stack state.

---

## License

[MIT](LICENSE) -- Copyright 2026 Real-Fruit-Snacks
