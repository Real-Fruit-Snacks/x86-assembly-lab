# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-04-13

### Added
- Sandbox simulator with step-by-step execution, register/flag/memory/stack visualization
- Full x86 instruction support: MOV, ADD, SUB, INC, DEC, NEG, XCHG, LEA, AND, OR, XOR, NOT, TEST, CMP, SHL, SHR, SAR, MUL, IMUL, DIV, IDIV, CDQ, PUSH, POP, CALL, RET, LEAVE, NOP
- All conditional jumps: JMP, JE, JNE, JB, JBE, JA, JAE, JL, JLE, JG, JGE (and aliases)
- Label parsing and branch execution with loop support
- Memory read/write with BYTE/WORD/DWORD sizing and `dword ptr` syntax
- Stack operations with ESP-based push/pop and real memory backing
- Function calls with CALL/RET return address tracking
- IDA-style notation: `var_N`, `arg_N`, hex `h` suffix
- Input formats: decimal, hex (0x and h suffix), binary (0b and b suffix), character literals
- Typo detection with English-word aliases and fuzzy edit-distance matching
- Operand validation with helpful error messages and usage examples
- 23 sandbox examples organized by category with comments
- DEC/HEX/BIN display toggle for register values
- Infinite loop protection (10,000 step limit)
- Learning sections: Register Map, Two's Complement, Flags, Memory & Data Sizes
- Instruction tutorials: Arithmetic, Bitwise Logic, Multiply & Divide, Shifts, Branching, Stack & Functions, Common Idioms
- Interactive mini-simulators embedded in each tutorial section
- Searchable Instruction Reference with all supported instructions
- Number Converter tool (decimal/hex/binary, signed/unsigned, 8/16/32-bit)
- Bitwise Calculator with color-coded bit visualization
- Endianness Guide with interactive byte-order explorer and worksheet walkthrough
- Complete sub-register map for all 8 general-purpose registers
- Dark theme UI with responsive sidebar navigation
- 104 automated tests covering all instructions, edge cases, and tools
