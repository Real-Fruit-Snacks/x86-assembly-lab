<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="x86 Assembly Learning Lab" src="docs/assets/logo-dark.svg" width="520">
</picture>

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Platform](https://img.shields.io/badge/platform-Browser-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**Interactive x86 assembly simulator and learning companion for the ARE lab manual**

Step-by-step instruction execution, register visualization, branching with labels, stack and memory
operations, IDA-style notation, typo correction, number converter, bitwise calculator, and concept
tutorials. No backend required -- runs entirely in the browser.

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

Paste any x86 assembly and step through it instruction by instruction. Watch registers, flags, memory, and the stack update in real time. Supports labels, branches, loops, function calls, and IDA-style notation.

```
Supported instructions:
  MOV, ADD, SUB, INC, DEC, NEG, XCHG, LEA
  AND, OR, XOR, NOT, TEST, CMP
  SHL, SHR, SAR, MUL, IMUL, DIV, IDIV, CDQ
  PUSH, POP, CALL, RET, LEAVE
  JMP, JE, JNE, JB, JBE, JA, JAE, JL, JLE, JG, JGE
  (+ all aliases: JZ, JNZ, JNA, JNBE, SAL, RETN, etc.)
```

23 built-in examples organized by category with comments explaining each instruction. DEC, HEX, and BIN display modes for register values.

### Input Format Support

Multiple number and notation formats accepted in all inputs:

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

Detects misspellings and English-word equivalents with suggestions:

```
"move eax, 10"    → Did you mean "mov"?
"subtract eax, 5" → Did you mean "sub"?
"swap eax, ebx"   → Did you mean "xchg"?
"xhcg eax, ebx"   → Did you mean "xchg"?
```

Fuzzy matching via edit distance catches typos. Missing operands and invalid registers produce clear error messages with usage examples.

### Concept Tutorials

Six learning sections covering fundamentals with interactive mini-simulators:

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
```

### Tools

Four reference tools for working through assembly problems:

```
Instruction Reference  Searchable lookup for every instruction
Number Converter       Decimal ↔ Hex ↔ Binary with signed/unsigned (8/16/32-bit)
Bitwise Calculator     Visualize AND, OR, XOR, NOT bit by bit with colored output
Endianness Guide       Interactive byte-order explorer with worksheet walkthrough
```

---

## Architecture

```
Assembly/
├── index.html          # Single-page app with all 17 sections
├── style.css           # Dark theme styling
├── simulator.js        # x86 engine: registers, flags, memory, stack, branches
├── app.js              # UI: sandbox, mini-sims, tools, navigation
└── README.md
```

Pure client-side HTML, CSS, and JavaScript. No framework, no build step, no dependencies. The simulator engine parses and executes x86 instructions directly in the browser with a register file, flag model, byte-addressable memory, label resolution, and branch evaluation.

### Simulator Capabilities

| Feature | Implementation |
|---------|---------------|
| Registers | EAX-EDX with 8/16-bit sub-registers (AL/AH/AX), ESI, EDI, EBP, ESP |
| Flags | ZF, CF, SF, OF with correct setting per instruction |
| Memory | Byte-addressable read/write with BYTE/WORD/DWORD sizing |
| Stack | ESP-based PUSH/POP with real memory backing |
| Branches | Label resolution, all conditional jumps, nested loops |
| Functions | CALL/RET with return address stack, LEAVE |
| IDA Notation | `var_N` → `[ebp-N]`, `arg_N` → `[ebp+N+8]` |
| Error Handling | Typo detection, operand validation, infinite loop protection (10K steps) |

---

## Test Coverage

104 automated tests covering:

| Category | Tests |
|----------|------:|
| Arithmetic (MOV, ADD, SUB, INC, DEC, NEG, XCHG) | 20 |
| Bitwise Logic (AND, OR, XOR, NOT, TEST) | 8 |
| Multiply / Divide (MUL, IMUL, DIV, IDIV, CDQ) | 10 |
| Shifts (SHL, SHR, SAR) | 5 |
| Sub-registers (AL/AH/AX, 8-bit, 16-bit) | 8 |
| LEA (add, scale, complex expressions) | 4 |
| Branching (JBE, JA, JE, JNE, JNZ, nested loops) | 7 |
| Stack (PUSH, POP, CALL, RET, memory, LEAVE) | 6 |
| IDA Notation (var_N, arg_N, hex h suffix) | 4 |
| Input Formats (binary, char, neg hex, IDA hex) | 6 |
| Lab Manual Spot Checks (BasicMath1, BasicLogic1, AdvMath1) | 4 |
| Error Handling / Fuzz | 13 |
| Stress (1000-iteration loop) | 1 |
| Number Converter (8/16/32-bit boundaries) | 6 |
| Bitwise Calculator | 1 |
| Mini-Simulators (all 11) | 1 |

---

## License

[MIT](LICENSE) -- Copyright 2026 Real-Fruit-Snacks
