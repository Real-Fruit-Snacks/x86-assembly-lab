// ============================================================
// x86 Assembly Simulator Engine
// Supports: registers, flags, memory, stack, labels, branches
// ============================================================

class AsmSimulator {
    constructor() {
        this.reset();
    }

    reset() {
        this.regs = {};
        this.flags = { ZF: 0, CF: 0, SF: 0, OF: 0 };
        this.changed = new Set();
        this.changedMem = new Set();
        this.mem = {};          // addr (number) -> value (32-bit)
        this.labels = {};       // label name -> line index
        this.lines = [];        // all lines (raw)
        this.pc = 0;            // program counter (line index)
        this.jumpTarget = null; // set by branch instructions
        this.espInit = 0x0028FF80;
        this.regs['esp'] = this.espInit;
        this.regs['ebp'] = 0;
        this.callStack = [];    // return addresses for CALL/RET
    }

    // Load a program: parse labels, store lines
    loadProgram(code) {
        this.reset();
        this.lines = code.split('\n').map(l => l.trim());
        // Build label map
        this.labels = {};
        this.lines.forEach((line, i) => {
            const m = line.match(/^(\w+):$/);
            if (m) this.labels[m[1].toLowerCase()] = i;
            // Also handle "Label:" with trailing content on same line (rare)
            const m2 = line.match(/^(\w+):\s+(.+)/);
            if (m2) this.labels[m2[1].toLowerCase()] = i;
        });
        this.pc = 0;
    }

    // Step one instruction. Returns { lineIndex, description, error, branchTaken }
    step() {
        if (this.pc >= this.lines.length) return null;

        const lineIdx = this.pc;
        const line = this.lines[this.pc];
        this.jumpTarget = null;

        const result = this.execute(line);
        result.lineIndex = lineIdx;

        // Advance PC
        if (this.jumpTarget !== null) {
            result.branchTaken = true;
            this.pc = this.jumpTarget;
        } else {
            this.pc++;
        }

        // Skip labels, comments, empty lines automatically
        while (this.pc < this.lines.length) {
            const next = this.lines[this.pc].trim();
            if (!next || next.startsWith(';') || next.startsWith('#') || /^\w+:$/.test(next)) {
                this.pc++;
            } else break;
        }

        return result;
    }

    // --- Register access ---
    getReg(name) {
        name = name.toLowerCase();
        const sub = this._subReg(name);
        if (sub) {
            const full = (this.regs[sub.parent] || 0) >>> 0;
            return (full >> sub.shift) & sub.mask;
        }
        return (this.regs[name] || 0) >>> 0;
    }

    setReg(name, val) {
        name = name.toLowerCase();
        this.changed.add(name);
        const sub = this._subReg(name);
        if (sub) {
            const full = (this.regs[sub.parent] || 0) >>> 0;
            const cleared = full & ~(sub.mask << sub.shift);
            this.regs[sub.parent] = (cleared | ((val & sub.mask) << sub.shift)) >>> 0;
            this.changed.add(sub.parent);
            return;
        }
        this.regs[name] = val >>> 0;
    }

    _subReg(name) {
        const map = {
            al: { parent: 'eax', shift: 0, mask: 0xFF },
            ah: { parent: 'eax', shift: 8, mask: 0xFF },
            ax: { parent: 'eax', shift: 0, mask: 0xFFFF },
            bl: { parent: 'ebx', shift: 0, mask: 0xFF },
            bh: { parent: 'ebx', shift: 8, mask: 0xFF },
            bx: { parent: 'ebx', shift: 0, mask: 0xFFFF },
            cl: { parent: 'ecx', shift: 0, mask: 0xFF },
            ch: { parent: 'ecx', shift: 8, mask: 0xFF },
            cx: { parent: 'ecx', shift: 0, mask: 0xFFFF },
            dl: { parent: 'edx', shift: 0, mask: 0xFF },
            dh: { parent: 'edx', shift: 8, mask: 0xFF },
            dx: { parent: 'edx', shift: 0, mask: 0xFFFF },
        };
        return map[name] || null;
    }

    regBits(name) {
        name = name.toLowerCase();
        if (/^[abcd]l$|^[abcd]h$/.test(name)) return 8;
        if (/^[abcd]x$/.test(name) && name.length === 2) return 16;
        return 32;
    }

    mask(bits) { return bits === 8 ? 0xFF : bits === 16 ? 0xFFFF : 0xFFFFFFFF; }

    toSigned(val, bits) {
        const m = this.mask(bits);
        val = (val & m) >>> 0;
        const signBit = 2 ** (bits - 1);
        return val >= signBit ? val - 2 ** bits : val;
    }

    fromSigned(val, bits) {
        return val < 0 ? (val + 2 ** bits) >>> 0 : val >>> 0;
    }

    // --- Memory access ---
    getMem(addr, size) {
        // size: 1=byte, 2=word, 4=dword
        addr = addr >>> 0;
        let val = 0;
        for (let i = 0; i < size; i++) {
            val |= ((this.mem[addr + i] || 0) & 0xFF) << (i * 8);
        }
        return val >>> 0;
    }

    setMem(addr, val, size) {
        addr = addr >>> 0;
        for (let i = 0; i < size; i++) {
            this.mem[addr + i] = (val >> (i * 8)) & 0xFF;
        }
        this.changedMem.add(addr);
    }

    // Parse a memory operand like [ebp-4], [eax+ecx*4+8], dword ptr [ebp-8]
    _parseMemOperand(op) {
        // Strip size prefix
        let size = 4; // default dword
        let expr = op;
        const sizeMatch = op.match(/^(byte|word|dword|qword)\s+ptr\s+/i);
        if (sizeMatch) {
            const s = sizeMatch[1].toLowerCase();
            size = s === 'byte' ? 1 : s === 'word' ? 2 : s === 'dword' ? 4 : 8;
            expr = op.slice(sizeMatch[0].length);
        }
        // Must have brackets
        const bracketMatch = expr.match(/^\[(.+)\]$/);
        if (!bracketMatch) return null;
        const inner = bracketMatch[1];
        const addr = this._evalLeaExpr(inner);
        if (addr === null) return null;
        return { addr: addr >>> 0, size };
    }

    isMemOperand(op) {
        if (!op) return false;
        const stripped = op.replace(/^(byte|word|dword|qword)\s+ptr\s+/i, '');
        return /^\[.+\]$/.test(stripped.trim());
    }

    // Check if operand looks like a standalone IDA var reference without brackets
    // e.g., [ebp+var_4] is already handled, but some IDA output uses them

    // --- Format values for display ---
    formatVal(val, bits, fmt) {
        const m = this.mask(bits);
        val = (val & m) >>> 0;
        if (fmt === 'hex') return '0x' + val.toString(16).toUpperCase().padStart(bits / 4, '0');
        if (fmt === 'bin') return val.toString(2).padStart(bits, '0');
        const s = this.toSigned(val, bits);
        return s < 0 ? `${s} (${val})` : String(val);
    }

    // --- Operand parsing ---
    parseVal(token) {
        if (!token) return null;
        token = token.trim().replace(/,/g, '');
        if (!token) return null;

        // Decimal: 42, -5
        if (/^-?\d+$/.test(token)) return parseInt(token);

        // Hex with 0x prefix: 0xFF, -0xFF
        if (/^-?0x[0-9a-fA-F]+$/i.test(token)) {
            const neg = token.startsWith('-');
            return neg ? -parseInt(token.slice(1), 16) : parseInt(token, 16);
        }

        // IDA-style hex with h suffix: 0FFh, 10h, 0FFFFFFBFh
        if (/^-?[0-9][0-9a-fA-F]*h$/i.test(token)) {
            const neg = token.startsWith('-');
            const hex = neg ? token.slice(1, -1) : token.slice(0, -1);
            return neg ? -parseInt(hex, 16) : parseInt(hex, 16);
        }

        // Binary with 0b prefix: 0b11001100
        if (/^-?0b[01]+$/i.test(token)) {
            const neg = token.startsWith('-');
            return neg ? -parseInt(token.slice(3), 2) : parseInt(token.slice(2), 2);
        }

        // Binary with b suffix (NASM style): 11001100b
        if (/^[01]+b$/i.test(token)) {
            return parseInt(token.slice(0, -1), 2);
        }

        // Character literal: 'A' or "A"
        if (/^['"][^'"]['"]$/.test(token)) {
            return token.charCodeAt(1);
        }

        // Hex literal like 0Ch (IDA uses this for small values)
        if (/^0[0-9a-fA-F]+h$/i.test(token)) {
            return parseInt(token.slice(0, -1), 16);
        }

        if (this.isReg(token)) return this.getReg(token);

        // Memory operand
        if (this.isMemOperand(token)) {
            const m = this._parseMemOperand(token);
            if (m) return this.getMem(m.addr, m.size);
        }
        return null;
    }

    // Read a source operand (register, immediate, or memory)
    readOperand(token) {
        return this.parseVal(token);
    }

    // Write to a destination (register or memory)
    writeOperand(dest, val, bits) {
        if (this.isMemOperand(dest)) {
            const m = this._parseMemOperand(dest);
            if (m) {
                this.setMem(m.addr, val, m.size);
                return `[${m.addr.toString(16)}]`;
            }
        }
        if (this.isReg(dest)) {
            bits = bits || this.regBits(dest);
            this.setReg(dest, val & this.mask(bits));
            return dest;
        }
        return '?';
    }

    isReg(token) {
        if (!token) return false;
        token = token.trim().replace(/,/g, '').toLowerCase();
        return /^(e?(ax|bx|cx|dx|si|di|bp|sp)|[abcd][lhx])$/.test(token);
    }

    isValidDest(token) {
        return this.isReg(token) || this.isMemOperand(token);
    }

    // --- Main execute ---
    execute(line) {
        this.changed = new Set();
        this.changedMem = new Set();
        line = line.trim();

        // Skip empty, comments, labels
        if (!line || line.startsWith(';') || line.startsWith('#')) {
            return { description: '', changedRegs: [] };
        }
        // Label on its own line
        if (/^\w+:$/.test(line)) {
            return { description: `label: ${line}`, changedRegs: [] };
        }
        // Label followed by instruction (strip label)
        const labelMatch = line.match(/^\w+:\s+(.+)/);
        if (labelMatch) line = labelMatch[1].trim();

        // Remove inline comments
        const commentIdx = line.indexOf(';');
        if (commentIdx > 0) line = line.substring(0, commentIdx).trim();

        // Strip "short" keyword from jumps
        line = line.replace(/\bshort\s+/gi, '');
        // Strip "dword ptr" from operand for instruction parsing but preserve in operand
        // (handled inside parseVal/writeOperand)

        const parts = line.match(/^(\w+)\s*(.*)/);
        if (!parts) return { description: 'Unknown', changedRegs: [] };

        let op = parts[1].toLowerCase();
        // Split operands carefully - don't split inside brackets
        const operands = this._splitOperands(parts[2] || '');

        let desc = '';

        // Typo correction
        const correction = this._correctOpcode(op);
        if (correction) {
            return { description: correction, changedRegs: [], error: true };
        }

        // Operand count validation
        const needsOps = {
            mov:2, movsx:2, movzx:2, add:2, sub:2, and:2, or:2, xor:2, cmp:2, test:2, shl:2, sal:2, shr:2, sar:2, rol:2, ror:2,
            inc:1, dec:1, neg:1, not:1, mul:1, div:1, imul:1, idiv:1,
            xchg:2, lea:2, push:1, pop:1,
            nop:0, cdq:0, ret:0,
        };
        const minOps = needsOps[op];
        if (minOps !== undefined && operands.filter(o => o && o.trim()).length < minOps) {
            return { description: `"${op}" requires ${minOps} operand${minOps !== 1 ? 's' : ''} (e.g., ${this._exampleFor(op)})`, changedRegs: [], error: true };
        }

        // Dest validation for instructions that write to a register or memory
        const writesDest = ['mov','movsx','movzx','add','sub','inc','dec','neg','not','and','or','xor','shl','sal','shr','sar','rol','ror','xchg','lea','pop'];
        if (writesDest.includes(op) && operands[0] && !this.isValidDest(operands[0])) {
            return { description: `"${operands[0]}" is not a valid register or memory operand. Valid registers: EAX, EBX, ECX, EDX, ESI, EDI, EBP, ESP, AL-DL, AH-DH, AX-DX. Memory: [ebp-4], dword ptr [eax]`, changedRegs: [], error: true };
        }

        // Source validation for 2-operand instructions
        const needs2 = ['mov','movsx','movzx','add','sub','and','or','xor','cmp','test','shl','shr','sar','sal','rol','ror','xchg'];
        if (needs2.includes(op) && operands[1] !== undefined) {
            const srcVal = this.readOperand(operands[1]);
            if (srcVal === null && op !== 'lea') {
                return { description: `Cannot parse "${operands[1]}" as a register, number, or memory operand. Supported formats: 42, -5, 0xFF, 0FFh, 0b1010, 'A', [ebp-4]`, changedRegs: [], error: true };
            }
        }

        try {
            switch (op) {
                case 'mov': {
                    const dest = operands[0];
                    const val = this.readOperand(operands[1]);
                    const target = this.writeOperand(dest, val);
                    desc = `${target} = ${val >>> 0}`;
                    break;
                }
                case 'add': {
                    const dest = operands[0];
                    const a = this.readOperand(dest);
                    const b = this.readOperand(operands[1]);
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const result = a + b;
                    this.writeOperand(dest, result, bits);
                    this._setFlags(result, bits);
                    desc = `${dest} = ${a} + ${b} = ${(result & this.mask(bits)) >>> 0}`;
                    break;
                }
                case 'sub': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const a = this.readOperand(dest);
                    const b = this.readOperand(operands[1]);
                    const result = a - b;
                    this.writeOperand(dest, result, bits);
                    this._setFlags(result, bits);
                    this.flags.CF = (a >>> 0) < (b >>> 0) ? 1 : 0;
                    desc = `${dest} = ${a} - ${b} = ${this.toSigned((result & this.mask(bits)) >>> 0, bits)}`;
                    break;
                }
                case 'inc': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const val = this.readOperand(dest) + 1;
                    this.writeOperand(dest, val, bits);
                    this._setFlags(val, bits);
                    desc = `${dest} = ${(val & this.mask(bits)) >>> 0}`;
                    break;
                }
                case 'dec': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const val = this.readOperand(dest) - 1;
                    this.writeOperand(dest, val, bits);
                    this._setFlags(val, bits);
                    desc = `${dest} = ${this.toSigned((val & this.mask(bits)) >>> 0, bits)}`;
                    break;
                }
                case 'neg': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const old = this.toSigned(this.readOperand(dest), bits);
                    const result = -old;
                    this.writeOperand(dest, this.fromSigned(result, bits), bits);
                    this._setFlags(result, bits);
                    desc = `${dest} = -${old} = ${result}`;
                    break;
                }
                case 'xchg': {
                    const a = operands[0], b = operands[1];
                    const va = this.readOperand(a), vb = this.readOperand(b);
                    this.writeOperand(a, vb); this.writeOperand(b, va);
                    desc = `${a}=${vb}, ${b}=${va}`;
                    break;
                }
                case 'and': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const result = this.readOperand(dest) & this.readOperand(operands[1]);
                    this.writeOperand(dest, result, bits);
                    this._setFlags(result, bits);
                    desc = `${dest} = ${(result & this.mask(bits)) >>> 0}`;
                    break;
                }
                case 'or': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const result = this.readOperand(dest) | this.readOperand(operands[1]);
                    this.writeOperand(dest, result & this.mask(bits), bits);
                    this._setFlags(result, bits);
                    desc = `${dest} = ${(result & this.mask(bits)) >>> 0}`;
                    break;
                }
                case 'xor': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const result = this.readOperand(dest) ^ this.readOperand(operands[1]);
                    this.writeOperand(dest, result & this.mask(bits), bits);
                    this._setFlags(result, bits);
                    desc = `${dest} = ${(result & this.mask(bits)) >>> 0}`;
                    break;
                }
                case 'not': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const result = ~this.readOperand(dest) & this.mask(bits);
                    this.writeOperand(dest, result, bits);
                    desc = `${dest} = ${result}`;
                    break;
                }
                case 'test': {
                    const bits = this.isReg(operands[0]) ? this.regBits(operands[0]) : 32;
                    const result = this.readOperand(operands[0]) & this.readOperand(operands[1]);
                    this._setFlags(result, bits);
                    desc = `flags: ZF=${this.flags.ZF}, SF=${this.flags.SF}`;
                    break;
                }
                case 'cmp': {
                    const bits = this.isReg(operands[0]) ? this.regBits(operands[0]) : 32;
                    const a = this.readOperand(operands[0]);
                    const b = this.readOperand(operands[1]);
                    const result = a - b;
                    this._setFlags(result, bits);
                    this.flags.CF = (a >>> 0) < (b >>> 0) ? 1 : 0;
                    // Set OF for signed comparison
                    const sa = this.toSigned(a, bits), sb = this.toSigned(b, bits);
                    const sr = this.toSigned((result & this.mask(bits)) >>> 0, bits);
                    this.flags.OF = ((sa > 0 && sb < 0 && sr < 0) || (sa < 0 && sb > 0 && sr > 0)) ? 1 : 0;
                    desc = `${a} - ${b} = ${result} | ZF=${this.flags.ZF} CF=${this.flags.CF} SF=${this.flags.SF}`;
                    break;
                }
                case 'shl': case 'sal': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const count = this.readOperand(operands[1]);
                    const result = (this.readOperand(dest) << count) & this.mask(bits);
                    this.writeOperand(dest, result, bits);
                    desc = `${dest} = ${result} (x${2**count})`;
                    break;
                }
                case 'shr': {
                    const dest = operands[0];
                    const count = this.readOperand(operands[1]);
                    const result = this.readOperand(dest) >>> count;
                    this.writeOperand(dest, result);
                    desc = `${dest} = ${result} (/${2**count})`;
                    break;
                }
                case 'sar': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const count = this.readOperand(operands[1]);
                    const signed = this.toSigned(this.readOperand(dest), bits);
                    const result = signed >> count;
                    this.writeOperand(dest, this.fromSigned(result, bits), bits);
                    desc = `${dest} = ${result} (signed /${2**count})`;
                    break;
                }
                case 'rol': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const count = this.readOperand(operands[1]) & 0x1F;
                    const mask = (2 ** bits) - 1;
                    let val = this.readOperand(dest) & mask;
                    for (let i = 0; i < count; i++) {
                        const msb = (val >> (bits - 1)) & 1;
                        val = ((val << 1) | msb) & mask;
                    }
                    this.writeOperand(dest, val, bits);
                    const cf = val & 1;
                    desc = `rotate left ${count}: ${dest} = ${val}. Each bit shifts left; the top bit wraps around to the bottom. CF = ${cf}`;
                    break;
                }
                case 'ror': {
                    const dest = operands[0];
                    const bits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const count = this.readOperand(operands[1]) & 0x1F;
                    const mask = (2 ** bits) - 1;
                    let val = this.readOperand(dest) & mask;
                    for (let i = 0; i < count; i++) {
                        const lsb = val & 1;
                        val = ((val >>> 1) | (lsb << (bits - 1))) & mask;
                    }
                    this.writeOperand(dest, val, bits);
                    const cf = (val >> (bits - 1)) & 1;
                    desc = `rotate right ${count}: ${dest} = ${val}. Each bit shifts right; the bottom bit wraps around to the top. CF = ${cf}`;
                    break;
                }
                case 'mul': {
                    const src = operands[0];
                    const bits = this.isReg(src) ? this.regBits(src) : 32;
                    if (bits === 16) {
                        const axBefore = this.getReg('ax');
                        const dxBefore = this.getReg('dx');
                        const srcVal = this.readOperand(src);
                        const result = axBefore * srcVal;
                        const newAx = result & 0xFFFF;
                        const newDx = (result >> 16) & 0xFFFF;
                        this.setReg('ax', newAx);
                        this.setReg('dx', newDx);
                        desc = `unsigned multiply: DX:AX = AX * ${src} = ${axBefore} * ${srcVal} = ${result}. ` +
                               `Low 16 bits → AX = ${newAx}; high 16 bits → DX = ${newDx}` +
                               (dxBefore !== newDx ? ` (DX was ${dxBefore}, now clobbered)` : '');
                    } else {
                        const eaxBefore = this.getReg('eax');
                        const edxBefore = this.getReg('edx');
                        const srcVal = this.readOperand(src);
                        const result = eaxBefore * srcVal;
                        const newEax = result & 0xFFFFFFFF;
                        const newEdx = Math.floor(result / 0x100000000);
                        this.setReg('eax', newEax);
                        this.setReg('edx', newEdx);
                        desc = `unsigned multiply: EDX:EAX = EAX * ${src} = ${eaxBefore} * ${srcVal} = ${result}. ` +
                               `Low 32 bits → EAX = ${newEax}; high 32 bits → EDX = ${newEdx}` +
                               (newEdx === 0 ? ' (result fit in 32 bits)' : ' (result overflowed 32 bits; EDX holds the upper half)') +
                               (edxBefore !== newEdx ? `. Note: MUL always overwrites EDX` : '');
                    }
                    break;
                }
                case 'imul': {
                    if (operands.length === 3) {
                        const dest = operands[0], bits = this.regBits(dest);
                        const a = this.toSigned(this.readOperand(operands[1]), bits);
                        const b = parseInt(operands[2]);
                        const result = a * b;
                        this.setReg(dest, this.fromSigned(result, bits));
                        desc = `signed multiply (3-operand form): ${dest} = ${operands[1]} * ${operands[2]} = ${a} * ${b} = ${result}. ` +
                               `Unlike 1-operand MUL/IMUL, this form does NOT touch EDX.`;
                    } else if (operands.length === 2) {
                        const dest = operands[0], bits = this.regBits(dest);
                        const a = this.toSigned(this.getReg(dest), bits);
                        const b = this.toSigned(this.readOperand(operands[1]), bits);
                        const result = a * b;
                        this.setReg(dest, this.fromSigned(result, bits));
                        desc = `signed multiply (2-operand form): ${dest} = ${dest} * ${operands[1]} = ${a} * ${b} = ${result}. ` +
                               `Does NOT touch EDX.`;
                    } else {
                        const src = operands[0], bits = this.regBits(src);
                        if (bits === 16) {
                            const a = this.toSigned(this.getReg('ax'),16), b = this.toSigned(this.getReg(src),16);
                            const result = a*b;
                            this.setReg('ax', result & 0xFFFF);
                            this.setReg('dx', (result >> 16) & 0xFFFF);
                            desc = `signed multiply (1-operand form): DX:AX = AX * ${src} = ${a} * ${b} = ${result}. ` +
                                   `Low 16 bits → AX; high 16 bits → DX (clobbered).`;
                        } else {
                            const a = this.toSigned(this.getReg('eax'),32), b = this.toSigned(this.readOperand(src),32);
                            const result = a*b;
                            const newEax = result & 0xFFFFFFFF;
                            const signExt = result < 0 ? '0xFFFFFFFF' : '0';
                            this.setReg('eax', newEax);
                            this.setReg('edx', result < 0 ? 0xFFFFFFFF : 0);
                            desc = `signed multiply (1-operand form): EDX:EAX = EAX * ${src} = ${a} * ${b} = ${result}. ` +
                                   `Low 32 bits → EAX; EDX is set to ${signExt} (sign-extension of result). ` +
                                   `Note: 1-operand IMUL clobbers EDX (just like MUL).`;
                        }
                    }
                    break;
                }
                case 'div': {
                    const src = operands[0], bits = this.isReg(src) ? this.regBits(src) : 32;
                    const divisor = this.readOperand(src);
                    if (divisor === 0) { desc = 'DIVIDE BY ZERO EXCEPTION — in a real program, this would crash with a #DE fault.'; break; }
                    if (bits === 16) {
                        const dxBefore = this.getReg('dx');
                        const axBefore = this.getReg('ax');
                        const dividend = (dxBefore << 16) | axBefore;
                        const q = Math.floor(dividend / divisor), r = dividend % divisor;
                        this.setReg('ax', q);
                        this.setReg('dx', r);
                        desc = `unsigned divide: DX:AX / ${src} = (DX=${dxBefore}):(AX=${axBefore}) = ${dividend} ÷ ${divisor} = ${q} remainder ${r}. ` +
                               `Quotient → AX = ${q}; remainder → DX = ${r}. ` +
                               (dxBefore !== 0 ? 'Note: DX was used as the high half of the dividend.' : 'DX=0 means the dividend was effectively just AX.');
                    } else {
                        const edxBefore = this.getReg('edx');
                        const eaxBefore = this.getReg('eax');
                        const dividend = edxBefore * 0x100000000 + eaxBefore;
                        const q = Math.floor(dividend / divisor), r = dividend % divisor;
                        this.setReg('eax', q); this.setReg('edx', r);
                        desc = `unsigned divide: EDX:EAX / ${src} = (EDX=${edxBefore}):(EAX=${eaxBefore}) treated as a 64-bit value = ${dividend} ÷ ${divisor} = ${q} remainder ${r}. ` +
                               `Quotient → EAX = ${q}; remainder → EDX = ${r}. ` +
                               (edxBefore === 0 ? 'Good practice: EDX was zeroed first (usually with xor edx, edx) so the dividend was effectively just EAX.' : 'Note: EDX was the high 32 bits of the dividend — make sure that was intentional, or zero it first with xor edx, edx.');
                    }
                    break;
                }
                case 'idiv': {
                    const src = operands[0], bits = this.isReg(src) ? this.regBits(src) : 32;
                    const divisor = this.toSigned(this.readOperand(src), bits);
                    if (divisor === 0) { desc = 'DIVIDE BY ZERO EXCEPTION — in a real program, this would crash with a #DE fault.'; break; }
                    let dividend;
                    const edxBefore = this.getReg('edx');
                    const eaxBefore = this.getReg('eax');
                    if (bits === 16) {
                        dividend = this.toSigned((this.getReg('dx')<<16)|this.getReg('ax'), 32);
                    } else {
                        const edxS = this.toSigned(edxBefore, 32);
                        if (edxS === 0) dividend = eaxBefore;
                        else if (edxS === -1) dividend = this.toSigned(eaxBefore, 32);
                        else dividend = edxS >= 0 ? edxS * 0x100000000 + eaxBefore : -((-edxS-1)*0x100000000+(0x100000000-eaxBefore));
                    }
                    const q = Math.trunc(dividend / divisor), r = dividend - q * divisor;
                    if (bits === 16) {
                        this.setReg('ax', this.fromSigned(q,16)); this.setReg('dx', this.fromSigned(r,16));
                        desc = `signed divide: DX:AX / ${src} = ${dividend} ÷ ${divisor} = ${q} remainder ${r}. ` +
                               `Quotient → AX; remainder → DX. Make sure you used CWD before this to sign-extend AX into DX.`;
                    } else {
                        this.setReg('eax', q >>> 0); this.setReg('edx', r >= 0 ? r : (r+0x100000000)>>>0);
                        const signNote = edxBefore === 0 ? 'EDX was 0 (dividend was positive).' :
                                         edxBefore === 0xFFFFFFFF ? 'EDX was 0xFFFFFFFF (all 1s = sign-extension of a negative EAX).' :
                                         'EDX was a non-standard value — make sure CDQ was used first.';
                        desc = `signed divide: EDX:EAX / ${src} = 64-bit dividend (EDX=${edxBefore} : EAX=${eaxBefore}) = ${dividend} ÷ ${divisor} = ${q} remainder ${r}. ` +
                               `Quotient → EAX; remainder → EDX. ${signNote} ` +
                               `IDIV requires CDQ beforehand to properly sign-extend EAX into EDX:EAX.`;
                    }
                    break;
                }
                case 'cdq': {
                    const eax = this.toSigned(this.getReg('eax'), 32);
                    const newEdx = eax < 0 ? 0xFFFFFFFF : 0;
                    this.setReg('edx', newEdx);
                    desc = `sign-extend EAX into EDX:EAX. EAX = ${eax} is ${eax < 0 ? 'negative' : 'non-negative'}, ` +
                           `so EDX is set to ${eax < 0 ? '0xFFFFFFFF (all 1s)' : '0'}. ` +
                           `Now EDX:EAX forms a valid 64-bit signed version of EAX, ready for IDIV.`;
                    break;
                }
                case 'lea': {
                    const dest = operands[0];
                    const expr = operands.slice(1).join(',').replace(/[\[\]]/g, '').trim();
                    const val = this._evalLeaExpr(expr);
                    if (val !== null) { this.setReg(dest, val >>> 0); desc = `${dest} = ${val}`; }
                    else desc = 'LEA: cannot parse';
                    break;
                }
                case 'movsx': {
                    const dest = operands[0], src = operands[1];
                    const srcBits = this.isReg(src) ? this.regBits(src) : (src.match(/byte/i) ? 8 : src.match(/word/i) ? 16 : 8);
                    const dstBits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const srcVal = this.readOperand(src);
                    const signed = this.toSigned(srcVal & ((1 << srcBits) - 1), srcBits);
                    const result = this.fromSigned(signed, dstBits);
                    this.writeOperand(dest, result);
                    desc = `sign-extend: ${dest} = ${src} sign-extended from ${srcBits}-bit to ${dstBits}-bit. ` +
                           `Value ${srcVal & ((1 << srcBits) - 1)} (${srcBits}-bit) = ${signed} (signed) → ${dest} = ${result >>> 0} (${this.toSigned(result, dstBits)} signed)`;
                    break;
                }
                case 'movzx': {
                    const dest = operands[0], src = operands[1];
                    const srcBits = this.isReg(src) ? this.regBits(src) : (src.match(/byte/i) ? 8 : src.match(/word/i) ? 16 : 8);
                    const dstBits = this.isReg(dest) ? this.regBits(dest) : 32;
                    const srcVal = this.readOperand(src);
                    const masked = srcVal & ((1 << srcBits) - 1);
                    this.writeOperand(dest, masked);
                    desc = `zero-extend: ${dest} = ${src} zero-extended from ${srcBits}-bit to ${dstBits}-bit. ` +
                           `Value ${masked} (${srcBits}-bit) → ${dest} = ${masked} (upper bits filled with zeros)`;
                    break;
                }
                // === Stack operations ===
                case 'push': {
                    const val = this.readOperand(operands[0]);
                    const esp = this.getReg('esp') - 4;
                    this.setReg('esp', esp);
                    this.setMem(esp, val, 4);
                    desc = `push ${val} -> [ESP=${esp.toString(16)}]`;
                    break;
                }
                case 'pop': {
                    const esp = this.getReg('esp');
                    const val = this.getMem(esp, 4);
                    this.writeOperand(operands[0], val);
                    this.setReg('esp', esp + 4);
                    desc = `pop ${operands[0]} = ${val} <- [ESP=${esp.toString(16)}]`;
                    break;
                }
                case 'call': {
                    const target = operands[0].trim().replace(/\bshort\s+/i, '').toLowerCase();
                    const labelIdx = this.labels[target];
                    if (labelIdx === undefined) { desc = `Unknown label: ${target}`; break; }
                    // Push return address (next instruction index)
                    const retAddr = this.pc + 1;
                    const esp = this.getReg('esp') - 4;
                    this.setReg('esp', esp);
                    this.setMem(esp, retAddr, 4); // store line index as "address"
                    this.callStack.push(retAddr);
                    this.jumpTarget = labelIdx;
                    desc = `call ${target} (return to line ${retAddr})`;
                    break;
                }
                case 'ret': case 'retn': {
                    const esp = this.getReg('esp');
                    const retAddr = this.getMem(esp, 4);
                    this.setReg('esp', esp + 4);
                    this.callStack.pop();
                    this.jumpTarget = retAddr;
                    desc = `ret -> line ${retAddr}`;
                    break;
                }
                case 'leave': {
                    this.setReg('esp', this.getReg('ebp'));
                    const esp = this.getReg('esp');
                    const val = this.getMem(esp, 4);
                    this.setReg('ebp', val);
                    this.setReg('esp', esp + 4);
                    desc = `leave: ESP=EBP, pop EBP=${val}`;
                    break;
                }
                // === Branch instructions ===
                case 'jmp': {
                    const target = operands[0].trim().replace(/\bshort\s+/i, '').toLowerCase();
                    const idx = this.labels[target];
                    if (idx === undefined) { desc = `Unknown label: ${target}`; break; }
                    this.jumpTarget = idx;
                    desc = `jmp ${target}`;
                    break;
                }
                case 'je': case 'jz': {
                    desc = this._condJump(operands[0], this.flags.ZF === 1, 'ZF=1');
                    break;
                }
                case 'jne': case 'jnz': {
                    desc = this._condJump(operands[0], this.flags.ZF === 0, 'ZF=0');
                    break;
                }
                case 'jb': case 'jnae': case 'jc': {
                    desc = this._condJump(operands[0], this.flags.CF === 1, 'CF=1');
                    break;
                }
                case 'jbe': case 'jna': {
                    desc = this._condJump(operands[0], this.flags.CF === 1 || this.flags.ZF === 1, 'CF=1 or ZF=1');
                    break;
                }
                case 'ja': case 'jnbe': {
                    desc = this._condJump(operands[0], this.flags.CF === 0 && this.flags.ZF === 0, 'CF=0 and ZF=0');
                    break;
                }
                case 'jae': case 'jnb': case 'jnc': {
                    desc = this._condJump(operands[0], this.flags.CF === 0, 'CF=0');
                    break;
                }
                case 'jl': case 'jnge': {
                    desc = this._condJump(operands[0], this.flags.SF !== this.flags.OF, 'SF!=OF');
                    break;
                }
                case 'jle': case 'jng': {
                    desc = this._condJump(operands[0], this.flags.ZF === 1 || this.flags.SF !== this.flags.OF, 'ZF=1 or SF!=OF');
                    break;
                }
                case 'jg': case 'jnle': {
                    desc = this._condJump(operands[0], this.flags.ZF === 0 && this.flags.SF === this.flags.OF, 'ZF=0 and SF=OF');
                    break;
                }
                case 'jge': case 'jnl': {
                    desc = this._condJump(operands[0], this.flags.SF === this.flags.OF, 'SF=OF');
                    break;
                }
                case 'js': {
                    desc = this._condJump(operands[0], this.flags.SF === 1, 'SF=1');
                    break;
                }
                case 'jns': {
                    desc = this._condJump(operands[0], this.flags.SF === 0, 'SF=0');
                    break;
                }
                case 'nop':
                    desc = '(no operation)';
                    break;
                default:
                    desc = `Unknown instruction: ${op}`;
            }
        } catch (e) {
            desc = `Error: ${e.message}`;
        }

        return { description: desc, changedRegs: [...this.changed] };
    }

    _condJump(operand, condition, condDesc) {
        const target = operand.trim().replace(/\bshort\s+/i, '').toLowerCase();
        const idx = this.labels[target];
        if (idx === undefined) return `Unknown label: ${target}`;
        if (condition) {
            this.jumpTarget = idx;
            return `TAKEN -> ${target} (${condDesc})`;
        }
        return `NOT TAKEN (${condDesc} is false)`;
    }

    _splitOperands(str) {
        // Split by commas but not inside brackets
        const result = [];
        let depth = 0, current = '';
        for (const ch of str) {
            if (ch === '[') depth++;
            if (ch === ']') depth--;
            if (ch === ',' && depth === 0) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) result.push(current.trim());
        return result;
    }

    _exampleFor(op) {
        const examples = {
            mov:'mov eax, 10', add:'add eax, 5', sub:'sub eax, ecx', inc:'inc eax', dec:'dec eax',
            neg:'neg eax', xchg:'xchg eax, ebx', and:'and al, dl', or:'or al, 0x0F', xor:'xor eax, eax',
            not:'not al', test:'test eax, eax', cmp:'cmp eax, 10', shl:'shl eax, 2', shr:'shr eax, 1',
            sar:'sar ecx, 1', mul:'mul ecx', div:'div ecx', imul:'imul eax, ecx', idiv:'idiv ecx',
            lea:'lea esi, [ecx+edi]', push:'push eax', pop:'pop ebx', call:'call func', cdq:'cdq', nop:'nop',
        };
        return examples[op] || op;
    }

    _correctOpcode(op) {
        const aliases = {
            'move':'mov','load':'mov','store':'mov','copy':'mov','set':'mov',
            'addition':'add','plus':'add',
            'subtract':'sub','minus':'sub','substract':'sub',
            'increment':'inc','increase':'inc',
            'decrement':'dec','decrease':'dec',
            'negate':'neg','negative':'neg',
            'swap':'xchg','exchange':'xchg','switch':'xchg',
            'multiply':'mul','mult':'mul','times':'mul',
            'divide':'div','division':'div',
            'compare':'cmp','comp':'cmp',
            'jump':'jmp','goto':'jmp',
            'shift':'shl','shiftleft':'shl','shiftright':'shr',
            'moc':'mov','mpv':'mov','moov':'mov',
            'ad':'add','aad':'add','addd':'add',
            'subb':'sub','su':'sub','sbu':'sub',
            'incc':'inc','ic':'inc',
            'decc':'dec','de':'dec',
            'negg':'neg',
            'xhcg':'xchg','xchng':'xchg','xcgh':'xchg','xhg':'xchg',
            'andd':'and','adn':'and',
            'orr':'or',
            'xorr':'xor','xo':'xor',
            'nott':'not','nt':'not',
            'tset':'test','tst':'test','tes':'test',
            'cmpp':'cmp','cpm':'cmp',
            'shll':'shl','slh':'shl',
            'shrr':'shr','srh':'shr',
            'sarr':'sar',
            'mull':'mul','mu':'mul',
            'imull':'imul','iml':'imul',
            'divv':'div','dvi':'div','idv':'idiv',
            'idivv':'idiv',
            'cdqq':'cdq',
            'leaa':'lea',
            'jmpp':'jmp','jum':'jmp',
        };

        const valid = new Set([
            'mov','movsx','movzx','add','sub','inc','dec','neg','xchg',
            'and','or','xor','not','test','cmp',
            'shl','sal','shr','sar','rol','ror',
            'mul','imul','div','idiv','cdq',
            'lea','nop','push','pop','call','ret','retn','leave',
            'jmp','je','jz','jne','jnz','jb','jnae','jbe','jna',
            'ja','jnbe','jae','jnb','jc','jnc',
            'jl','jnge','jle','jng','jg','jnle','jge','jnl','js','jns',
        ]);

        if (valid.has(op)) return null;
        const suggestion = aliases[op];
        if (suggestion) return `Did you mean "${suggestion}"? ("${op}" is not a valid x86 instruction)`;
        const close = this._findClosest(op, valid);
        if (close) return `Unknown instruction "${op}". Did you mean "${close}"?`;
        return `Unknown instruction: "${op}". Check spelling — x86 uses short mnemonics like mov, add, sub, etc.`;
    }

    _findClosest(input, validSet) {
        let best = null, bestDist = 3;
        for (const v of validSet) {
            const d = this._editDist(input, v);
            if (d < bestDist) { bestDist = d; best = v; }
        }
        return best;
    }

    _editDist(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const mx = [];
        for (let i = 0; i <= b.length; i++) mx[i] = [i];
        for (let j = 0; j <= a.length; j++) mx[0][j] = j;
        for (let i = 1; i <= b.length; i++)
            for (let j = 1; j <= a.length; j++)
                mx[i][j] = Math.min(mx[i-1][j]+1, mx[i][j-1]+1, mx[i-1][j-1]+(a[j-1]===b[i-1]?0:1));
        return mx[b.length][a.length];
    }

    _setFlags(result, bits) {
        const m = this.mask(bits);
        const wrapped = (result & m) >>> 0;
        this.flags.ZF = wrapped === 0 ? 1 : 0;
        this.flags.SF = (wrapped >> (bits - 1)) & 1;
    }

    _evalLeaExpr(expr) {
        let total = 0;
        // Resolve IDA variable names before tokenizing:
        // var_N  -> -N  (local variable at [ebp-N])
        // arg_N  -> N+8 (argument: +8 skips saved EBP and return address)
        expr = expr.replace(/\bvar_([0-9a-fA-F]+)\b/gi, (_, n) => '-' + parseInt(n, 16));
        expr = expr.replace(/\barg_([0-9a-fA-F]+)\b/gi, (_, n) => String(parseInt(n, 16) + 8));

        // Handle scale: reg*N
        const tokens = expr.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
        for (const t of tokens) {
            const scaleMatch = t.match(/^(\w+)\*(\d+)$/);
            if (scaleMatch && this.isReg(scaleMatch[1])) {
                total += this.getReg(scaleMatch[1]) * parseInt(scaleMatch[2]);
            } else if (this.isReg(t)) {
                total += this.getReg(t);
            } else {
                // Try parsing as number (decimal or hex with h suffix)
                let n;
                if (/^-?[0-9a-fA-F]+h$/i.test(t)) {
                    const neg = t.startsWith('-');
                    n = parseInt(neg ? t.slice(1, -1) : t.slice(0, -1), 16);
                    if (neg) n = -n;
                } else {
                    n = parseInt(t);
                }
                if (!isNaN(n)) total += n;
                else return null;
            }
        }
        return total;
    }

    getActiveRegs() {
        const order = ['eax','ebx','ecx','edx','esi','edi','ebp','esp'];
        return order.filter(r => this.regs[r] !== undefined);
    }

    // Get memory entries for display (stack area)
    getStackEntries() {
        const esp = this.getReg('esp');
        const ebp = this.getReg('ebp');
        const entries = [];
        // Show from ESP up to ESP+40 or initial ESP
        const top = Math.min(esp + 48, this.espInit + 4);
        for (let addr = esp; addr < top; addr += 4) {
            const val = this.getMem(addr, 4);
            let label = '';
            if (addr === esp) label = '<- ESP';
            if (addr === ebp && ebp !== 0) label += (label ? ' ' : '') + '<- EBP';
            entries.push({ addr, val, label });
        }
        return entries;
    }
}
