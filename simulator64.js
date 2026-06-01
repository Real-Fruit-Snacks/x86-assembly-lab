// ============================================================
// x86-64 Simulator Engine (64-bit, BigInt-based)
// Parallel to simulator.js. Mirrors its public API so the UI
// wiring is familiar: loadProgram / step / reset / execute /
// getReg / setReg / getActiveRegs / getStackEntries / toSigned.
// ============================================================

(function () {
const MASK64 = (1n << 64n) - 1n;

class AsmSimulator64 {
    constructor() { this.reset(); }

    reset() {
        const names = ['rax','rbx','rcx','rdx','rsi','rdi','rbp','rsp',
                       'r8','r9','r10','r11','r12','r13','r14','r15'];
        this.regs = {};
        names.forEach(n => this.regs[n] = 0n);
        this.rspInit = 0x1000000n;            // 16 MB: clean, room to grow down
        this.regs.rsp = this.rspInit;
        this.flags = { ZF: 0, CF: 0, SF: 0, OF: 0 };
        this.mem = new Map();                 // BigInt addr -> byte (Number 0..255)
        this.shown = new Set();               // registers the user has touched
        this.labels = {};
        this.lines = [];
        this.pc = 0;
        this.jumpTarget = null;
        this.changed = new Set();
        this.changedMem = new Set();
        this.finished = false;
    }

    // --- Program loading ---
    loadProgram(code) {
        this.reset();
        this.lines = code.split('\n');
        this.labels = {};
        this.lines.forEach((line, i) => {
            const m = line.trim().match(/^(\w+):/);
            if (m) this.labels[m[1].toLowerCase()] = i;
        });
        this.pc = 0;
        this.finished = false;
    }

    step() {
        if (this.pc >= this.lines.length) { this.finished = true; return false; }
        this.jumpTarget = null;
        const result = this.execute(this.lines[this.pc]);
        if (this.jumpTarget !== null) this.pc = this.jumpTarget;
        else this.pc++;
        if (this.pc >= this.lines.length) this.finished = true;
        return true;
    }

    // --- Masks / sign ---
    mask(bits) {
        return bits === 8 ? 0xFFn : bits === 16 ? 0xFFFFn :
               bits === 32 ? 0xFFFFFFFFn : MASK64;
    }
    toSigned(val, bits) {
        const m = this.mask(bits);
        val = BigInt(val) & m;
        const signBit = 1n << BigInt(bits - 1);
        return val >= signBit ? val - (1n << BigInt(bits)) : val;
    }
    fromSigned(val, bits) {
        val = BigInt(val);
        return val < 0n ? (val + (1n << BigInt(bits))) & this.mask(bits)
                        : val & this.mask(bits);
    }

    // --- Register access ---
    _resolve(name) {
        name = name.toLowerCase();
        // legacy a/b/c/d + index/pointer
        const legacy = {
            rax:['rax',64,0n], eax:['rax',32,0n], ax:['rax',16,0n], al:['rax',8,0n], ah:['rax',8,8n],
            rbx:['rbx',64,0n], ebx:['rbx',32,0n], bx:['rbx',16,0n], bl:['rbx',8,0n], bh:['rbx',8,8n],
            rcx:['rcx',64,0n], ecx:['rcx',32,0n], cx:['rcx',16,0n], cl:['rcx',8,0n], ch:['rcx',8,8n],
            rdx:['rdx',64,0n], edx:['rdx',32,0n], dx:['rdx',16,0n], dl:['rdx',8,0n], dh:['rdx',8,8n],
            rsi:['rsi',64,0n], esi:['rsi',32,0n], si:['rsi',16,0n], sil:['rsi',8,0n],
            rdi:['rdi',64,0n], edi:['rdi',32,0n], di:['rdi',16,0n], dil:['rdi',8,0n],
            rbp:['rbp',64,0n], ebp:['rbp',32,0n], bp:['rbp',16,0n], bpl:['rbp',8,0n],
            rsp:['rsp',64,0n], esp:['rsp',32,0n], sp:['rsp',16,0n], spl:['rsp',8,0n],
        };
        if (legacy[name]) { const [p,bits,shift]=legacy[name]; return {parent:p,bits,shift}; }
        const m = name.match(/^(r(?:8|9|1[0-5]))(d|w|b)?$/);
        if (m) { const bits = {undefined:64, d:32, w:16, b:8}[m[2]] || 64; return {parent:m[1],bits,shift:0n}; }
        return null;
    }

    isReg(token) {
        if (!token) return false;
        return this._resolve(token.trim().replace(/,/g,'').toLowerCase()) !== null;
    }

    regBits(name) { const s = this._resolve(name); return s ? s.bits : 64; }

    getReg(name) {
        const s = this._resolve(name);
        if (!s) throw new Error('unknown register: ' + name);
        const full = this.regs[s.parent] & MASK64;
        return (full >> s.shift) & this.mask(s.bits);
    }

    setReg(name, val) {
        const s = this._resolve(name);
        if (!s) throw new Error('unknown register: ' + name);
        val = BigInt(val) & MASK64;
        this.shown.add(s.parent);
        this.changed.add(s.parent);
        if (s.bits === 64) { this.regs[s.parent] = val & MASK64; return; }
        if (s.bits === 32) { this.regs[s.parent] = val & 0xFFFFFFFFn; return; } // x64: zero upper 32
        const m = this.mask(s.bits) << s.shift;
        this.regs[s.parent] = (this.regs[s.parent] & ~m) | ((val & this.mask(s.bits)) << s.shift);
    }

    // --- Memory ---
    getMem(addr, size) {
        addr = BigInt(addr) & MASK64;
        let val = 0n;
        for (let i = 0n; i < BigInt(size); i++) {
            const b = BigInt(this.mem.get((addr + i).toString()) || 0);
            val |= b << (i * 8n);
        }
        return val & this.mask(size * 8);
    }
    setMem(addr, val, size) {
        addr = BigInt(addr) & MASK64;
        val = BigInt(val) & MASK64;
        for (let i = 0n; i < BigInt(size); i++) {
            this.mem.set((addr + i).toString(), Number((val >> (i * 8n)) & 0xFFn));
        }
        this.changedMem.add((addr).toString());
    }

    // --- Operand parsing ---
    parseVal(token) {
        if (token === undefined || token === null) return null;
        token = token.trim().replace(/,/g, '');
        if (!token) return null;

        if (/^-?\d+$/.test(token)) return BigInt(token);
        if (/^-?0x[0-9a-f]+$/i.test(token)) {
            const neg = token.startsWith('-');
            return neg ? -BigInt(token.slice(1)) : BigInt(token);
        }
        if (/^-?[0-9][0-9a-f]*h$/i.test(token)) {
            const neg = token.startsWith('-');
            const hex = neg ? token.slice(1, -1) : token.slice(0, -1);
            return neg ? -BigInt('0x' + hex) : BigInt('0x' + hex);
        }
        if (/^-?0b[01]+$/i.test(token)) {
            const neg = token.startsWith('-');
            return neg ? -BigInt(token.slice(1)) : BigInt(token);
        }
        if (/^[01]+b$/i.test(token)) return BigInt('0b' + token.slice(0, -1));
        if (/^['"][^'"]['"]$/.test(token)) return BigInt(token.charCodeAt(1));

        if (this.isReg(token)) return this.getReg(token);
        if (this.isMemOperand(token)) {
            const m = this._parseMemOperand(token);
            if (m !== null) return this.getMem(m.addr, m.size);
        }
        return null;
    }

    isMemOperand(op) {
        if (!op) return false;
        let s = op.trim().replace(/^(byte|word|dword|qword)\s+ptr\s+/i, '');
        s = s.trim().replace(/^(cs|ds|ss|es|fs|gs):/i, '');
        return /^\[.+\]$/.test(s.trim());
    }

    _parseMemOperand(op) {
        let size = 8; // default qword in 64-bit
        let expr = op;
        const sizeMatch = op.match(/^(byte|word|dword|qword)\s+ptr\s+/i);
        if (sizeMatch) {
            const s = sizeMatch[1].toLowerCase();
            size = s === 'byte' ? 1 : s === 'word' ? 2 : s === 'dword' ? 4 : 8;
            expr = op.slice(sizeMatch[0].length);
        }
        expr = expr.trim().replace(/^(cs|ds|ss|es|fs|gs):/i, '');
        const br = expr.match(/^\[(.+)\]$/);
        if (!br) return null;
        const addr = this._evalAddr(br[1]);
        if (addr === null) return null;
        return { addr: addr & MASK64, size };
    }

    isValidDest(token) { return this.isReg(token) || this.isMemOperand(token); }

    // base + index*scale + disp, plus rip-relative and IDA var_N/arg_N
    _evalAddr(expr) {
        let total = 0n;
        expr = expr.replace(/\bvar_([0-9a-f]+)\b/gi, (_, n) => '-' + parseInt(n, 16));
        expr = expr.replace(/\barg_([0-9a-f]+)\b/gi, (_, n) => String(parseInt(n, 16) + 8));
        const tokens = expr.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
        for (const t of tokens) {
            const scale = t.match(/^(-?)(\w+)\*(\d+)$/);
            if (scale && this.isReg(scale[2])) {
                const v = this.getReg(scale[2]) * BigInt(scale[3]);
                total += scale[1] === '-' ? -v : v;
            } else if (t.toLowerCase() === 'rip' || t.toLowerCase() === '-rip') {
                // rip-relative: model rip as the address of the *next* line's pc slot.
                // For a flat teaching model we treat rip as a stable base (0).
                total += 0n;
            } else if (this.isReg(t.replace(/^-/, ''))) {
                const neg = t.startsWith('-');
                const v = this.getReg(t.replace(/^-/, ''));
                total += neg ? -v : v;
            } else {
                let n;
                if (/^-?[0-9a-f]+h$/i.test(t)) {
                    const neg = t.startsWith('-');
                    n = BigInt('0x' + (neg ? t.slice(1, -1) : t.slice(0, -1)));
                    if (neg) n = -n;
                } else if (/^-?0x[0-9a-f]+$/i.test(t)) {
                    n = t.startsWith('-') ? -BigInt(t.slice(1)) : BigInt(t);
                } else if (/^-?\d+$/.test(t)) {
                    n = BigInt(t);
                } else if (/^-?[0-9a-f]+$/i.test(t)) {
                    const neg = t.startsWith('-');
                    n = BigInt('0x' + (neg ? t.slice(1) : t));
                    if (neg) n = -n;
                } else { return null; }
                total += n;
            }
        }
        return total & MASK64;
    }

    readOperand(token) { return this.parseVal(token); }

    writeOperand(dest, val, bits) {
        if (this.isMemOperand(dest)) {
            const m = this._parseMemOperand(dest);
            if (m !== null) { this.setMem(m.addr, val, m.size); return `[0x${m.addr.toString(16)}]`; }
        }
        if (this.isReg(dest)) {
            this.setReg(dest, val & this.mask(bits || this.regBits(dest)));
            return dest;
        }
        return '?';
    }

    operandBits(op) {
        if (this.isReg(op)) return this.regBits(op);
        const sm = op.match(/^(byte|word|dword|qword)\s+ptr/i);
        if (sm) { const s = sm[1].toLowerCase(); return s==='byte'?8:s==='word'?16:s==='dword'?32:64; }
        return 64;
    }

    // --- Flags ---
    _setFlagsLogic(result, bits) {
        const m = this.mask(bits);
        result &= m;
        this.flags.ZF = result === 0n ? 1 : 0;
        this.flags.SF = (result >> BigInt(bits - 1)) & 1n ? 1 : 0;
        this.flags.CF = 0; this.flags.OF = 0;
    }
    _setFlagsAdd(a, b, bits) {
        const m = this.mask(bits);
        const res = (a + b) & m;
        this.flags.ZF = res === 0n ? 1 : 0;
        this.flags.SF = (res >> BigInt(bits - 1)) & 1n ? 1 : 0;
        this.flags.CF = (a + b) > m ? 1 : 0;
        const sa = this.toSigned(a, bits), sb = this.toSigned(b, bits), sr = this.toSigned(res, bits);
        this.flags.OF = ((sa >= 0n) === (sb >= 0n)) && ((sr >= 0n) !== (sa >= 0n)) ? 1 : 0;
        return res;
    }
    _setFlagsSub(a, b, bits) {
        const m = this.mask(bits);
        const res = (a - b) & m;
        this.flags.ZF = res === 0n ? 1 : 0;
        this.flags.SF = (res >> BigInt(bits - 1)) & 1n ? 1 : 0;
        this.flags.CF = a < b ? 1 : 0;
        const sa = this.toSigned(a, bits), sb = this.toSigned(b, bits), sr = this.toSigned(res, bits);
        this.flags.OF = ((sa >= 0n) !== (sb >= 0n)) && ((sr >= 0n) !== (sa >= 0n)) ? 1 : 0;
        return res;
    }

    _splitOperands(str) {
        const out = []; let depth = 0, cur = '';
        for (const ch of str) {
            if (ch === '[') depth++;
            if (ch === ']') depth--;
            if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    }

    _hex(v, bits) { return '0x' + (BigInt(v) & this.mask(bits||64)).toString(16).toUpperCase(); }

    // --- Execute one line ---
    execute(line) {
        this.changed = new Set();
        this.changedMem = new Set();
        line = (line || '').trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) return { description: '', changedRegs: [] };
        if (/^\w+:$/.test(line)) return { description: `label: ${line}`, changedRegs: [] };
        const labelInstr = line.match(/^\w+:\s+(.+)/);
        if (labelInstr) line = labelInstr[1].trim();
        const ci = line.indexOf(';');
        if (ci > 0) line = line.substring(0, ci).trim();
        line = line.replace(/\bshort\s+/gi, '');

        const parts = line.match(/^(\w+)\s*(.*)/);
        if (!parts) return { description: 'Unknown', changedRegs: [] };
        const op = parts[1].toLowerCase();
        const operands = this._splitOperands(parts[2] || '');
        let desc = '';

        const bitsOf = (i) => this.operandBits(operands[i]);

        try {
            switch (op) {
                case 'mov': {
                    const b = this.isReg(operands[0]) ? this.regBits(operands[0]) : this.operandBits(operands[0]);
                    const v = this.readOperand(operands[1]);
                    if (v === null) return this._err(`cannot parse source "${operands[1]}"`);
                    const tgt = this.writeOperand(operands[0], v & this.mask(b), b);
                    desc = `${tgt} = ${this._hex(v, b)}`;
                    break;
                }
                case 'lea': {
                    const expr = operands.slice(1).join(',').replace(/^[^\[]*/, '').replace(/[\[\]]/g, '').trim();
                    const addr = this._evalAddr(expr);
                    if (addr === null) { desc = 'LEA: cannot parse address'; break; }
                    this.writeOperand(operands[0], addr, this.regBits(operands[0]));
                    desc = `${operands[0]} = ${this._hex(addr)} (effective address)`;
                    break;
                }
                case 'movzx': {
                    const sb = this.operandBits(operands[1]);
                    const v = this.readOperand(operands[1]) & this.mask(sb);
                    this.writeOperand(operands[0], v, this.regBits(operands[0]));
                    desc = `${operands[0]} = ${this._hex(v)} (zero-extended from ${sb}-bit)`;
                    break;
                }
                case 'movsx': case 'movsxd': {
                    const sb = op === 'movsxd' ? 32 : this.operandBits(operands[1]);
                    const raw = this.readOperand(operands[1]) & this.mask(sb);
                    const signed = this.toSigned(raw, sb);
                    const db = this.regBits(operands[0]);
                    const res = this.fromSigned(signed, db);
                    this.writeOperand(operands[0], res, db);
                    desc = `${operands[0]} = ${this._hex(res, db)} (sign-extended ${sb}->${db} bit, ${signed})`;
                    break;
                }
                case 'xchg': {
                    const a = this.readOperand(operands[0]), b = this.readOperand(operands[1]);
                    const bits = bitsOf(0);
                    this.writeOperand(operands[0], b, bits);
                    this.writeOperand(operands[1], a, bits);
                    desc = `swapped ${operands[0]} <-> ${operands[1]}`;
                    break;
                }
                case 'add': case 'sub': case 'cmp': {
                    const bits = bitsOf(0);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    const b = this.readOperand(operands[1]) & this.mask(bits);
                    if (b === null) return this._err(`cannot parse "${operands[1]}"`);
                    const res = op === 'add' ? this._setFlagsAdd(a, b, bits) : this._setFlagsSub(a, b, bits);
                    if (op === 'cmp') { desc = `compare: ${this._hex(a,bits)} - ${this._hex(b,bits)} -> flags (ZF=${this.flags.ZF} CF=${this.flags.CF} SF=${this.flags.SF} OF=${this.flags.OF})`; break; }
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(a,bits)} ${op==='add'?'+':'-'} ${this._hex(b,bits)} = ${this._hex(res,bits)}`;
                    break;
                }
                case 'inc': case 'dec': {
                    const bits = bitsOf(0);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    const one = 1n;
                    const cf = this.flags.CF;
                    const res = op === 'inc' ? this._setFlagsAdd(a, one, bits) : this._setFlagsSub(a, one, bits);
                    this.flags.CF = cf; // INC/DEC preserve CF
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(res,bits)}`;
                    break;
                }
                case 'neg': {
                    const bits = bitsOf(0);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    const res = this._setFlagsSub(0n, a, bits);
                    this.flags.CF = a === 0n ? 0 : 1;
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = -(${this._hex(a,bits)}) = ${this._hex(res,bits)}`;
                    break;
                }
                case 'and': case 'or': case 'xor': case 'test': {
                    const bits = bitsOf(0);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    const b = this.readOperand(operands[1]) & this.mask(bits);
                    let res;
                    if (op === 'and' || op === 'test') res = a & b;
                    else if (op === 'or') res = a | b;
                    else res = a ^ b;
                    this._setFlagsLogic(res, bits);
                    if (op === 'test') { desc = `test ${operands[0]} & ${operands[1]} -> ZF=${this.flags.ZF} SF=${this.flags.SF}`; break; }
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(res,bits)} (${op})`;
                    break;
                }
                case 'not': {
                    const bits = bitsOf(0);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    const res = (~a) & this.mask(bits);
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(res,bits)} (bitwise NOT)`;
                    break;
                }
                case 'shl': case 'sal': case 'shr': case 'sar': {
                    const bits = bitsOf(0);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    let cnt = (this.readOperand(operands[1]) ?? 0n) & (bits === 64 ? 63n : 31n);
                    let res;
                    if (op === 'shl' || op === 'sal') res = (a << cnt) & this.mask(bits);
                    else if (op === 'shr') res = a >> cnt;
                    else { res = this.fromSigned(this.toSigned(a, bits) >> cnt, bits); }
                    this._setFlagsLogic(res, bits);
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(res,bits)} (${op} by ${cnt})`;
                    break;
                }
                case 'rol': case 'ror': {
                    const bits = bitsOf(0); const W = BigInt(bits);
                    const a = this.readOperand(operands[0]) & this.mask(bits);
                    let cnt = ((this.readOperand(operands[1]) ?? 0n) & (bits === 64 ? 63n : 31n)) % W;
                    const res = op === 'rol'
                        ? ((a << cnt) | (a >> (W - cnt))) & this.mask(bits)
                        : ((a >> cnt) | (a << (W - cnt))) & this.mask(bits);
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(res,bits)} (${op} by ${cnt})`;
                    break;
                }
                case 'imul': {
                    // 2-operand: dst *= src ; 3-operand: dst = src * imm
                    const bits = this.regBits(operands[0]);
                    let res, a, b;
                    if (operands.length === 3) { a = this.readOperand(operands[1]); b = this.readOperand(operands[2]); }
                    else { a = this.readOperand(operands[0]); b = this.readOperand(operands[1]); }
                    res = this.fromSigned(this.toSigned(a, bits) * this.toSigned(b, bits), bits);
                    this.writeOperand(operands[0], res, bits);
                    desc = `${operands[0]} = ${this._hex(res,bits)} (signed multiply)`;
                    break;
                }
                case 'push': {
                    const v = this.readOperand(operands[0]) & MASK64;
                    const rsp = (this.getReg('rsp') - 8n) & MASK64;
                    this.setReg('rsp', rsp);
                    this.setMem(rsp, v, 8);
                    desc = `push ${this._hex(v)} -> [rsp=${this._hex(rsp)}]`;
                    break;
                }
                case 'pop': {
                    const rsp = this.getReg('rsp');
                    const v = this.getMem(rsp, 8);
                    this.writeOperand(operands[0], v, 64);
                    this.setReg('rsp', (rsp + 8n) & MASK64);
                    desc = `pop ${operands[0]} = ${this._hex(v)}`;
                    break;
                }
                case 'call': {
                    const t = (operands[0]||'').toLowerCase();
                    const rsp = (this.getReg('rsp') - 8n) & MASK64;
                    this.setReg('rsp', rsp);
                    this.setMem(rsp, BigInt(this.pc + 1), 8);
                    if (this.labels[t] !== undefined) { this.jumpTarget = this.labels[t]; desc = `call ${t}`; }
                    else desc = `call ${t} (no label; treated as no-op)`;
                    break;
                }
                case 'ret': case 'retn': {
                    const rsp = this.getReg('rsp');
                    const ret = this.getMem(rsp, 8);
                    this.setReg('rsp', (rsp + 8n) & MASK64);
                    this.jumpTarget = Number(ret);
                    desc = `ret -> line ${Number(ret)}`;
                    break;
                }
                case 'leave': {
                    this.setReg('rsp', this.getReg('rbp'));
                    const rsp = this.getReg('rsp');
                    const v = this.getMem(rsp, 8);
                    this.setReg('rbp', v);
                    this.setReg('rsp', (rsp + 8n) & MASK64);
                    desc = `leave (rsp=rbp; pop rbp)`;
                    break;
                }
                case 'jmp': {
                    const t = operands[0].toLowerCase();
                    if (this.labels[t] === undefined) return this._err(`unknown label: ${t}`);
                    this.jumpTarget = this.labels[t]; desc = `jmp ${t}`;
                    break;
                }
                case 'je': case 'jz':   return this._cj(operands[0], this.flags.ZF === 1, 'ZF=1');
                case 'jne': case 'jnz': return this._cj(operands[0], this.flags.ZF === 0, 'ZF=0');
                case 'jb': case 'jc': case 'jnae': return this._cj(operands[0], this.flags.CF === 1, 'CF=1 (unsigned below)');
                case 'jae': case 'jnc': case 'jnb': return this._cj(operands[0], this.flags.CF === 0, 'CF=0 (unsigned above/equal)');
                case 'ja': case 'jnbe': return this._cj(operands[0], this.flags.CF === 0 && this.flags.ZF === 0, 'CF=0 & ZF=0 (unsigned above)');
                case 'jbe': case 'jna': return this._cj(operands[0], this.flags.CF === 1 || this.flags.ZF === 1, 'CF=1 or ZF=1 (unsigned below/equal)');
                case 'jl': case 'jnge': return this._cj(operands[0], this.flags.SF !== this.flags.OF, 'SF!=OF (signed less)');
                case 'jge': case 'jnl': return this._cj(operands[0], this.flags.SF === this.flags.OF, 'SF=OF (signed greater/equal)');
                case 'jg': case 'jnle': return this._cj(operands[0], this.flags.ZF === 0 && this.flags.SF === this.flags.OF, 'ZF=0 & SF=OF (signed greater)');
                case 'jle': case 'jng': return this._cj(operands[0], this.flags.ZF === 1 || this.flags.SF !== this.flags.OF, 'ZF=1 or SF!=OF (signed less/equal)');
                case 'js':  return this._cj(operands[0], this.flags.SF === 1, 'SF=1 (negative)');
                case 'jns': return this._cj(operands[0], this.flags.SF === 0, 'SF=0 (non-negative)');
                case 'jo':  return this._cj(operands[0], this.flags.OF === 1, 'OF=1 (overflow)');
                case 'jno': return this._cj(operands[0], this.flags.OF === 0, 'OF=0 (no overflow)');
                case 'nop': desc = '(no operation)'; break;
                default:
                    return this._err(`unknown / unsupported (Phase 1) instruction: "${op}"`);
            }
        } catch (e) {
            return this._err(e.message);
        }
        return { description: desc, changedRegs: [...this.changed] };
    }

    _cj(operand, cond, why) {
        const t = (operand||'').trim().toLowerCase();
        if (this.labels[t] === undefined) return this._err(`unknown label: ${t}`);
        if (cond) { this.jumpTarget = this.labels[t]; return { description: `TAKEN -> ${t} (${why})`, changedRegs: [] }; }
        return { description: `not taken (${why} is false)`, changedRegs: [] };
    }
    _err(msg) { return { description: msg, changedRegs: [], error: true }; }

    // --- Display helpers ---
    getActiveRegs() {
        const order = ['rax','rbx','rcx','rdx','rsi','rdi','rbp','rsp',
                       'r8','r9','r10','r11','r12','r13','r14','r15'];
        return order.filter(r => this.shown.has(r));
    }
    getStackEntries() {
        const rsp = this.getReg('rsp'), rbp = this.getReg('rbp');
        const top = this.rspInit < rsp + 64n ? this.rspInit : rsp + 64n;
        const entries = [];
        for (let a = rsp; a < top; a += 8n) {
            let label = '';
            if (a === rsp) label = '<- RSP';
            if (a === rbp && rbp !== 0n) label += (label ? ' ' : '') + '<- RBP';
            entries.push({ addr: a, val: this.getMem(a, 8), label });
        }
        return entries;
    }
}

// Expose without leaking a top-level lexical binding. Assignment is
// idempotent, so loading this script more than once never throws.
if (typeof globalThis !== 'undefined') globalThis.AsmSimulator64 = AsmSimulator64;
if (typeof module !== 'undefined' && module.exports) module.exports = { AsmSimulator64 };
})();