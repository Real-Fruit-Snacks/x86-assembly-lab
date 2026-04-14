// ============================================================
// App: Navigation, Sandbox, Mini-Sims, Tools
// ============================================================

// --- Navigation ---
function navigate(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');
    const link = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
    if (link) link.classList.add('active');
    window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigate(link.dataset.section);
            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('open');
        });
    });

    // Mobile sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Hash navigation
    if (window.location.hash) {
        navigate(window.location.hash.slice(1));
    }

    initSandbox();
    initMiniSims();
    initNumberConverter();
    initBitwiseCalc();
    initReference();
    initEndianness();
    initQuiz();
    initStackPlayground();
});

// ============================================================
// SANDBOX SIMULATOR
// ============================================================

let sandboxSim = new AsmSimulator();
let sandboxFmt = 'dec';
let sandboxStepCount = 0;
const SANDBOX_MAX_STEPS = 10000; // infinite loop protection

function initSandbox() {
    document.getElementById('sandbox-run-btn').addEventListener('click', () => sandboxLoad());
    document.getElementById('sandbox-step-btn').addEventListener('click', () => sandboxStep());
    document.getElementById('sandbox-runall-btn').addEventListener('click', () => sandboxRunAll());
    document.getElementById('sandbox-reset-btn').addEventListener('click', () => sandboxReset());

    // Format toggle
    document.querySelectorAll('.sandbox-right .format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sandbox-right .format-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sandboxFmt = btn.dataset.fmt;
            sandboxUpdateRegs();
        });
    });

    // Example loader
    document.getElementById('sandbox-load').addEventListener('click', () => {
        const ex = document.getElementById('sandbox-examples').value;
        if (!ex) return;
        document.getElementById('sandbox-code').value = SANDBOX_EXAMPLES[ex] || '';
        document.getElementById('sandbox-examples').value = '';
    });

    // Reference panel collapse/expand
    const srefToggle = document.getElementById('sref-toggle');
    const srefBody = document.getElementById('sref-body');
    if (srefToggle && srefBody) {
        srefToggle.addEventListener('click', () => {
            const collapsed = srefBody.classList.toggle('collapsed');
            srefToggle.textContent = collapsed ? 'Expand' : 'Collapse';
        });
    }
}

const SANDBOX_EXAMPLES = {
    // --- Data Movement ---
    'mov': `; MOV - Copy values between registers and immediates
mov eax, 42        ; Load immediate value
mov ebx, eax       ; Copy register to register
mov ecx, -5        ; Negative values (two's complement)
mov edx, 0xFF      ; Hex values
mov al, 0b11001100 ; Binary values into 8-bit register
; Try HEX view to see the difference!`,

    'xchg': `; XCHG - Swap two registers in one instruction
mov eax, 100
mov ebx, 200
xchg eax, ebx
; Now EAX=200, EBX=100 - swapped!
; Useful when you need to swap without a temp register`,

    'lea': `; LEA - Calculate address expressions (no memory access)
; Compilers use LEA for fast math
mov ecx, 10
mov edx, 3
lea eax, [ecx+edx]       ; EAX = 10+3 = 13
lea ebx, [ecx+edx*4]     ; EBX = 10+12 = 22
lea esi, [ecx+edx*4+5]   ; ESI = 10+12+5 = 27
lea edi, [eax+eax*4]     ; EDI = 13*5 = 65 (multiply by 5!)`,

    // --- Arithmetic ---
    'add-sub': `; ADD and SUB
mov eax, 30
mov ebx, 12
add eax, ebx    ; EAX = 30+12 = 42
sub eax, 20     ; EAX = 42-20 = 22
sub ebx, eax    ; EBX = 12-22 = -10 (wraps to large unsigned!)
; Switch to HEX view to see the two's complement`,

    'inc-dec': `; INC and DEC - Add/subtract 1
mov eax, 10
inc eax          ; 11
inc eax          ; 12
dec eax          ; 11
; Edge case: decrementing 0 wraps to max unsigned
mov ebx, 0
dec ebx          ; EBX = 0xFFFFFFFF = -1`,

    'neg': `; NEG - Two's complement negate (flip sign)
mov eax, 5
neg eax          ; EAX = -5 (0xFFFFFFFB)
neg eax          ; EAX = 5 (back to positive)
; NEG 0 stays 0
mov ebx, 0
neg ebx          ; EBX = 0`,

    // --- Multiply & Divide ---
    'mul': `; MUL - Unsigned multiply (result in EDX:EAX)
mov eax, 252
mov ecx, 6
mul ecx
; EDX:EAX = 252*6 = 1512
; EDX = 0 (high bits), EAX = 1512 (low bits)
; WARNING: MUL always overwrites EDX!`,

    'imul': `; IMUL - Signed multiply (3 forms)
; Form 1: imul dest, src, immediate
mov edx, 512
imul eax, edx, 14  ; EAX = 512*14 = 7168 (doesn't touch EDX)
; Form 2: imul dest, src
mov ecx, -7
imul eax, ecx      ; EAX = 7168 * -7 = -50176
; Form 3: imul src (one operand, result in EDX:EAX)
; Less common, similar to MUL but signed`,

    'div': `; DIV - Unsigned divide (EDX:EAX / src)
; MUST zero EDX before DIV!
mov eax, 17
xor edx, edx     ; <-- Critical! Zero EDX first
mov ecx, 5
div ecx
; EAX = 3 (quotient: 17/5)
; EDX = 2 (remainder: 17%5)`,

    'idiv': `; IDIV - Signed divide (needs CDQ first)
mov eax, 7168
mov ecx, -65
cdq               ; Sign-extend EAX into EDX:EAX
idiv ecx
; EAX = -110 (quotient: 7168/-65)
; EDX = 18 (remainder)
; CDQ + IDIV always go together for signed division`,

    // --- Bitwise Logic ---
    'and': `; AND - Bitwise AND (both bits must be 1)
; Common use: masking/extracting bits
mov al, 0b11011010  ; = 218
and al, 0b00001111  ; Keep only low 4 bits
; AL = 0b00001010 = 10
; The upper 4 bits are "masked off"`,

    'or': `; OR - Bitwise OR (either bit can be 1)
; Common use: setting specific bits
mov al, 0b00001010  ; = 10
or al, 0b11000000   ; Set the top 2 bits
; AL = 0b11001010 = 202`,

    'xor': `; XOR - Bitwise XOR (bits must differ)
; XOR with self = 0 (fastest way to zero a register)
mov eax, 12345
xor eax, eax       ; EAX = 0 instantly
; XOR can also toggle bits:
mov al, 0b11001100
xor al, 0b11110000
; AL = 0b00111100 (top 4 bits flipped)`,

    'not': `; NOT - Flip every bit (one's complement)
mov al, 0b00000011  ; = 3
not al               ; AL = 0b11111100 = 252
; For 8-bit: NOT x = 255 - x
; NOT is different from NEG!
; NEG = flip bits + add 1 (two's complement)
mov bl, 3
neg bl               ; BL = 253 (-3)
; NOT 3 = 252, NEG 3 = 253`,

    'test': `; TEST - AND without storing (only sets flags)
; Most common: test reg, reg to check for zero
mov eax, 0
test eax, eax    ; ZF=1 because EAX is 0
; After this, JZ would jump, JNZ would not
mov eax, 42
test eax, eax    ; ZF=0 because EAX is nonzero
; Now JNZ would jump, JZ would not`,

    // --- Shifts ---
    'shl-shr': `; SHL and SHR - Shift bits left/right
mov eax, 10
shl eax, 1       ; *2 = 20
shl eax, 2       ; *4 = 80
shr eax, 3       ; /8 = 10 (back to start)
; SHR fills with zeros from the left (unsigned)`,

    'sar': `; SAR vs SHR - Arithmetic vs Logical shift right
; SAR preserves the sign bit (for signed numbers)
mov eax, -100
sar eax, 1       ; -100/2 = -50 (sign preserved!)
; Compare with SHR on a negative number:
mov ebx, -100
shr ebx, 1       ; Huge positive number! (sign bit became 0)
; Rule: use SHR for unsigned, SAR for signed`,

    // --- Comparison & Branching ---
    'cmp-jmp': `; CMP sets flags, conditional jumps read them
mov eax, 10
mov ebx, 20
cmp eax, ebx       ; Computes 10-20, sets flags
jbe less_or_eq     ; Jump if Below or Equal (unsigned)
; This code runs if eax > ebx:
mov ecx, 1
jmp done
less_or_eq:
; This code runs if eax <= ebx:
mov ecx, 2
done:
; ECX = 2 because 10 <= 20`,

    'loop': `; Loop using DEC + JNZ
; Sum the numbers 1 through 5
mov eax, 0         ; accumulator
mov ecx, 5         ; counter
loop_start:
add eax, ecx       ; add current counter
dec ecx            ; count down
test ecx, ecx     ; is counter zero?
jnz loop_start    ; if not, loop again
; EAX = 15 (5+4+3+2+1), ECX = 0`,

    // --- Stack & Functions ---
    'push-pop': `; PUSH and POP - Stack is Last-In-First-Out
push 10            ; Push 10 onto stack
push 20            ; Push 20 on top of 10
push 30            ; Push 30 on top of 20
pop eax            ; EAX = 30 (last pushed = first popped)
pop ebx            ; EBX = 20
pop ecx            ; ECX = 10`,

    'call-ret': `; CALL and RET - Function calls
mov eax, 5
call double_it     ; Push return addr, jump to label
; After return, EAX = 10
jmp done
double_it:
add eax, eax       ; Double the value in EAX
ret                ; Pop return addr, jump back
done:
nop`,

    'stack-frame': `; Complete stack frame (function prologue/epilogue)
push ebp               ; Save caller's base pointer
mov ebp, esp           ; Set up our base pointer
sub esp, 8             ; Allocate 2 local variables (4 bytes each)
; [ebp-4] = first local, [ebp-8] = second local
mov dword ptr [ebp-4], 42
mov dword ptr [ebp-8], 100
mov eax, [ebp-4]
add eax, [ebp-8]      ; EAX = 142
; Epilogue: clean up
mov esp, ebp           ; Deallocate locals
pop ebp                ; Restore caller's base pointer`,

    'ida-style': `; IDA-style notation (var_N and arg_N)
; var_4 = [ebp-4], arg_0 = [ebp+8]
push 77                ; Push an "argument"
call myfunc
jmp done
myfunc:
push ebp
mov ebp, esp
sub esp, 4
; Read the argument using IDA notation:
mov eax, [ebp+arg_0]  ; = [ebp+8] = 77
mov [ebp+var_4], eax   ; Store to local variable
add eax, [ebp+var_4]  ; EAX = 77+77 = 154
mov esp, ebp
pop ebp
ret
done:
nop`,
};

function sandboxLoad() {
    const code = document.getElementById('sandbox-code').value;
    sandboxSim = new AsmSimulator();
    sandboxSim.loadProgram(code);
    sandboxStepCount = 0;

    // Build trace UI showing ALL lines (including labels and comments)
    const trace = document.getElementById('sandbox-trace');
    trace.innerHTML = '';
    sandboxSim.lines.forEach((line, i) => {
        const row = document.createElement('div');
        const isLabel = /^\w+:/.test(line);
        const isComment = line.startsWith(';') || line.startsWith('#');
        const isEmpty = !line.trim();
        row.className = 'mini-inst';
        if (i === sandboxSim.pc) row.classList.add('current');
        if (isComment) row.classList.add('comment-row');
        row.dataset.idx = i;
        row.innerHTML = `
            <span class="mini-marker"></span>
            <span class="mini-asm">${isComment ? `<span style="color:var(--overlay0,var(--text-dim));font-style:italic">${escHtml(line)}</span>` : isLabel ? `<span class="lbl">${escHtml(line)}</span>` : isEmpty ? '' : highlightAsm(line)}</span>
            <span class="mini-result"></span>
        `;
        trace.appendChild(row);
    });

    sandboxUpdateRegs();
    sandboxUpdateExplain('Click <strong>Step</strong> to execute instructions one at a time. Branches and jumps are fully supported!');
    document.getElementById('sandbox-step-btn').disabled = false;
    document.getElementById('sandbox-runall-btn').disabled = false;
    document.getElementById('sandbox-reset-btn').disabled = false;
}

function sandboxStep() {
    if (sandboxSim.pc >= sandboxSim.lines.length) return;
    sandboxStepCount++;
    if (sandboxStepCount > SANDBOX_MAX_STEPS) {
        sandboxUpdateExplain('<span style="color:var(--red)">Execution stopped: exceeded 10,000 steps (likely infinite loop). Click Reset.</span>');
        document.getElementById('sandbox-step-btn').disabled = true;
        document.getElementById('sandbox-runall-btn').disabled = true;
        return;
    }

    const result = sandboxSim.step();
    if (!result) return;

    // Update trace rows
    const rows = document.querySelectorAll('#sandbox-trace .mini-inst');
    // Remove current marker from all
    rows.forEach(r => r.classList.remove('current'));

    // Mark executed line
    const executedRow = rows[result.lineIndex];
    if (executedRow) {
        executedRow.classList.add('executed');
        const resultEl = executedRow.querySelector('.mini-result');
        if (result.description) {
            resultEl.textContent = result.description;
            if (result.error) {
                executedRow.classList.add('error');
                resultEl.style.color = 'var(--red)';
            } else if (result.branchTaken) {
                resultEl.style.color = 'var(--green)';
            } else if (result.description.includes('NOT TAKEN')) {
                resultEl.style.color = 'var(--red)';
            } else {
                resultEl.style.color = '';
            }
        }
    }

    // Mark next line as current
    if (sandboxSim.pc < sandboxSim.lines.length) {
        rows[sandboxSim.pc]?.classList.add('current');
        // Scroll into view
        rows[sandboxSim.pc]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    sandboxUpdateRegs();

    const line = sandboxSim.lines[result.lineIndex];
    if (result.error) {
        sandboxUpdateExplain(`<span style="color:var(--red)">${result.description}</span>`);
    } else {
        sandboxUpdateExplain(describeInstruction(line, result));
    }

    if (sandboxSim.pc >= sandboxSim.lines.length) {
        document.getElementById('sandbox-step-btn').disabled = true;
        document.getElementById('sandbox-runall-btn').disabled = true;
        sandboxUpdateExplain('Execution complete. Click <strong>Reset</strong> to start over.');
    }
}

function sandboxRunAll() {
    let steps = 0;
    while (sandboxSim.pc < sandboxSim.lines.length && steps < SANDBOX_MAX_STEPS) {
        sandboxStep();
        steps++;
    }
    if (steps >= SANDBOX_MAX_STEPS) {
        sandboxUpdateExplain('<span style="color:var(--red)">Stopped after 10,000 steps (likely infinite loop). Click Reset.</span>');
    }
}

function sandboxReset() {
    const code = document.getElementById('sandbox-code').value;
    sandboxSim = new AsmSimulator();
    sandboxSim.loadProgram(code);
    sandboxStepCount = 0;

    const rows = document.querySelectorAll('#sandbox-trace .mini-inst');
    rows.forEach((r, i) => {
        r.classList.remove('current', 'executed', 'error');
        r.querySelector('.mini-result').textContent = '';
        const resultEl = r.querySelector('.mini-result');
        if (resultEl) resultEl.style.color = '';
    });
    // Set current to first executable line
    if (rows[sandboxSim.pc]) rows[sandboxSim.pc].classList.add('current');

    sandboxUpdateRegs();
    sandboxUpdateExplain('Reset complete. Click <strong>Step</strong> to begin.');
    document.getElementById('sandbox-step-btn').disabled = false;
    document.getElementById('sandbox-runall-btn').disabled = false;
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sandboxUpdateRegs() {
    const body = document.getElementById('sandbox-regs');
    body.innerHTML = '';
    const activeRegs = sandboxSim.getActiveRegs();
    if (activeRegs.length === 0) {
        body.innerHTML = '<div class="sim-reg-row" style="color:var(--text-dim);font-size:0.8rem">No registers set yet</div>';
        return;
    }

    activeRegs.forEach(name => {
        const val = sandboxSim.getReg(name);
        const bits = 32;
        const row = document.createElement('div');
        row.className = 'sim-reg-row';
        if (sandboxSim.changed.has(name)) row.classList.add('changed');
        row.innerHTML = `
            <span class="sim-reg-name">${name.toUpperCase()}</span>
            <span class="sim-reg-value">${sandboxSim.formatVal(val, bits, sandboxFmt)}</span>
        `;
        body.appendChild(row);
    });

    // Also show 8/16-bit sub-registers if they were used
    const subRegs = ['al','ah','bl','bh','cl','ch','dl','dh','ax','bx','cx','dx'];
    subRegs.forEach(name => {
        if (sandboxSim.changed.has(name) && !activeRegs.includes(name)) {
            const bits = sandboxSim.regBits(name);
            const val = sandboxSim.getReg(name);
            const row = document.createElement('div');
            row.className = 'sim-reg-row changed';
            row.innerHTML = `
                <span class="sim-reg-name">${name.toUpperCase()}</span>
                <span class="sim-reg-value">${sandboxSim.formatVal(val, bits, sandboxFmt)}</span>
            `;
            body.appendChild(row);
        }
    });

    // Flags
    const flagsBox = document.getElementById('sandbox-flags');
    const flagsBody = document.getElementById('sandbox-flags-body');
    if (sandboxStepCount > 0) {
        flagsBox.style.display = '';
        flagsBody.innerHTML = `
            <div class="sim-reg-row">
                <span class="sim-reg-name">ZF</span>
                <span class="sim-reg-value">${sandboxSim.flags.ZF}</span>
            </div>
            <div class="sim-reg-row">
                <span class="sim-reg-name">CF</span>
                <span class="sim-reg-value">${sandboxSim.flags.CF}</span>
            </div>
            <div class="sim-reg-row">
                <span class="sim-reg-name">SF</span>
                <span class="sim-reg-value">${sandboxSim.flags.SF}</span>
            </div>
            <div class="sim-reg-row">
                <span class="sim-reg-name">OF</span>
                <span class="sim-reg-value">${sandboxSim.flags.OF}</span>
            </div>
        `;
    }

    // Stack view
    const stackEntries = sandboxSim.getStackEntries();
    let stackBox = document.getElementById('sandbox-stack');
    if (stackEntries.length > 0 && sandboxSim.getReg('esp') !== sandboxSim.espInit) {
        if (!stackBox) {
            stackBox = document.createElement('div');
            stackBox.id = 'sandbox-stack';
            stackBox.className = 'sim-flags-box';
            stackBox.innerHTML = '<div class="sim-reg-header"><h3>Stack</h3></div>';
            const stackBody = document.createElement('div');
            stackBody.id = 'sandbox-stack-body';
            stackBody.className = 'sim-reg-body';
            stackBox.appendChild(stackBody);
            flagsBox.parentNode.insertBefore(stackBox, flagsBox.nextSibling);
        }
        stackBox.style.display = '';
        const stackBody = document.getElementById('sandbox-stack-body');
        stackBody.innerHTML = stackEntries.map(e => `
            <div class="sim-reg-row${e.label ? ' changed' : ''}">
                <span class="sim-reg-name" style="font-size:0.7rem">[${e.addr.toString(16)}]</span>
                <span class="sim-reg-value">${sandboxSim.formatVal(e.val, 32, sandboxFmt)} ${e.label ? '<span style="color:var(--teal,var(--accent));font-size:0.7rem">' + e.label + '</span>' : ''}</span>
            </div>
        `).join('');
    } else if (stackBox) {
        stackBox.style.display = 'none';
    }
}

function sandboxUpdateExplain(html) {
    document.getElementById('sandbox-explain').innerHTML = `<h4>Instruction Info</h4><p>${html}</p>`;
}

function describeInstruction(line, result) {
    const parts = line.match(/^(\w+)\s*(.*)/);
    if (!parts) return result.description;
    const op = parts[1].toLowerCase();
    const operands = parts[2];

    const descs = {
        mov: `<strong>MOV</strong>: Copy value into destination. <code>${line}</code>`,
        add: `<strong>ADD</strong>: Add source to destination. <code>${line}</code>`,
        sub: `<strong>SUB</strong>: Subtract source from destination. <code>${line}</code>`,
        inc: `<strong>INC</strong>: Add 1 to register. <code>${line}</code>`,
        dec: `<strong>DEC</strong>: Subtract 1 from register. <code>${line}</code>`,
        neg: `<strong>NEG</strong>: Two's complement negate (flip sign). <code>${line}</code>`,
        xchg: `<strong>XCHG</strong>: Swap both registers. <code>${line}</code>`,
        and: `<strong>AND</strong>: Bitwise AND (1 only if both bits are 1). <code>${line}</code>`,
        or: `<strong>OR</strong>: Bitwise OR (1 if either bit is 1). <code>${line}</code>`,
        xor: `<strong>XOR</strong>: Bitwise XOR (1 if bits differ). <code>${line}</code>`,
        not: `<strong>NOT</strong>: Flip every bit. <code>${line}</code>`,
        test: `<strong>TEST</strong>: AND without storing result (flags only). <code>${line}</code>`,
        cmp: `<strong>CMP</strong>: Subtract without storing result (flags only). <code>${line}</code>`,
        shl: `<strong>SHL</strong>: Shift left (multiply by 2^n). <code>${line}</code>`,
        shr: `<strong>SHR</strong>: Logical shift right (unsigned divide by 2^n). <code>${line}</code>`,
        sar: `<strong>SAR</strong>: Arithmetic shift right (signed divide by 2^n). <code>${line}</code>`,
        mul: `<strong>MUL</strong>: Unsigned multiply. Result in EDX:EAX. <code>${line}</code>`,
        imul: `<strong>IMUL</strong>: Signed multiply. <code>${line}</code>`,
        div: `<strong>DIV</strong>: Unsigned divide EDX:EAX by source. EAX=quotient, EDX=remainder. <code>${line}</code>`,
        idiv: `<strong>IDIV</strong>: Signed divide. <code>${line}</code>`,
        cdq: `<strong>CDQ</strong>: Sign-extend EAX into EDX:EAX. <code>${line}</code>`,
        lea: `<strong>LEA</strong>: Compute address expression (no memory access). <code>${line}</code>`,
        push: `<strong>PUSH</strong>: Decrement ESP by 4, store value at [ESP]. <code>${line}</code>`,
        pop: `<strong>POP</strong>: Load value from [ESP] into dest, increment ESP by 4. <code>${line}</code>`,
        call: `<strong>CALL</strong>: Push return address, jump to function. <code>${line}</code>`,
        ret: `<strong>RET</strong>: Pop return address, jump back to caller. <code>${line}</code>`,
        retn: `<strong>RET</strong>: Pop return address, jump back to caller. <code>${line}</code>`,
        leave: `<strong>LEAVE</strong>: Restore stack frame (mov esp,ebp; pop ebp). <code>${line}</code>`,
        jmp: `<strong>JMP</strong>: Unconditional jump. <code>${line}</code>`,
        je: `<strong>JE/JZ</strong>: Jump if equal (ZF=1). <code>${line}</code>`,
        jz: `<strong>JZ</strong>: Jump if zero (ZF=1). <code>${line}</code>`,
        jne: `<strong>JNE/JNZ</strong>: Jump if not equal (ZF=0). <code>${line}</code>`,
        jnz: `<strong>JNZ</strong>: Jump if not zero (ZF=0). <code>${line}</code>`,
        jbe: `<strong>JBE</strong>: Jump if below or equal, unsigned (CF=1 or ZF=1). <code>${line}</code>`,
        ja: `<strong>JA</strong>: Jump if above, unsigned (CF=0 and ZF=0). <code>${line}</code>`,
        jb: `<strong>JB</strong>: Jump if below, unsigned (CF=1). <code>${line}</code>`,
        jl: `<strong>JL</strong>: Jump if less, signed (SF!=OF). <code>${line}</code>`,
        jg: `<strong>JG</strong>: Jump if greater, signed (ZF=0 and SF=OF). <code>${line}</code>`,
    };

    return (descs[op] || `<code>${line}</code>`) + `<br><span style="color:var(--orange)">${result.description}</span>`;
}

// ============================================================
// MINI-SIM (inline demos in learn sections)
// ============================================================

function initMiniSims() {
    document.querySelectorAll('.mini-sim').forEach(el => {
        const code = el.dataset.code || '';
        const bits = parseInt(el.dataset.bits) || 32;
        const lines = code.split('\n').filter(l => l.trim());
        const sim = new AsmSimulator();
        let pc = 0;

        const body = el.querySelector('.mini-sim-body');
        const stepBtn = el.querySelector('.mini-step');
        const resetBtn = el.querySelector('.mini-reset');

        function render() {
            body.innerHTML = '';
            lines.forEach((line, i) => {
                const row = document.createElement('div');
                row.className = 'mini-inst';
                if (i < pc) row.classList.add('executed');
                if (i === pc && pc < lines.length) row.classList.add('current');
                row.innerHTML = `
                    <span class="mini-marker"></span>
                    <span class="mini-asm">${highlightAsm(line)}</span>
                    <span class="mini-result" id="mini-r-${el.id || ''}-${i}"></span>
                `;
                body.appendChild(row);
            });
            // Show register state after all executed instructions
            if (pc > 0) {
                const regDiv = document.createElement('div');
                regDiv.style.cssText = 'padding:0.4rem 0.7rem;border-top:1px solid var(--border);font-family:var(--font-mono);font-size:0.78rem;color:var(--text-dim);';
                const regs = sim.getActiveRegs();
                const parts = regs.map(r => {
                    const v = sim.getReg(r);
                    const s = sim.toSigned(v, 32);
                    const display = s < 0 ? `${s}` : `${v}`;
                    return `<span style="color:var(--purple)">${r.toUpperCase()}</span>=${display}`;
                });
                regDiv.innerHTML = parts.join(' &nbsp; ');
                body.appendChild(regDiv);
            }
        }

        function step() {
            if (pc >= lines.length) return;
            const result = sim.execute(lines[pc]);
            pc++;
            render();
            // Fill in result for the just-executed instruction
            const rows = body.querySelectorAll('.mini-inst');
            if (rows[pc - 1]) {
                rows[pc - 1].querySelector('.mini-result').textContent = result.description;
            }
        }

        function reset() {
            sim.reset();
            pc = 0;
            render();
        }

        stepBtn.addEventListener('click', step);
        resetBtn.addEventListener('click', reset);
        render();
    });
}

// ============================================================
// ASM SYNTAX HIGHLIGHTING
// ============================================================

function highlightAsm(text) {
    if (!text) return '';
    const match = text.match(/^(\w+)\s*(.*)/);
    if (!match) return text;
    const op = match[1];
    let operands = match[2];
    operands = operands.replace(/\b(eax|ebx|ecx|edx|esi|edi|ebp|esp|al|ah|bl|bh|cl|ch|dl|dh|ax|bx|cx|dx)\b/gi, '<span class="reg">$1</span>');
    operands = operands.replace(/\b(-?\d+)\b/g, '<span class="imm">$1</span>');
    operands = operands.replace(/\b(0x[0-9A-Fa-f]+)\b/gi, '<span class="imm">$1</span>');
    return `<span class="op">${op}</span> ${operands}`;
}

// ============================================================
// NUMBER CONVERTER
// ============================================================

function initNumberConverter() {
    const decEl = document.getElementById('conv-dec');
    const udecEl = document.getElementById('conv-udec');
    const hexEl = document.getElementById('conv-hex');
    const binEl = document.getElementById('conv-bin');
    const bitsEl = document.getElementById('conv-bits');

    function getBits() { return parseInt(bitsEl.value); }
    function mask() { return getBits() === 8 ? 0xFF : getBits() === 16 ? 0xFFFF : 0xFFFFFFFF; }
    // Use 2**bits instead of 1<<bits to avoid JS 32-bit truncation
    function toUnsigned(n, bits) { return n < 0 ? (n + 2 ** bits) >>> 0 : (n & mask()) >>> 0; }
    function toSignedConv(n, bits) { const s = 2 ** (bits - 1); return n >= s ? n - 2 ** bits : n; }

    function fromDec(val) {
        const bits = getBits();
        let n = parseInt(val);
        if (isNaN(n)) return;
        n = toUnsigned(n, bits);
        udecEl.value = n;
        hexEl.value = n.toString(16).toUpperCase().padStart(bits / 4, '0');
        binEl.value = n.toString(2).padStart(bits, '0');
    }

    function fromUdec(val) {
        const bits = getBits();
        let n = parseInt(val);
        if (isNaN(n)) return;
        n = (n & mask()) >>> 0;
        decEl.value = toSignedConv(n, bits);
        hexEl.value = n.toString(16).toUpperCase().padStart(bits / 4, '0');
        binEl.value = n.toString(2).padStart(bits, '0');
    }

    function fromHex(val) {
        const bits = getBits();
        let n = parseInt(val, 16);
        if (isNaN(n)) return;
        n = (n & mask()) >>> 0;
        decEl.value = toSignedConv(n, bits);
        udecEl.value = n;
        binEl.value = n.toString(2).padStart(bits, '0');
    }

    function fromBin(val) {
        const bits = getBits();
        let n = parseInt(val, 2);
        if (isNaN(n)) return;
        n = (n & mask()) >>> 0;
        decEl.value = toSignedConv(n, bits);
        udecEl.value = n;
        hexEl.value = n.toString(16).toUpperCase().padStart(bits / 4, '0');
    }

    decEl.addEventListener('input', () => fromDec(decEl.value));
    udecEl.addEventListener('input', () => fromUdec(udecEl.value));
    hexEl.addEventListener('input', () => fromHex(hexEl.value));
    binEl.addEventListener('input', () => fromBin(binEl.value));
    bitsEl.addEventListener('change', () => { if (decEl.value) fromDec(decEl.value); });
}

// ============================================================
// BITWISE CALCULATOR
// ============================================================

function initBitwiseCalc() {
    const aEl = document.getElementById('bitcalc-a');
    const bEl = document.getElementById('bitcalc-b');
    const bitsEl = document.getElementById('bitcalc-bits');
    const aBin = document.getElementById('bitcalc-a-bin');
    const bBin = document.getElementById('bitcalc-b-bin');
    const results = document.getElementById('bitcalc-results');

    function parseInput(val) {
        val = val.trim();
        if (/^0x/i.test(val)) return parseInt(val, 16);
        if (/^0b/i.test(val)) return parseInt(val.slice(2), 2);
        return parseInt(val);
    }

    function update() {
        const bits = parseInt(bitsEl.value);
        const m = bits === 8 ? 0xFF : bits === 16 ? 0xFFFF : 0xFFFFFFFF;
        const a = (parseInput(aEl.value) & m) >>> 0;
        const b = (parseInput(bEl.value) & m) >>> 0;

        if (isNaN(a) || isNaN(b)) { results.innerHTML = ''; return; }

        aBin.textContent = a.toString(2).padStart(bits, '0');
        bBin.textContent = b.toString(2).padStart(bits, '0');

        const ops = [
            { name: 'AND', val: (a & b) >>> 0 },
            { name: 'OR', val: (a | b) >>> 0 },
            { name: 'XOR', val: (a ^ b) >>> 0 },
            { name: 'NOT A', val: (~a & m) >>> 0 },
            { name: 'NOT B', val: (~b & m) >>> 0 },
        ];

        results.innerHTML = ops.map(op => {
            const binStr = op.val.toString(2).padStart(bits, '0');
            const coloredBits = binStr.split('').map(b =>
                b === '1' ? `<span class="bit-on">1</span>` : `<span class="bit-off">0</span>`
            ).join('');
            return `<div class="bitcalc-result-row">
                <span class="bitcalc-op">${op.name}</span>
                <span class="bitcalc-bits">${coloredBits}</span>
                <span class="bitcalc-dec">= ${op.val}</span>
            </div>`;
        }).join('');
    }

    aEl.addEventListener('input', update);
    bEl.addEventListener('input', update);
    bitsEl.addEventListener('change', update);
    update();
}

// ============================================================
// INSTRUCTION REFERENCE (searchable)
// ============================================================

const REF_DATA = [
    { cat: 'Data Movement', entries: [
        { name: 'MOV dest, src', desc: 'Copy value from src into dest. Source unchanged.', ex: 'mov eax, 10 → eax = 10' },
        { name: 'XCHG a, b', desc: 'Swap values of a and b.', ex: 'xchg eax, ebx → swapped' },
        { name: 'LEA dest, [expr]', desc: 'Compute address expression, store result in dest. No memory access.', ex: 'lea esi, [ecx+edi] → esi = ecx + edi' },
        { name: 'PUSH src', desc: 'ESP -= 4, then store src at [ESP].', ex: 'push eax → stack grows' },
        { name: 'POP dest', desc: 'Load [ESP] into dest, then ESP += 4.', ex: 'pop ebp → ebp = top of stack' },
    ]},
    { cat: 'Arithmetic', entries: [
        { name: 'ADD dest, src', desc: 'dest = dest + src. Sets flags.', ex: 'add eax, 5 → eax += 5' },
        { name: 'SUB dest, src', desc: 'dest = dest - src. Sets flags.', ex: 'sub eax, ecx → eax -= ecx' },
        { name: 'INC dest', desc: 'dest = dest + 1.', ex: 'inc eax → eax += 1' },
        { name: 'DEC dest', desc: 'dest = dest - 1.', ex: 'dec eax → eax -= 1' },
        { name: 'NEG dest', desc: "Two's complement negate: dest = -dest.", ex: 'neg eax → eax = -eax' },
        { name: 'MUL src', desc: 'Unsigned: EDX:EAX = EAX * src. Clobbers EDX.', ex: 'mul ecx → EDX:EAX = EAX * ECX' },
        { name: 'IMUL (1/2/3 operand)', desc: 'Signed multiply. 3-op: dest = src * imm. 2-op: dest *= src. 1-op: EDX:EAX = EAX * src.', ex: 'imul eax, edx, 14 → eax = edx * 14' },
        { name: 'DIV src', desc: 'Unsigned divide EDX:EAX by src. EAX = quotient, EDX = remainder. Zero EDX first!', ex: 'div ecx → EAX = result, EDX = remainder' },
        { name: 'IDIV src', desc: 'Signed divide EDX:EAX by src. Use CDQ first to sign-extend.', ex: 'idiv ecx → signed quotient/remainder' },
        { name: 'CDQ', desc: 'Sign-extend EAX into EDX:EAX. EDX = -1 if EAX negative, else 0.', ex: 'cdq → EDX = sign extension' },
    ]},
    { cat: 'Bitwise Logic', entries: [
        { name: 'AND dest, src', desc: 'Bitwise AND. Result bit is 1 only if both bits are 1.', ex: '1011 AND 1101 = 1001' },
        { name: 'OR dest, src', desc: 'Bitwise OR. Result bit is 1 if either bit is 1.', ex: '1010 OR 0110 = 1110' },
        { name: 'XOR dest, src', desc: 'Bitwise XOR. Result bit is 1 if bits differ. XOR reg,reg = 0.', ex: '1101 XOR 1011 = 0110' },
        { name: 'NOT dest', desc: 'Flip every bit (one\'s complement). 8-bit: NOT x = 255-x.', ex: 'NOT 00000011 = 11111100' },
        { name: 'TEST a, b', desc: 'Compute a AND b, set flags, discard result. TEST reg,reg checks for zero.', ex: 'test eax, eax → ZF=1 if eax==0' },
    ]},
    { cat: 'Shifts', entries: [
        { name: 'SHL dest, count', desc: 'Shift left. Multiply by 2^count. Zeros fill right.', ex: 'shl eax, 2 → eax *= 4' },
        { name: 'SHR dest, count', desc: 'Logical shift right. Unsigned divide by 2^count. Zeros fill left.', ex: 'shr eax, 3 → eax /= 8' },
        { name: 'SAR dest, count', desc: 'Arithmetic shift right. Signed divide by 2^count. Preserves sign bit.', ex: 'sar ecx, 1 → ecx /= 2 (signed)' },
    ]},
    { cat: 'Branching', entries: [
        { name: 'CMP a, b', desc: 'Compare: computes a - b, sets flags, discards result.', ex: 'cmp ebx, 20 → flags based on ebx-20' },
        { name: 'JMP target', desc: 'Unconditional jump. Always taken.', ex: 'jmp label → always jumps' },
        { name: 'JE / JZ', desc: 'Jump if Equal / Zero. ZF=1.', ex: 'After cmp a,b: jumps if a==b' },
        { name: 'JNE / JNZ', desc: 'Jump if Not Equal / Not Zero. ZF=0.', ex: 'After cmp a,b: jumps if a!=b' },
        { name: 'JB / JNAE', desc: 'Jump if Below (unsigned). CF=1.', ex: 'After cmp a,b: jumps if a < b (unsigned)' },
        { name: 'JBE / JNA', desc: 'Jump if Below or Equal (unsigned). CF=1 or ZF=1.', ex: 'After cmp a,b: jumps if a <= b' },
        { name: 'JA / JNBE', desc: 'Jump if Above (unsigned). CF=0 and ZF=0.', ex: 'After cmp a,b: jumps if a > b' },
        { name: 'JAE / JNB', desc: 'Jump if Above or Equal (unsigned). CF=0.', ex: 'After cmp a,b: jumps if a >= b' },
        { name: 'JL / JNGE', desc: 'Jump if Less (signed). SF!=OF.', ex: 'After cmp a,b: jumps if a < b (signed)' },
        { name: 'JG / JNLE', desc: 'Jump if Greater (signed). ZF=0 and SF==OF.', ex: 'After cmp a,b: jumps if a > b (signed)' },
    ]},
    { cat: 'Stack & Control', entries: [
        { name: 'CALL target', desc: 'Push return address, jump to target.', ex: 'call func → push next_addr; jmp func' },
        { name: 'RET', desc: 'Pop return address, jump to it.', ex: 'ret → pop addr; jmp addr' },
        { name: 'NOP', desc: 'No operation. Does nothing.', ex: 'nop → nothing happens' },
    ]},
];

function initReference() {
    const container = document.getElementById('ref-content');
    const searchEl = document.getElementById('ref-search');

    function renderRef(filter) {
        container.innerHTML = '';
        const f = (filter || '').toLowerCase();
        REF_DATA.forEach(cat => {
            const entries = cat.entries.filter(e =>
                !f || e.name.toLowerCase().includes(f) || e.desc.toLowerCase().includes(f)
            );
            if (entries.length === 0) return;
            const catDiv = document.createElement('div');
            catDiv.className = 'ref-category';
            catDiv.innerHTML = `<h2>${cat.cat}</h2>`;
            const grid = document.createElement('div');
            grid.className = 'ref-grid';
            entries.forEach(e => {
                const card = document.createElement('div');
                card.className = 'ref-card';
                card.innerHTML = `
                    <h4>${e.name}</h4>
                    <p>${e.desc}</p>
                    <div class="ref-example"><code>${e.ex}</code></div>
                `;
                grid.appendChild(card);
            });
            catDiv.appendChild(grid);
            container.appendChild(catDiv);
        });
    }

    searchEl.addEventListener('input', () => renderRef(searchEl.value));
    renderRef();
}

// ============================================================
// ENDIANNESS INTERACTIVE
// ============================================================

function initEndianness() {
    const input = document.getElementById('endian-val');
    if (!input) return;

    const leCells = document.getElementById('endian-le-cells');
    const beCells = document.getElementById('endian-be-cells');
    const breakdown = document.getElementById('endian-breakdown');

    function update() {
        let hex = input.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
        // Pad to 8 hex digits (4 bytes)
        hex = hex.padStart(8, '0').slice(0, 8);

        // Split into bytes
        const bytes = [];
        for (let i = 0; i < 8; i += 2) {
            bytes.push(hex.slice(i, i + 2));
        }
        // bytes[0] = high byte, bytes[3] = low byte

        // Little endian: reverse the byte order
        const leBytes = [...bytes].reverse();
        // Big endian: same order as written
        const beBytes = [...bytes];

        function renderCells(container, byteArr) {
            container.innerHTML = '';
            byteArr.forEach((b, i) => {
                const cell = document.createElement('div');
                cell.className = 'mem-cell';
                cell.innerHTML = `<span class="addr">+${i}</span><span class="val">0x${b}</span>`;
                container.appendChild(cell);
            });
        }

        renderCells(leCells, leBytes);
        renderCells(beCells, beBytes);

        // Show breakdown
        const val = parseInt(hex, 16) >>> 0;
        breakdown.innerHTML = `
            <span style="color:var(--text)">0x${hex}</span> = ${val} decimal<br>
            <span style="color:var(--accent)">Little Endian in memory:</span> <span style="color:var(--orange)">${leBytes.join(' ')}</span> &nbsp;
            <span style="color:var(--accent)">Big Endian:</span> <span style="color:var(--orange)">${beBytes.join(' ')}</span>
        `;
    }

    input.addEventListener('input', update);
    update();
}

// ============================================================
// REGISTER QUIZ
// ============================================================

function initQuiz() {
    let difficulty = 'easy';
    let score = 0, streak = 0, best = 0;
    let timerStart = null, timerInterval = null;
    let currentAnswer = null;

    const scoreEl = document.getElementById('quiz-score');
    const streakEl = document.getElementById('quiz-streak');
    const bestEl = document.getElementById('quiz-best');
    const timerEl = document.getElementById('quiz-timer');
    const area = document.getElementById('quiz-area');
    const startBtn = document.getElementById('quiz-start');

    // Difficulty buttons
    document.querySelectorAll('.quiz-diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.quiz-diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficulty = btn.dataset.diff;
        });
    });

    startBtn.addEventListener('click', () => generateQuestion());

    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function generateQuestion() {
        const q = difficulty === 'easy' ? genEasy() : difficulty === 'medium' ? genMedium() : genHard();

        // Run through simulator to get correct answers
        const sim = new AsmSimulator();
        sim.loadProgram(q.code);
        let steps = 0;
        while (sim.pc < sim.lines.length && steps < 500) { sim.step(); steps++; }

        currentAnswer = {};
        q.askRegs.forEach(r => { currentAnswer[r] = sim.getReg(r); });

        // Render
        const codeHtml = q.code.split('\n').map(l => highlightAsm(l.trim())).join('\n');
        area.innerHTML = `
            <div class="quiz-code">${codeHtml}</div>
            <p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:0.6rem">What are the final values of these registers? (Enter decimal values)</p>
            <div class="quiz-inputs" id="quiz-inputs">
                ${q.askRegs.map(r => `
                    <div class="quiz-input-group">
                        <label>${r.toUpperCase()}</label>
                        <input type="text" data-reg="${r}" placeholder="?" autocomplete="off">
                    </div>
                `).join('')}
            </div>
            <button class="sim-btn primary quiz-submit" id="quiz-check">Check Answer</button>
            <div id="quiz-feedback"></div>
        `;

        document.getElementById('quiz-check').addEventListener('click', checkAnswer);
        // Enter key submits
        area.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });
        });
        // Focus first input
        area.querySelector('input')?.focus();

        // Start timer
        timerStart = Date.now();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const elapsed = ((Date.now() - timerStart) / 1000).toFixed(1);
            timerEl.textContent = elapsed + 's';
        }, 100);
    }

    function checkAnswer() {
        if (!currentAnswer) return;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        const elapsed = ((Date.now() - timerStart) / 1000).toFixed(1);

        let allCorrect = true;
        const inputs = area.querySelectorAll('#quiz-inputs input');
        const feedbackLines = [];

        inputs.forEach(inp => {
            const reg = inp.dataset.reg;
            const expected = currentAnswer[reg];
            const userVal = inp.value.trim();

            // Parse user input (support dec, hex, negative)
            let parsed = null;
            if (/^-?\d+$/.test(userVal)) parsed = parseInt(userVal);
            else if (/^-?0x[0-9a-fA-F]+$/i.test(userVal)) parsed = parseInt(userVal, 16);
            else if (/^[0-9a-fA-F]+h$/i.test(userVal)) parsed = parseInt(userVal.slice(0,-1), 16);

            // Handle signed input: if user types negative, convert to unsigned for comparison
            let match = false;
            if (parsed !== null) {
                const unsigned = parsed < 0 ? (parsed + 2**32) >>> 0 : parsed >>> 0;
                match = unsigned === expected;
            }

            if (match) {
                inp.classList.add('correct');
                inp.classList.remove('wrong');
                feedbackLines.push(`<span class="answer-line"><span class="val-correct">${reg.toUpperCase()} = ${expected}</span></span>`);
            } else {
                allCorrect = false;
                inp.classList.add('wrong');
                inp.classList.remove('correct');
                const signed = expected >= 2**31 ? expected - 2**32 : expected;
                const display = signed < 0 ? `${signed} (${expected})` : `${expected}`;
                feedbackLines.push(`<span class="answer-line">${reg.toUpperCase()}: your answer <span class="val-wrong">${userVal || '?'}</span> &rarr; correct: <span class="val-correct">${display}</span></span>`);
            }
        });

        // Disable check button
        document.getElementById('quiz-check').disabled = true;

        const feedback = document.getElementById('quiz-feedback');
        if (allCorrect) {
            score += difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
            streak++;
            if (streak > best) best = streak;
            feedback.className = 'quiz-feedback correct';
            feedback.innerHTML = `Correct! (${elapsed}s)${streak > 1 ? ` &mdash; ${streak} in a row!` : ''}`;
        } else {
            streak = 0;
            feedback.className = 'quiz-feedback wrong';
            feedback.innerHTML = `Not quite. Here are the correct values:<br>${feedbackLines.join('<br>')}`;
        }

        scoreEl.textContent = score;
        streakEl.textContent = streak;
        bestEl.textContent = best;
    }

    // ========= PROBLEM GENERATORS =========

    function genEasy() {
        // 2-4 lines, basic MOV + ADD/SUB/INC/DEC, 2 registers
        const templates = [
            () => {
                const a = rand(1, 50), b = rand(1, 50);
                return { code: `mov eax, ${a}\nadd eax, ${b}`, askRegs: ['eax'] };
            },
            () => {
                const a = rand(10, 100), b = rand(1, 30);
                return { code: `mov eax, ${a}\nsub eax, ${b}`, askRegs: ['eax'] };
            },
            () => {
                const a = rand(1, 50), b = rand(1, 50);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nadd eax, ebx`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(5, 50);
                return { code: `mov eax, ${a}\ninc eax\ninc eax\ndec eax`, askRegs: ['eax'] };
            },
            () => {
                const a = rand(10, 80), b = rand(10, 80);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nxchg eax, ebx`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(5, 40), b = rand(5, 40);
                return { code: `mov ecx, ${a}\nmov edx, ${b}\nadd ecx, edx\nsub edx, 1`, askRegs: ['ecx', 'edx'] };
            },
            () => {
                const a = rand(1, 30);
                return { code: `mov eax, ${a}\nneg eax`, askRegs: ['eax'] };
            },
            () => {
                const a = rand(10,50), b = rand(1,20), c = rand(1,20);
                return { code: `mov eax, ${a}\nsub eax, ${b}\nadd eax, ${c}`, askRegs: ['eax'] };
            },
        ];
        return pick(templates)();
    }

    function genMedium() {
        // 4-6 lines, ADD/SUB/NEG/XCHG + logic (AND/OR/XOR) or shifts, 2-3 registers
        const templates = [
            () => {
                const a = rand(10, 60), b = rand(10, 60);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nsub eax, ebx\nneg eax\nadd ebx, eax`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(2, 30);
                return { code: `mov eax, ${a}\nshl eax, 2\nmov ebx, eax\nshr ebx, 1`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(100, 500), b = rand(2, 10);
                return { code: `mov eax, ${a}\nxor edx, edx\nmov ecx, ${b}\ndiv ecx`, askRegs: ['eax', 'edx'] };
            },
            () => {
                const a = rand(5, 50), b = rand(5, 50);
                return { code: `mov eax, ${a}\nmov ecx, ${b}\nmul ecx`, askRegs: ['eax', 'edx'] };
            },
            () => {
                const a = rand(0, 255), b = rand(0, 255);
                return { code: `mov al, ${a}\nmov bl, ${b}\nand al, bl\nxor bl, al`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(10, 50), b = rand(10, 50), c = rand(1, 20);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nadd eax, ebx\nmov ecx, eax\nsub ecx, ${c}`, askRegs: ['eax', 'ecx'] };
            },
            () => {
                const a = rand(0, 255), b = rand(0, 255);
                return { code: `mov al, ${a}\nmov dl, ${b}\nor al, dl\nnot dl`, askRegs: ['eax', 'edx'] };
            },
            () => {
                const a = rand(5, 40), b = rand(5, 40);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nxchg eax, ebx\nsub eax, ebx\nneg eax`, askRegs: ['eax'] };
            },
        ];
        return pick(templates)();
    }

    function genHard() {
        // 6-10 lines, MUL/DIV/IMUL + shifts + branches + multi-register, 2-3 registers
        const templates = [
            () => {
                const a = rand(50, 200), b = rand(2, 8);
                return { code: `mov eax, ${a}\nmov ecx, ${b}\nmul ecx\nshr eax, 3\ninc eax\nmov ebx, eax\nshl eax, 1`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(10, 40), b = rand(10, 40);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nsub ebx, eax\nneg ebx\nmov ecx, ebx\nadd ecx, eax\nxchg eax, ecx\nsub eax, ebx`, askRegs: ['eax', 'ebx', 'ecx'] };
            },
            () => {
                const a = rand(100, 999), b = rand(2, 15);
                return { code: `mov eax, ${a}\nmov ecx, ${b}\nxor edx, edx\ndiv ecx\nmov ebx, edx\nadd ebx, eax`, askRegs: ['eax', 'ebx', 'edx'] };
            },
            () => {
                const a = rand(10, 50), b = rand(2, 6), c = rand(2, 6);
                return { code: `mov edx, ${a}\nimul eax, edx, ${b}\nmov ecx, ${c}\nxor edx, edx\ndiv ecx\nmov ebx, edx\nadd eax, ebx`, askRegs: ['eax', 'ebx'] };
            },
            () => {
                const a = rand(5, 25), b = rand(5, 25);
                return { code: `mov eax, ${a}\nmov ebx, ${b}\nadd eax, ebx\nmov ecx, eax\nshl ecx, 1\nsub ecx, ebx\nmov edx, ecx\nshr edx, 2`, askRegs: ['ecx', 'edx'] };
            },
            () => {
                const a = rand(10, 50), b = rand(10, 50);
                const code = `mov edi, ${a}\nmov esi, ${b}\nmov ebx, esi\nsub ebx, edi\nmov ecx, ebx\nadd ecx, edi\nxchg ebx, ecx\nsub ebx, ecx`;
                return { code, askRegs: ['ebx', 'ecx', 'edi'] };
            },
            () => {
                const a = rand(0, 15), b = rand(0, 15);
                return { code: `mov al, ${a}\nmov cl, al\nmov dl, ${b}\nand al, dl\nxor dl, cl\nmov cl, al\ninc al\ninc dl\nxor dl, al\nnot dl\nand cl, dl`, askRegs: ['eax', 'ecx', 'edx'] };
            },
        ];
        return pick(templates)();
    }
}

// ============================================================
// STACK PLAYGROUND
// ============================================================

function initStackPlayground() {
    const ESP_INIT = 0x00200000;

    // ============ EXPLORE MODE ============
    let state = null;
    let lastExplain = null;
    let changedRegs = new Set();

    function reset() {
        state = {
            esp: ESP_INIT,
            ebp: 0,
            stack: [],
            pc: 1000,
            callStack: [],
            log: [],
            // Full register file synced with AsmSimulator
            regs: { eax: 0, ebx: 0, ecx: 0, edx: 0, esi: 0, edi: 0 },
        };
        lastExplain = null;
        changedRegs = new Set();
        render();
        setExplain(null, null);
    }

    function render() {
        document.getElementById('sp-esp').textContent = fmtAddr(state.esp);
        document.getElementById('sp-ebp').textContent = fmtAddr(state.ebp);

        // GP registers
        const gpEl = document.getElementById('sp-gp-regs');
        if (gpEl) {
            gpEl.innerHTML = ['eax','ebx','ecx','edx','esi','edi'].map(r => {
                const val = (state.regs[r] || 0) >>> 0;
                const cls = 'sp-gp-reg' + (changedRegs.has(r) ? ' changed' : '');
                return `<div class="${cls}"><span class="sp-gp-reg-name">${r.toUpperCase()}</span><span class="sp-gp-reg-val">${val}</span></div>`;
            }).join('');
        }

        const stackEl = document.getElementById('sp-stack');
        if (state.stack.length === 0) {
            stackEl.innerHTML = '<div class="sp-empty-stack">Stack is empty. Click PUSH, PROLOGUE, or load a scenario to begin.</div>';
        } else {
            stackEl.innerHTML = renderStackCells(state);
        }

        const logEl = document.getElementById('sp-log');
        if (state.log.length === 0) {
            logEl.innerHTML = '<div style="color:var(--text-dim);font-style:italic;font-size:0.78rem">No actions yet.</div>';
        } else {
            logEl.innerHTML = state.log.slice(-20).reverse().map(entry =>
                `<div class="sp-log-entry"><span class="sp-log-op">${entry.op}</span><span class="sp-log-desc">${entry.desc}</span></div>`
            ).join('');
        }
    }

    // ============ ASSEMBLY EXECUTION BRIDGE ============
    // Use AsmSimulator for arbitrary instruction execution, then sync state back
    function execAsm(line) {
        // Create a fresh simulator, load our current state into it
        const sim = new AsmSimulator();
        // Load registers
        sim.regs.eax = state.regs.eax;
        sim.regs.ebx = state.regs.ebx;
        sim.regs.ecx = state.regs.ecx;
        sim.regs.edx = state.regs.edx;
        sim.regs.esi = state.regs.esi;
        sim.regs.edi = state.regs.edi;
        sim.regs.esp = state.esp;
        sim.regs.ebp = state.ebp;
        // Load memory from our stack cells
        for (const cell of state.stack) {
            if (typeof cell.value === 'number') {
                sim.setMem(cell.addr, cell.value, 4);
            }
        }
        // Reset changed tracking
        sim.changedMem = new Set();

        // Execute
        const result = sim.execute(line);
        if (result.error) {
            return { error: result.description };
        }

        // Sync registers back
        const oldRegs = { ...state.regs };
        state.regs.eax = sim.regs.eax || 0;
        state.regs.ebx = sim.regs.ebx || 0;
        state.regs.ecx = sim.regs.ecx || 0;
        state.regs.edx = sim.regs.edx || 0;
        state.regs.esi = sim.regs.esi || 0;
        state.regs.edi = sim.regs.edi || 0;

        changedRegs = new Set();
        for (const r of ['eax','ebx','ecx','edx','esi','edi']) {
            if (oldRegs[r] !== state.regs[r]) changedRegs.add(r);
        }

        const newEsp = sim.regs.esp || ESP_INIT;
        const newEbp = sim.regs.ebp || 0;

        // Handle stack changes:
        // 1. If ESP decreased, new slots were created (PUSH, SUB ESP)
        // 2. If ESP increased, slots were consumed (POP, ADD ESP)
        // 3. Memory might have been written to existing cells
        if (newEsp < state.esp) {
            // Cells added from newEsp to state.esp - 1 (4-byte steps)
            for (let addr = newEsp; addr < state.esp; addr += 4) {
                if (!state.stack.find(e => e.addr === addr)) {
                    const val = sim.getMem(addr, 4);
                    state.stack.push({ addr, value: val, label: '', kind: '' });
                }
            }
        } else if (newEsp > state.esp) {
            // Cells removed from state.esp to newEsp - 1
            state.stack = state.stack.filter(e => e.addr >= newEsp);
        }

        // Update existing cell values from memory (writes via mov [addr], value)
        for (const cell of state.stack) {
            const newVal = sim.getMem(cell.addr, 4);
            if (typeof cell.value === 'number' || cell.value === '?') {
                if (newVal !== (cell.value === '?' ? 0 : cell.value)) {
                    cell.value = newVal;
                    cell.highlighted = true;
                }
            }
        }

        state.esp = newEsp;
        state.ebp = newEbp;

        log('EXEC', `${line} → ${result.description || 'ok'}`);

        // Clear highlights after a moment
        setTimeout(() => {
            state.stack.forEach(e => { e.highlighted = false; });
            render();
        }, 2500);

        return { success: true, description: result.description, line };
    }

    function explainExec(result) {
        if (result.error) {
            return {
                asm: 'error',
                desc: `<strong style="color:#f38ba8">${result.error}</strong>`
            };
        }
        return {
            asm: result.line,
            desc: `<strong>Executed:</strong> ${result.description || 'ok'}<br><br>Registers, stack, and memory have been updated. Watch highlighted cells and changed registers (blue flash) to see what moved.`
        };
    }

    function fmtAddr(a) { return '0x' + (a >>> 0).toString(16).toUpperCase().padStart(8, '0'); }

    function renderStackCells(st) {
        const sorted = [...st.stack].sort((a, b) => b.addr - a.addr);
        return sorted.map(entry => {
            const isEsp = entry.addr === st.esp;
            const isEbp = entry.addr === st.ebp && st.ebp !== 0;
            let cls = 'sp-cell';
            if (isEsp && isEbp) cls += ' is-both';
            else if (isEsp) cls += ' is-esp';
            else if (isEbp) cls += ' is-ebp';
            if (entry.kind) cls += ' is-' + entry.kind;
            if (entry.highlighted) cls += ' highlighted';

            const pointers = [];
            if (isEsp) pointers.push('&larr; ESP');
            if (isEbp) pointers.push('&larr; EBP');

            const valDisplay = typeof entry.value === 'string' ? entry.value : (entry.value >>> 0).toString();
            return `<div class="${cls}">
                <span class="sp-cell-addr">${fmtAddr(entry.addr)}</span>
                <span class="sp-cell-value">${valDisplay}</span>
                <span class="sp-cell-label">${entry.label || ''}</span>
                <span class="sp-cell-pointer">${pointers.join(' ')}</span>
            </div>`;
        }).join('');
    }

    function log(op, desc) { state.log.push({ op, desc }); }

    function setExplain(asm, descHtml) {
        document.getElementById('sp-explain-asm').innerHTML = asm || '&mdash;';
        document.getElementById('sp-explain-desc').innerHTML = descHtml || 'Click any action button to see the assembly equivalent and a step-by-step explanation of what happened to ESP, EBP, and the stack.';
    }

    function steps(...items) {
        return items.map((t, i) => `<span class="step"><span class="step-num">${i+1}</span>${t}</span>`).join('');
    }

    function doPush(value, label, kind) {
        const oldEsp = state.esp;
        state.esp -= 4;
        state.stack.push({ addr: state.esp, value, label: label || '', kind: kind || '' });
        log('PUSH', `${value} at [${fmtAddr(state.esp)}]${label ? ' — ' + label : ''}`);
        return { oldEsp, newEsp: state.esp, value };
    }

    function doPop(regName) {
        const top = state.stack.find(e => e.addr === state.esp);
        if (!top) { log('POP', 'ERROR: stack is empty'); return { error: 'empty' }; }
        const oldEsp = state.esp;
        state.stack = state.stack.filter(e => e.addr !== state.esp);
        state.esp += 4;
        // Update the target register if it's a GP register
        const lowerReg = regName.toLowerCase();
        if (['eax','ebx','ecx','edx','esi','edi'].includes(lowerReg)) {
            const oldVal = state.regs[lowerReg];
            const newVal = typeof top.value === 'number' ? (top.value >>> 0) : 0;
            state.regs[lowerReg] = newVal;
            if (oldVal !== newVal) changedRegs.add(lowerReg);
        } else if (lowerReg === 'ebp') {
            state.ebp = typeof top.value === 'number' ? (top.value >>> 0) : 0;
        }
        log('POP', `${regName.toUpperCase()} = ${top.value} from [${fmtAddr(oldEsp)}]`);
        return { oldEsp, newEsp: state.esp, value: top.value };
    }

    function doCall(funcName) {
        const retAddr = state.pc + 5;
        state.pc = retAddr + 100;
        doPush(`retaddr:${retAddr.toString(16)}`, `return to ${funcName} caller`, 'retaddr');
        state.callStack.push(retAddr);
        log('CALL', `${funcName} — pushed return address`);
        return { retAddr, funcName };
    }

    function doRet() {
        const top = state.stack.find(e => e.addr === state.esp);
        const wasReturn = top && top.kind === 'retaddr';
        if (!wasReturn) log('RET', 'WARNING: top of stack is not a return address');
        const popResult = doPop('EIP');
        state.callStack.pop();
        return { wasReturn, popResult };
    }

    function doPrologue() {
        const oldEbp = state.ebp;
        doPush(state.ebp >>> 0, 'saved old EBP', 'savedebp');
        state.ebp = state.esp;
        log('PROLOGUE', `push ebp; mov ebp, esp (EBP = ${fmtAddr(state.esp)})`);
        return { oldEbp, newEbp: state.ebp };
    }

    function doAlloc(bytes) {
        if (bytes % 4 !== 0) bytes = Math.ceil(bytes / 4) * 4;
        const numSlots = bytes / 4;
        for (let i = 0; i < numSlots; i++) {
            state.esp -= 4;
            state.stack.push({
                addr: state.esp,
                value: '?',
                label: `local var [ebp-${(i + 1) * 4}]`,
                kind: 'local'
            });
        }
        log('ALLOC', `sub esp, ${bytes} — reserved ${numSlots} local variable${numSlots !== 1 ? 's' : ''}`);
        return { bytes, numSlots };
    }

    function doLeave() {
        if (state.ebp === 0) { log('LEAVE', 'ERROR: no stack frame to leave'); return { error: 'no-frame' }; }
        state.stack = state.stack.filter(e => e.addr >= state.ebp);
        state.esp = state.ebp;
        const saved = state.stack.find(e => e.addr === state.esp);
        if (saved && saved.kind === 'savedebp') {
            const oldEbp = state.ebp;
            state.ebp = typeof saved.value === 'number' ? saved.value : 0;
            state.stack = state.stack.filter(e => e.addr !== state.esp);
            state.esp += 4;
            log('LEAVE', `mov esp, ebp; pop ebp (EBP = ${fmtAddr(state.ebp)})`);
            return { oldEbp, newEbp: state.ebp };
        } else {
            log('LEAVE', 'WARNING: expected saved EBP at top');
            return { error: 'no-saved-ebp' };
        }
    }

    function doRead(base, offset) {
        const addr = (base === 'ebp' ? state.ebp : state.esp) + offset;
        const entry = state.stack.find(e => e.addr === addr);
        if (!entry) {
            log('READ', `[${base}${offset >= 0 ? '+' : ''}${offset}] = <unmapped>`);
            return { addr, value: null, unmapped: true };
        }
        // Highlight briefly
        state.stack.forEach(e => e.highlighted = false);
        entry.highlighted = true;
        log('READ', `[${base}${offset >= 0 ? '+' : ''}${offset}] = ${entry.value}${entry.label ? ' (' + entry.label + ')' : ''}`);
        return { addr, value: entry.value, label: entry.label, kind: entry.kind };
    }

    // Explain helpers
    function explainPush(result, value) {
        return {
            asm: `push ${value}`,
            desc: steps(
                `<strong>ESP decreases by 4</strong>: ${fmtAddr(result.oldEsp)} &rarr; ${fmtAddr(result.newEsp)}. The stack grows <em>downward</em> in memory.`,
                `<strong>Value stored at [ESP]</strong>: the 4-byte value <code>${value}</code> is written to the new ESP address.`,
                `Pattern: <code>push src</code> = <code>sub esp, 4; mov [esp], src</code>`
            )
        };
    }
    function explainPop(result, reg) {
        if (result.error) return { asm: `pop ${reg}`, desc: `<strong style="color:#f38ba8">ERROR:</strong> stack is empty. There's nothing to pop. In a real program, this would read garbage memory.` };
        return {
            asm: `pop ${reg}`,
            desc: steps(
                `<strong>Value read from [ESP]</strong>: the 4-byte value at ${fmtAddr(result.oldEsp)} is loaded into <code>${reg.toUpperCase()}</code>. ${reg.toUpperCase()} = ${result.value}.`,
                `<strong>ESP increases by 4</strong>: ${fmtAddr(result.oldEsp)} &rarr; ${fmtAddr(result.newEsp)}. The value is still in memory, but ESP has moved past it.`,
                `Pattern: <code>pop dest</code> = <code>mov dest, [esp]; add esp, 4</code>`
            )
        };
    }
    function explainCall(result) {
        return {
            asm: `call ${result.funcName}`,
            desc: steps(
                `<strong>Return address is pushed</strong>: the address of the next instruction after <code>call</code> is pushed onto the stack.`,
                `<strong>EIP jumps to target</strong>: execution continues at <code>${result.funcName}</code>.`,
                `The callee can now execute its prologue and body. <code>RET</code> will pop the return address to come back.`
            )
        };
    }
    function explainRet(result) {
        if (result.popResult.error) return { asm: 'ret', desc: `<strong style="color:#f38ba8">ERROR:</strong> stack is empty, nothing to return to.` };
        const warn = !result.wasReturn ? '<strong style="color:#f38ba8">WARNING:</strong> the top of stack was not a return address! You will jump to garbage memory. This is a common bug from unbalanced pushes/pops.<br><br>' : '';
        return {
            asm: `ret`,
            desc: warn + steps(
                `<strong>Return address popped</strong>: the value at [ESP] (${result.popResult.value}) is loaded into EIP.`,
                `<strong>ESP increases by 4</strong>: now pointing at what was below the return address (usually the arguments or the caller's frame).`,
                `<strong>EIP jumps back</strong>: execution resumes at the return address in the caller.`
            )
        };
    }
    function explainPrologue(result) {
        return {
            asm: `push ebp; mov ebp, esp`,
            desc: steps(
                `<strong>push ebp</strong>: saves the caller's EBP so we can restore it later. Old EBP (${fmtAddr(result.oldEbp)}) is now on the stack.`,
                `<strong>mov ebp, esp</strong>: sets EBP to current ESP. EBP is now anchored to this function's frame base.`,
                `From now on: <code>[ebp-4]</code> = first local, <code>[ebp+8]</code> = first argument (since +0 is saved EBP and +4 is return address).`
            )
        };
    }
    function explainAlloc(result) {
        return {
            asm: `sub esp, ${result.bytes}`,
            desc: steps(
                `<strong>Space reserved</strong>: ESP drops by ${result.bytes} bytes, creating ${result.numSlots} local variable slot${result.numSlots !== 1 ? 's' : ''}.`,
                `<strong>No values written</strong>: unlike PUSH, ALLOC doesn't store anything &mdash; the slots contain whatever was in memory (uninitialized).`,
                `Access these via <code>[ebp-4]</code>, <code>[ebp-8]</code>, etc.`
            )
        };
    }
    function explainLeave(result) {
        if (result.error === 'no-frame') return { asm: 'leave', desc: `<strong style="color:#f38ba8">ERROR:</strong> no stack frame to leave (EBP = 0). This function's prologue was never executed.` };
        if (result.error === 'no-saved-ebp') return { asm: 'leave', desc: `<strong style="color:#f38ba8">WARNING:</strong> expected saved EBP at top of stack, but didn't find one. Stack is corrupted.` };
        return {
            asm: `leave`,
            desc: steps(
                `<strong>mov esp, ebp</strong>: ESP jumps back to EBP, deallocating all local variables in one step.`,
                `<strong>pop ebp</strong>: restores the caller's EBP (${fmtAddr(result.newEbp)}). Our frame is gone.`,
                `Next instruction is usually <code>ret</code>, which returns to the caller.`
            )
        };
    }
    function explainRead(result, base, offset) {
        const bracket = `[${base}${offset >= 0 ? '+' : ''}${offset}]`;
        if (result.unmapped) {
            return {
                asm: `mov reg, ${bracket}`,
                desc: `<strong style="color:#f38ba8">Unmapped address</strong>: ${fmtAddr(result.addr)} has no value in this playground state. In a real program, this would read whatever raw bytes happened to be there.`
            };
        }
        const interpretation = [];
        if (base === 'ebp') {
            if (offset < 0) interpretation.push(`This is a <strong>local variable</strong> (negative offset from EBP).`);
            else if (offset === 0) interpretation.push(`This is the <strong>saved old EBP</strong> from the prologue.`);
            else if (offset === 4) interpretation.push(`This is the <strong>return address</strong> pushed by CALL.`);
            else if (offset >= 8) interpretation.push(`This is <strong>argument ${Math.floor((offset - 8) / 4) + 1}</strong> (first arg at +8, next at +12, etc.).`);
        } else {
            interpretation.push(`Reading <code>${bracket}</code> &mdash; ESP-relative access is common when there's no EBP frame set up.`);
        }
        return {
            asm: `mov reg, ${bracket}`,
            desc: steps(
                `Address computed: ${base.toUpperCase()} (${fmtAddr(base === 'ebp' ? state.ebp : state.esp)}) ${offset >= 0 ? '+' : ''} ${offset} = ${fmtAddr(result.addr)}`,
                `Value at that address: <code>${result.value}</code>${result.label ? ` (labeled "${result.label}")` : ''}`,
                interpretation.join(' ')
            )
        };
    }

    // Wire buttons
    document.querySelectorAll('#sp-mode-explore .sp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            let explain = null;
            switch (action) {
                case 'push': {
                    const v = document.getElementById('sp-push-val').value.trim();
                    let val = parseInt(v);
                    if (v.startsWith('0x')) val = parseInt(v, 16);
                    if (isNaN(val)) { log('PUSH', 'Invalid value'); render(); return; }
                    const r = doPush(val);
                    explain = explainPush(r, val);
                    break;
                }
                case 'pop': {
                    const reg = document.getElementById('sp-pop-reg').value;
                    const r = doPop(reg);
                    explain = explainPop(r, reg);
                    break;
                }
                case 'read': {
                    const base = document.getElementById('sp-read-base').value;
                    const offsetStr = document.getElementById('sp-read-offset').value.trim();
                    const offset = parseInt(offsetStr) || 0;
                    const r = doRead(base, offset);
                    explain = explainRead(r, base, offset);
                    break;
                }
                case 'call': {
                    const name = document.getElementById('sp-call-name').value.trim() || 'func';
                    const r = doCall(name);
                    explain = explainCall(r);
                    break;
                }
                case 'ret': {
                    const r = doRet();
                    explain = explainRet(r);
                    break;
                }
                case 'prologue': {
                    const r = doPrologue();
                    explain = explainPrologue(r);
                    break;
                }
                case 'alloc': {
                    const bytes = parseInt(document.getElementById('sp-local-bytes').value) || 0;
                    if (bytes > 0) {
                        const r = doAlloc(bytes);
                        explain = explainAlloc(r);
                    }
                    break;
                }
                case 'leave': {
                    const r = doLeave();
                    explain = explainLeave(r);
                    break;
                }
                case 'exec': {
                    const line = document.getElementById('sp-exec-input').value.trim();
                    if (!line) break;
                    const r = execAsm(line);
                    explain = explainExec(r);
                    // Clear input on success
                    if (r.success) document.getElementById('sp-exec-input').value = '';
                    break;
                }
            }
            render();
            if (explain) setExplain(explain.asm, explain.desc);
            // Clear highlights after a moment
            setTimeout(() => {
                if (state) {
                    state.stack.forEach(e => { e.highlighted = false; });
                    changedRegs = new Set();
                }
                render();
            }, 2500);
        });
    });

    // Enter key in execute input triggers exec
    const execInput = document.getElementById('sp-exec-input');
    if (execInput) {
        execInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.querySelector('.sp-btn[data-action="exec"]').click();
            }
        });
    }

    document.getElementById('sp-reset').addEventListener('click', () => reset());

    const scenarios = {
        empty: () => { reset(); },
        'push-pop': () => {
            reset(); doPush(10); doPush(20); doPush(30);
        },
        'function-call': () => {
            reset(); doCall('myfunc'); doPrologue();
        },
        'nested-call': () => {
            reset(); doCall('outer'); doPrologue(); doCall('inner'); doPrologue();
        },
        'local-vars': () => {
            reset(); doCall('func'); doPrologue(); doAlloc(12);
        },
        'args-call': () => {
            reset();
            doPush(300, 'arg 3 (c)', 'arg');
            doPush(200, 'arg 2 (b)', 'arg');
            doPush(100, 'arg 1 (a)', 'arg');
            doCall('func'); doPrologue();
        },
    };

    // Scenario explanations shown in the "What's Happening" panel when loaded
    const scenarioExplanations = {
        empty: {
            asm: 'reset',
            desc: `<strong>Empty stack</strong> — ESP is at its initial value (0x00200000) and nothing is on the stack yet. Start by clicking PUSH, PROLOGUE, or any EXECUTE instruction to see things happen.`
        },
        'push-pop': {
            asm: 'push 10; push 20; push 30',
            desc: `<strong>Observe LIFO behavior:</strong> Three values were pushed. Notice that 30 (the last pushed) is at the lowest address (top of stack) where ESP points. If you now POP three times, you'll get 30, then 20, then 10. <em>Try it: click POP a few times.</em>`
        },
        'function-call': {
            asm: 'call myfunc; push ebp; mov ebp, esp',
            desc: `<strong>Observe the call frame setup:</strong> CALL pushed the return address. Then the prologue saved the caller's EBP and set our new EBP. Notice that ESP and EBP now point to the same cell — that's the saved old EBP. <em>Try reading [ebp+4] with the READ button to see the return address.</em>`
        },
        'nested-call': {
            asm: 'call outer; push ebp; mov ebp, esp; call inner; push ebp; mov ebp, esp',
            desc: `<strong>Observe nested frames:</strong> Two functions are active. The stack has two return addresses and two saved EBPs. EBP points to the innermost frame. RET would unwind one level; RET again would unwind fully. <em>Try clicking LEAVE then RET to unwind one frame.</em>`
        },
        'local-vars': {
            asm: 'call func; push ebp; mov ebp, esp; sub esp, 12',
            desc: `<strong>Observe local variable allocation:</strong> The function set up its frame (EBP points to saved EBP) and then allocated 12 bytes for 3 local variables. The slots show "?" because ALLOC doesn't initialize memory. <em>Try EXECUTE "mov dword ptr [ebp-4], 99" to write to the first local.</em>`
        },
        'args-call': {
            asm: 'push 300; push 200; push 100; call func; push ebp; mov ebp, esp',
            desc: `<strong>Observe argument passing:</strong> The caller pushed 3 args right-to-left (so arg 1 was pushed last and sits at the lowest arg address). CALL added the return address. The function's prologue set up EBP. Now <code>[ebp+8]</code>=arg1=100, <code>[ebp+12]</code>=arg2=200, <code>[ebp+16]</code>=arg3=300. <em>Try READ [ebp+8] to see arg 1.</em>`
        },
    };

    document.getElementById('sp-load').addEventListener('click', () => {
        const scenario = document.getElementById('sp-scenario').value;
        if (scenarios[scenario]) scenarios[scenario]();
        render();
        const exp = scenarioExplanations[scenario];
        if (exp) setExplain(exp.asm, exp.desc);
    });

    // Quick-try chips: click to fill EXECUTE input
    document.querySelectorAll('#sp-quick-chips .sp-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.getElementById('sp-exec-input').value = chip.dataset.chip;
            document.getElementById('sp-exec-input').focus();
        });
    });

    // Key facts card toggle
    const factsToggle = document.getElementById('sp-facts-toggle');
    const factsBody = document.getElementById('sp-facts-body');
    if (factsToggle && factsBody) {
        factsToggle.addEventListener('click', () => {
            const collapsed = factsBody.classList.toggle('collapsed');
            factsToggle.textContent = collapsed ? 'Show' : 'Hide';
        });
    }

    reset();

    // ============ MODE TABS ============
    document.querySelectorAll('.sp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.sp-mode').forEach(m => m.style.display = 'none');
            document.getElementById('sp-mode-' + mode).style.display = '';
        });
    });

    // ============ STEP-THROUGH MODE ============
    initStepThrough();

    // ============ PUZZLE MODE ============
    initStackPuzzle();

    // ============ ERRORS MODE ============
    initErrors();
}

// Step-Through walkthrough engine
function initStepThrough() {
    const ESP_INIT = 0x00200000;
    let stepState = null;
    let stepIdx = 0;
    let walkthrough = null;

    const walkthroughs = {
        'full-function': {
            title: 'Full function call (caller + callee)',
            code: [
                { type: 'comment', text: '; Caller side' },
                { type: 'code', text: 'push 100          ; push argument', asm: 'push 100', exec: s => doStep(s, 'push', 100, 'arg 1', 'arg') },
                { type: 'code', text: 'call myfunc       ; call the function', asm: 'call myfunc', exec: s => doStep(s, 'call', 'myfunc') },
                { type: 'comment', text: '; --- Inside myfunc ---' },
                { type: 'label', text: 'myfunc:' },
                { type: 'code', text: 'push ebp          ; save caller EBP', asm: 'push ebp', exec: s => doStep(s, 'prologue-push') },
                { type: 'code', text: 'mov ebp, esp      ; set up our frame', asm: 'mov ebp, esp', exec: s => doStep(s, 'prologue-mov') },
                { type: 'code', text: 'sub esp, 4        ; allocate 1 local', asm: 'sub esp, 4', exec: s => doStep(s, 'alloc', 4) },
                { type: 'code', text: 'mov eax, [ebp+8]  ; read the argument', asm: 'mov eax, [ebp+8]', exec: s => doStep(s, 'read', 'ebp', 8) },
                { type: 'code', text: 'mov [ebp-4], eax  ; store in local', asm: 'mov [ebp-4], eax', exec: s => doStep(s, 'write-local', 0, 100) },
                { type: 'comment', text: '; Epilogue' },
                { type: 'code', text: 'mov esp, ebp      ; deallocate locals', asm: 'mov esp, ebp', exec: s => doStep(s, 'leave-mov') },
                { type: 'code', text: 'pop ebp           ; restore caller EBP', asm: 'pop ebp', exec: s => doStep(s, 'leave-pop') },
                { type: 'code', text: 'ret               ; return to caller', asm: 'ret', exec: s => doStep(s, 'ret') },
                { type: 'comment', text: '; --- Back in caller ---' },
                { type: 'code', text: 'add esp, 4        ; clean up pushed arg', asm: 'add esp, 4', exec: s => doStep(s, 'cleanup', 4) },
            ],
            explanations: [
                null,
                'We push the argument 100 onto the stack. ESP drops by 4.',
                'CALL pushes the return address so we know where to come back to, then jumps to myfunc.',
                null,
                null,
                'Prologue step 1: save the caller\'s EBP so we can restore it later. This is what "push ebp" means.',
                'Prologue step 2: EBP now points to where we saved the old EBP. All argument/local accesses reference EBP from here on.',
                'Allocate 4 bytes of local variable space. ESP drops by 4. The value is uninitialized.',
                'Reading [ebp+8] = the first argument (skipping saved EBP at +0 and return address at +4). We get 100.',
                'Store EAX into our local variable at [ebp-4]. Now our local holds 100.',
                null,
                'Epilogue: "mov esp, ebp" deallocates all locals in one step.',
                'Pop the saved EBP back into EBP. We\'ve restored the caller\'s frame.',
                'RET pops the return address and jumps back to the caller.',
                null,
                'Caller cleans up the pushed argument with "add esp, 4". Stack is now as it was before the call.',
            ]
        },
        'prologue-epilogue': {
            title: 'Prologue & Epilogue',
            code: [
                { type: 'comment', text: '; Starting state: ESP = 0x00200000, EBP = 0' },
                { type: 'code', text: 'push ebp', asm: 'push ebp', exec: s => doStep(s, 'prologue-push') },
                { type: 'code', text: 'mov ebp, esp', asm: 'mov ebp, esp', exec: s => doStep(s, 'prologue-mov') },
                { type: 'code', text: 'sub esp, 8        ; 2 local vars', asm: 'sub esp, 8', exec: s => doStep(s, 'alloc', 8) },
                { type: 'comment', text: '; ... function body ...' },
                { type: 'code', text: 'mov esp, ebp', asm: 'mov esp, ebp', exec: s => doStep(s, 'leave-mov') },
                { type: 'code', text: 'pop ebp', asm: 'pop ebp', exec: s => doStep(s, 'leave-pop') },
            ],
            explanations: [
                null,
                'push ebp: save caller\'s EBP on the stack (the "old EBP"). ESP drops by 4.',
                'mov ebp, esp: EBP now equals ESP. Our frame base is anchored here. Everything in our function references EBP.',
                'sub esp, 8: allocate 2 local variable slots ([ebp-4] and [ebp-8]). Values are uninitialized.',
                null,
                'mov esp, ebp: jump ESP back to EBP, erasing all the locals in one step.',
                'pop ebp: restore the caller\'s EBP. ESP jumps up by 4. Our frame is completely gone.',
            ]
        },
        'args-read': {
            title: 'Reading arguments inside a function',
            code: [
                { type: 'code', text: 'push 300          ; arg3', asm: 'push 300', exec: s => doStep(s, 'push', 300, 'arg 3', 'arg') },
                { type: 'code', text: 'push 200          ; arg2', asm: 'push 200', exec: s => doStep(s, 'push', 200, 'arg 2', 'arg') },
                { type: 'code', text: 'push 100          ; arg1', asm: 'push 100', exec: s => doStep(s, 'push', 100, 'arg 1', 'arg') },
                { type: 'code', text: 'call fn', asm: 'call fn', exec: s => doStep(s, 'call', 'fn') },
                { type: 'comment', text: '; Inside fn:' },
                { type: 'code', text: 'push ebp', asm: 'push ebp', exec: s => doStep(s, 'prologue-push') },
                { type: 'code', text: 'mov ebp, esp', asm: 'mov ebp, esp', exec: s => doStep(s, 'prologue-mov') },
                { type: 'code', text: 'mov eax, [ebp+8]  ; arg1', asm: 'mov eax, [ebp+8]', exec: s => doStep(s, 'read', 'ebp', 8) },
                { type: 'code', text: 'mov ebx, [ebp+12] ; arg2', asm: 'mov ebx, [ebp+12]', exec: s => doStep(s, 'read', 'ebp', 12) },
                { type: 'code', text: 'mov ecx, [ebp+16] ; arg3', asm: 'mov ecx, [ebp+16]', exec: s => doStep(s, 'read', 'ebp', 16) },
            ],
            explanations: [
                'Arguments pushed right-to-left in cdecl. Last push = first arg.',
                'Second argument pushed.',
                'First argument pushed (will be at lowest address = first accessed).',
                'CALL pushes return address.',
                null,
                'Save caller\'s EBP.',
                'Set up our frame. Now [ebp+0]=saved EBP, [ebp+4]=return addr, [ebp+8]=arg1.',
                'Reading [ebp+8] = first argument (100). This is the ARG_0 / arg_0 in IDA notation.',
                'Reading [ebp+12] = second argument (200).',
                'Reading [ebp+16] = third argument (300).',
            ]
        },
        'local-write-read': {
            title: 'Write & read local variables',
            code: [
                { type: 'code', text: 'push ebp', asm: 'push ebp', exec: s => doStep(s, 'prologue-push') },
                { type: 'code', text: 'mov ebp, esp', asm: 'mov ebp, esp', exec: s => doStep(s, 'prologue-mov') },
                { type: 'code', text: 'sub esp, 8        ; 2 locals', asm: 'sub esp, 8', exec: s => doStep(s, 'alloc', 8) },
                { type: 'code', text: 'mov [ebp-4], 42   ; local_1 = 42', asm: 'mov [ebp-4], 42', exec: s => doStep(s, 'write-local', 0, 42) },
                { type: 'code', text: 'mov [ebp-8], 99   ; local_2 = 99', asm: 'mov [ebp-8], 99', exec: s => doStep(s, 'write-local', 1, 99) },
                { type: 'code', text: 'mov eax, [ebp-4]  ; read local_1', asm: 'mov eax, [ebp-4]', exec: s => doStep(s, 'read', 'ebp', -4) },
                { type: 'code', text: 'mov ebx, [ebp-8]  ; read local_2', asm: 'mov ebx, [ebp-8]', exec: s => doStep(s, 'read', 'ebp', -8) },
            ],
            explanations: [
                'Save caller\'s EBP.',
                'Anchor our frame at this ESP value.',
                'Allocate 8 bytes = 2 local variable slots (uninitialized).',
                'Write 42 to the first local variable at [ebp-4].',
                'Write 99 to the second local at [ebp-8].',
                'Read the first local back: EAX = 42.',
                'Read the second local: EBX = 99. Notice offsets are negative for locals.',
            ]
        },
        'lifo': {
            title: 'LIFO (Last In, First Out)',
            code: [
                { type: 'code', text: 'push 10', asm: 'push 10', exec: s => doStep(s, 'push', 10) },
                { type: 'code', text: 'push 20', asm: 'push 20', exec: s => doStep(s, 'push', 20) },
                { type: 'code', text: 'push 30', asm: 'push 30', exec: s => doStep(s, 'push', 30) },
                { type: 'code', text: 'pop eax           ; eax = ?', asm: 'pop eax', exec: s => doStep(s, 'pop', 'eax') },
                { type: 'code', text: 'pop ebx           ; ebx = ?', asm: 'pop ebx', exec: s => doStep(s, 'pop', 'ebx') },
                { type: 'code', text: 'pop ecx           ; ecx = ?', asm: 'pop ecx', exec: s => doStep(s, 'pop', 'ecx') },
            ],
            explanations: [
                'Push 10. It sits at the bottom of our stack.',
                'Push 20. It goes on top of 10.',
                'Push 30. It\'s now on top of the stack.',
                'Pop to EAX. Last in = first out. EAX = 30.',
                'Pop to EBX = 20.',
                'Pop to ECX = 10. Stack is empty again.',
            ]
        },
    };

    // Step state helpers (similar to explore but for step mode)
    function spReset() {
        stepState = {
            esp: ESP_INIT,
            ebp: 0,
            stack: [],
            pc: 1000,
        };
    }
    spReset();

    function doStep(s, type, ...args) {
        switch (type) {
            case 'push': {
                const [value, label, kind] = args;
                s.esp -= 4;
                s.stack.push({ addr: s.esp, value, label: label || '', kind: kind || '' });
                break;
            }
            case 'pop': {
                s.stack = s.stack.filter(e => e.addr !== s.esp);
                s.esp += 4;
                break;
            }
            case 'call': {
                s.esp -= 4;
                const retAddr = s.pc + 5;
                s.pc = retAddr + 100;
                s.stack.push({ addr: s.esp, value: `retaddr:${retAddr.toString(16)}`, label: 'return address', kind: 'retaddr' });
                break;
            }
            case 'prologue-push': {
                s.esp -= 4;
                s.stack.push({ addr: s.esp, value: s.ebp >>> 0, label: 'saved old EBP', kind: 'savedebp' });
                break;
            }
            case 'prologue-mov': {
                s.ebp = s.esp;
                break;
            }
            case 'alloc': {
                const bytes = args[0];
                const slots = bytes / 4;
                for (let i = 0; i < slots; i++) {
                    s.esp -= 4;
                    const offsetFromEbp = s.ebp - s.esp;
                    s.stack.push({ addr: s.esp, value: '?', label: `local [ebp-${offsetFromEbp}]`, kind: 'local' });
                }
                break;
            }
            case 'read': {
                const [base, offset] = args;
                const addr = (base === 'ebp' ? s.ebp : s.esp) + offset;
                s.stack.forEach(e => e.highlighted = false);
                const entry = s.stack.find(e => e.addr === addr);
                if (entry) entry.highlighted = true;
                break;
            }
            case 'write-local': {
                const [idx, value] = args;
                const addr = s.ebp - (idx + 1) * 4;
                const entry = s.stack.find(e => e.addr === addr);
                if (entry) { entry.value = value; entry.highlighted = true; }
                break;
            }
            case 'leave-mov': {
                s.stack = s.stack.filter(e => e.addr >= s.ebp);
                s.esp = s.ebp;
                break;
            }
            case 'leave-pop': {
                const saved = s.stack.find(e => e.addr === s.esp);
                if (saved && saved.kind === 'savedebp') {
                    s.ebp = typeof saved.value === 'number' ? saved.value : 0;
                    s.stack = s.stack.filter(e => e.addr !== s.esp);
                    s.esp += 4;
                }
                break;
            }
            case 'ret': {
                s.stack = s.stack.filter(e => e.addr !== s.esp);
                s.esp += 4;
                break;
            }
            case 'cleanup': {
                const bytes = args[0];
                // Remove cells from stack up to bytes
                for (let i = 0; i < bytes / 4; i++) {
                    s.stack = s.stack.filter(e => e.addr !== s.esp);
                    s.esp += 4;
                }
                break;
            }
        }
    }

    function renderStep() {
        if (!walkthrough) return;
        document.getElementById('sp-step-esp').textContent = '0x' + (stepState.esp >>> 0).toString(16).toUpperCase().padStart(8, '0');
        document.getElementById('sp-step-ebp').textContent = '0x' + (stepState.ebp >>> 0).toString(16).toUpperCase().padStart(8, '0');

        const stackEl = document.getElementById('sp-step-stack');
        if (stepState.stack.length === 0) {
            stackEl.innerHTML = '<div class="sp-empty-stack">Stack is empty.</div>';
        } else {
            const sorted = [...stepState.stack].sort((a, b) => b.addr - a.addr);
            stackEl.innerHTML = sorted.map(entry => {
                const isEsp = entry.addr === stepState.esp;
                const isEbp = entry.addr === stepState.ebp && stepState.ebp !== 0;
                let cls = 'sp-cell';
                if (isEsp && isEbp) cls += ' is-both';
                else if (isEsp) cls += ' is-esp';
                else if (isEbp) cls += ' is-ebp';
                if (entry.kind) cls += ' is-' + entry.kind;
                if (entry.highlighted) cls += ' highlighted';
                const pointers = [];
                if (isEsp) pointers.push('&larr; ESP');
                if (isEbp) pointers.push('&larr; EBP');
                const valDisplay = typeof entry.value === 'string' ? entry.value : (entry.value >>> 0).toString();
                return `<div class="${cls}">
                    <span class="sp-cell-addr">0x${entry.addr.toString(16).toUpperCase().padStart(8, '0')}</span>
                    <span class="sp-cell-value">${valDisplay}</span>
                    <span class="sp-cell-label">${entry.label || ''}</span>
                    <span class="sp-cell-pointer">${pointers.join(' ')}</span>
                </div>`;
            }).join('');
        }

        // Code highlighting
        const codeEl = document.getElementById('sp-step-code');
        codeEl.innerHTML = walkthrough.code.map((line, i) => {
            let cls = 'sp-step-code-line';
            if (line.type === 'label') cls += ' label';
            if (line.type === 'comment') cls += ' comment';
            if (i < stepIdx) cls += ' executed';
            if (i === stepIdx) cls += ' current';
            return `<div class="${cls}">${line.text}</div>`;
        }).join('');

        // Scroll current into view
        const cur = codeEl.querySelector('.current');
        if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        // Progress
        const total = walkthrough.code.length;
        document.getElementById('sp-step-counter').textContent = `Step ${stepIdx} / ${total}`;
        document.getElementById('sp-step-bar-fill').style.width = `${(stepIdx / total) * 100}%`;

        // Current step explanation
        const currentLine = walkthrough.code[stepIdx - 1] || walkthrough.code[stepIdx];
        const explanation = walkthrough.explanations[stepIdx - 1];
        if (stepIdx === 0) {
            document.getElementById('sp-step-asm').innerHTML = '&mdash;';
            document.getElementById('sp-step-desc').innerHTML = 'Click <strong>Next &rarr;</strong> to execute the first instruction.';
        } else if (currentLine && currentLine.asm) {
            document.getElementById('sp-step-asm').textContent = currentLine.asm;
            document.getElementById('sp-step-desc').innerHTML = explanation || '&mdash;';
        } else {
            document.getElementById('sp-step-asm').innerHTML = '&mdash;';
            document.getElementById('sp-step-desc').innerHTML = explanation || 'Comment / label &mdash; click Next to continue.';
        }

        // Button states
        document.getElementById('sp-step-prev').disabled = stepIdx === 0;
        document.getElementById('sp-step-next').disabled = stepIdx >= total;
    }

    function loadWalk(key) {
        walkthrough = walkthroughs[key];
        stepIdx = 0;
        spReset();
        renderStep();
    }

    function stepForward() {
        if (!walkthrough || stepIdx >= walkthrough.code.length) return;
        const line = walkthrough.code[stepIdx];
        if (line.exec) line.exec(stepState);
        stepIdx++;
        renderStep();
    }

    function stepBack() {
        // Replay from start up to stepIdx-1
        if (stepIdx === 0) return;
        spReset();
        const target = stepIdx - 1;
        for (let i = 0; i < target; i++) {
            const line = walkthrough.code[i];
            if (line.exec) line.exec(stepState);
        }
        stepIdx = target;
        renderStep();
    }

    function resetStep() {
        if (walkthrough) {
            stepIdx = 0;
            spReset();
            renderStep();
        }
    }

    document.getElementById('sp-step-load').addEventListener('click', () => {
        const key = document.getElementById('sp-step-scenario').value;
        loadWalk(key);
    });
    document.getElementById('sp-step-next').addEventListener('click', stepForward);
    document.getElementById('sp-step-prev').addEventListener('click', stepBack);
    document.getElementById('sp-step-reset').addEventListener('click', resetStep);

    // Auto-load first scenario
    loadWalk('full-function');
}

// Stack Puzzle mode
function initStackPuzzle() {
    let puzzleScore = 0, puzzleStreak = 0, puzzleBest = 0;
    let currentPuzzle = null;

    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function generatePuzzle() {
        const templates = [
            () => {
                // Pure push/pop
                const values = [rand(1,99), rand(1,99), rand(1,99)];
                const ops = [`push ${values[0]}`, `push ${values[1]}`, `push ${values[2]}`, 'pop eax'];
                const finalEsp = -4 * 2; // 3 pushes - 1 pop = 2 net pushes
                const topValue = values[1]; // after popping the last push, top is middle
                return {
                    initial: 'ESP = 0x00200000, EBP = 0x00000000, stack empty',
                    ops, finalEsp, finalEbp: 0, topValue,
                    questions: ['final-esp', 'top-value']
                };
            },
            () => {
                // Prologue + alloc
                const locals = pick([4, 8, 12, 16]);
                const ops = ['push ebp', 'mov ebp, esp', `sub esp, ${locals}`];
                // ESP was 0x200000, after push ebp: -4, after sub: -4-locals
                return {
                    initial: 'ESP = 0x00200000, EBP = 0x00100000 (caller\'s), stack empty',
                    ops,
                    finalEsp: -4 - locals,
                    finalEbp: -4,
                    initEbp: 0x00100000,
                    questions: ['final-esp', 'final-ebp']
                };
            },
            () => {
                // Args + call
                const a = rand(10, 99), b = rand(10, 99);
                const ops = [`push ${b}`, `push ${a}`, 'call func'];
                return {
                    initial: 'ESP = 0x00200000, stack empty',
                    ops,
                    finalEsp: -12, // 2 pushes + call (return addr) = 3 * 4
                    topValue: '<return address>',
                    questions: ['final-esp', 'bytes-pushed']
                };
            },
            () => {
                // LEAVE undoes
                const locals = 8;
                const ops = ['push ebp', 'mov ebp, esp', `sub esp, ${locals}`, '; ... body ...', 'leave'];
                return {
                    initial: 'ESP = 0x00200000, EBP = 0x00100000, stack empty',
                    ops,
                    finalEsp: 0,
                    finalEbp: 0x00100000,
                    initEbp: 0x00100000,
                    questions: ['final-esp', 'final-ebp']
                };
            },
            () => {
                // Unbalanced push/pop
                const n = rand(3, 5);
                const pops = rand(1, n - 1);
                const ops = [];
                for (let i = 0; i < n; i++) ops.push(`push ${rand(1,99)}`);
                for (let i = 0; i < pops; i++) ops.push('pop eax');
                return {
                    initial: 'ESP = 0x00200000, stack empty',
                    ops,
                    finalEsp: -4 * (n - pops),
                    questions: ['final-esp']
                };
            },
        ];
        return pick(templates)();
    }

    function render() {
        document.getElementById('sp-puzzle-score').textContent = puzzleScore;
        document.getElementById('sp-puzzle-streak').textContent = puzzleStreak;
        document.getElementById('sp-puzzle-best').textContent = puzzleBest;
    }

    function newPuzzle() {
        currentPuzzle = generatePuzzle();
        const p = currentPuzzle;
        const espInit = 0x00200000;
        const expectedEsp = espInit + (p.finalEsp || 0);
        const ebpInit = p.initEbp !== undefined ? p.initEbp : 0;
        const expectedEbp = p.finalEbp !== undefined ? p.finalEbp : ebpInit;

        let inputs = '';
        if (p.questions.includes('final-esp')) {
            inputs += `<div class="quiz-input-group"><label>Final ESP (hex)</label><input type="text" id="sp-puz-esp" placeholder="0x..." autocomplete="off"></div>`;
        }
        if (p.questions.includes('final-ebp')) {
            inputs += `<div class="quiz-input-group"><label>Final EBP (hex)</label><input type="text" id="sp-puz-ebp" placeholder="0x..." autocomplete="off"></div>`;
        }
        if (p.questions.includes('top-value')) {
            inputs += `<div class="quiz-input-group"><label>Value at [ESP]</label><input type="text" id="sp-puz-top" placeholder="?" autocomplete="off"></div>`;
        }
        if (p.questions.includes('bytes-pushed')) {
            inputs += `<div class="quiz-input-group"><label>Bytes pushed</label><input type="text" id="sp-puz-bytes" placeholder="?" autocomplete="off"></div>`;
        }

        document.getElementById('sp-puzzle-area').innerHTML = `
            <div class="sp-puzzle-initial"><strong>Initial state:</strong> ${p.initial}</div>
            <div class="sp-puzzle-ops">${p.ops.join('\n')}</div>
            <p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:0.6rem">After executing these operations, what is the final state?</p>
            <div class="quiz-inputs">${inputs}</div>
            <button class="sim-btn primary quiz-submit" id="sp-puz-check">Check Answer</button>
            <div id="sp-puz-feedback"></div>
        `;

        currentPuzzle.expected = {
            esp: expectedEsp >>> 0,
            ebp: expectedEbp >>> 0,
            top: p.topValue,
            bytes: Math.abs(p.finalEsp || 0),
        };

        document.getElementById('sp-puz-check').addEventListener('click', checkPuzzle);
        document.querySelectorAll('#sp-puzzle-area input').forEach(inp => {
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkPuzzle(); });
        });
        document.querySelector('#sp-puzzle-area input')?.focus();
    }

    function checkPuzzle() {
        const p = currentPuzzle;
        let allOk = true;
        const feedbackLines = [];

        function parseHex(v) {
            v = v.trim();
            if (v.startsWith('0x')) return parseInt(v, 16) >>> 0;
            return parseInt(v, 16) >>> 0;
        }

        if (p.questions.includes('final-esp')) {
            const inp = document.getElementById('sp-puz-esp');
            const got = parseHex(inp.value);
            if (got === p.expected.esp) {
                inp.classList.add('correct');
                feedbackLines.push(`<span class="answer-line"><span class="val-correct">ESP = 0x${p.expected.esp.toString(16).toUpperCase()} ✓</span></span>`);
            } else {
                allOk = false;
                inp.classList.add('wrong');
                feedbackLines.push(`<span class="answer-line">ESP: your answer <span class="val-wrong">${inp.value || '?'}</span> &rarr; correct: <span class="val-correct">0x${p.expected.esp.toString(16).toUpperCase()}</span></span>`);
            }
        }
        if (p.questions.includes('final-ebp')) {
            const inp = document.getElementById('sp-puz-ebp');
            const got = parseHex(inp.value);
            if (got === p.expected.ebp) {
                inp.classList.add('correct');
                feedbackLines.push(`<span class="answer-line"><span class="val-correct">EBP = 0x${p.expected.ebp.toString(16).toUpperCase()} ✓</span></span>`);
            } else {
                allOk = false;
                inp.classList.add('wrong');
                feedbackLines.push(`<span class="answer-line">EBP: your answer <span class="val-wrong">${inp.value || '?'}</span> &rarr; correct: <span class="val-correct">0x${p.expected.ebp.toString(16).toUpperCase()}</span></span>`);
            }
        }
        if (p.questions.includes('top-value')) {
            const inp = document.getElementById('sp-puz-top');
            const got = inp.value.trim();
            const expected = String(p.expected.top);
            if (got === expected || parseInt(got) === parseInt(expected)) {
                inp.classList.add('correct');
                feedbackLines.push(`<span class="answer-line"><span class="val-correct">[ESP] = ${expected} ✓</span></span>`);
            } else {
                allOk = false;
                inp.classList.add('wrong');
                feedbackLines.push(`<span class="answer-line">Top: your answer <span class="val-wrong">${got || '?'}</span> &rarr; correct: <span class="val-correct">${expected}</span></span>`);
            }
        }
        if (p.questions.includes('bytes-pushed')) {
            const inp = document.getElementById('sp-puz-bytes');
            const got = parseInt(inp.value);
            if (got === p.expected.bytes) {
                inp.classList.add('correct');
                feedbackLines.push(`<span class="answer-line"><span class="val-correct">Bytes net = ${p.expected.bytes} ✓</span></span>`);
            } else {
                allOk = false;
                inp.classList.add('wrong');
                feedbackLines.push(`<span class="answer-line">Bytes: your answer <span class="val-wrong">${inp.value || '?'}</span> &rarr; correct: <span class="val-correct">${p.expected.bytes}</span></span>`);
            }
        }

        document.getElementById('sp-puz-check').disabled = true;
        const fb = document.getElementById('sp-puz-feedback');
        if (allOk) {
            puzzleScore++;
            puzzleStreak++;
            if (puzzleStreak > puzzleBest) puzzleBest = puzzleStreak;
            fb.className = 'quiz-feedback correct';
            fb.innerHTML = `Correct!${puzzleStreak > 1 ? ` &mdash; ${puzzleStreak} in a row!` : ''}`;
        } else {
            puzzleStreak = 0;
            fb.className = 'quiz-feedback wrong';
            fb.innerHTML = feedbackLines.join('<br>');
        }
        render();
    }

    document.getElementById('sp-puzzle-new').addEventListener('click', newPuzzle);
    render();
}

// Error scenarios
function initErrors() {
    const errors = {
        'unbalanced-pop': {
            title: 'Unbalanced POP',
            steps: [
                { ok: true, label: 'Initial', desc: 'Stack is empty. <code>ESP = 0x00200000</code>.' },
                { ok: true, label: 'push 10', desc: 'Stack has one value. <code>ESP = 0x001FFFFC</code>, <code>[ESP] = 10</code>.' },
                { ok: true, label: 'pop eax', desc: 'EAX = 10. Stack is empty again. <code>ESP = 0x00200000</code>.' },
                { ok: false, label: 'pop ebx', desc: 'Problem: the stack is empty! POP reads whatever is at [ESP] (which might be garbage from an outer frame) and increments ESP. ESP is now 0x00200004 &mdash; <strong>above</strong> where we started. Any further stack operations will corrupt the caller\'s frame.' },
            ]
        },
        'missing-prologue': {
            title: 'Missing Prologue',
            steps: [
                { ok: true, label: 'Caller: push 100', desc: 'Caller pushes argument. <code>ESP = 0x001FFFFC</code>, <code>[ESP] = 100</code>.' },
                { ok: true, label: 'call badfunc', desc: 'CALL pushes return address. <code>ESP = 0x001FFFF8</code>, <code>[ESP] = return addr</code>.' },
                { ok: false, label: 'No prologue!', desc: 'badfunc forgets to run <code>push ebp; mov ebp, esp</code>. EBP still points to the caller\'s frame.' },
                { ok: false, label: 'mov eax, [ebp+8]', desc: 'Intended to read the argument, but [ebp+8] is now pointing into the caller\'s stack frame &mdash; reading caller\'s data, not the argument! <strong>Classic bug.</strong>' },
            ]
        },
        'missing-cleanup': {
            title: 'Missing Caller Cleanup',
            steps: [
                { ok: true, label: 'push 100', desc: 'Push first arg.' },
                { ok: true, label: 'call func', desc: 'Return address pushed, ESP now 8 bytes below initial.' },
                { ok: true, label: '(function runs and returns)', desc: 'After RET: return address popped. ESP is 4 bytes below initial (the argument is still there).' },
                { ok: false, label: 'Missing: add esp, 4', desc: 'In cdecl, the caller must clean up pushed args. Forgetting <code>add esp, 4</code> leaves the argument on the stack.' },
                { ok: false, label: 'Next function call...', desc: 'Every subsequent call accumulates more leftover args on the stack. Over many calls this causes stack overflow, and the values confuse later reads.' },
            ]
        },
        'ret-no-pushed-ret': {
            title: 'RET Without a Return Address',
            steps: [
                { ok: true, label: 'push 10', desc: 'Normal push. ESP moves down by 4.' },
                { ok: true, label: 'push 20', desc: 'Another push. ESP is 8 bytes below initial.' },
                { ok: false, label: 'ret', desc: 'RET pops [ESP] into EIP and jumps there. But [ESP] contains the value <strong>20</strong>, not a valid return address!' },
                { ok: false, label: 'Jump to address 20', desc: 'EIP = 20. The CPU tries to execute instructions at memory address 0x14. Almost certainly a crash or arbitrary code execution vulnerability. This is the basis of <strong>stack buffer overflow exploits</strong>.' },
            ]
        },
        'wrong-leave': {
            title: 'LEAVE Without Prologue',
            steps: [
                { ok: true, label: 'Starting state', desc: 'ESP = 0x00200000, EBP = 0 (or caller\'s value). No prologue was executed.' },
                { ok: false, label: 'leave', desc: 'LEAVE executes: <code>mov esp, ebp</code> &mdash; ESP becomes whatever EBP is. If EBP = 0, ESP is now 0 (NULL pointer). If EBP is caller\'s value, ESP jumps into the caller\'s frame.' },
                { ok: false, label: 'pop ebp', desc: 'LEAVE\'s second half tries to pop EBP. But we\'re reading from a garbage address. EBP becomes meaningless.' },
                { ok: false, label: 'Fatal corruption', desc: 'The stack is completely corrupted. Any subsequent stack operations will read or write the wrong places. The program will likely crash at the next RET.' },
            ]
        },
        'stack-overflow': {
            title: 'Stack Overflow',
            steps: [
                { ok: true, label: 'recurse() called', desc: 'First call: push ebp, mov ebp, esp, sub esp, N. ESP drops.' },
                { ok: true, label: 'recurse() calls recurse() again', desc: 'Each recursive call pushes a return address, saves EBP, and allocates locals. ESP drops by (4 + 4 + N) bytes per level.' },
                { ok: true, label: '... many recursions later ...', desc: 'ESP keeps decreasing. At some point, it reaches the bottom of the allocated stack region.' },
                { ok: false, label: 'Stack overflow', desc: 'ESP passes the stack\'s lowest valid address. The next push (return address, saved EBP, or local) writes to memory that doesn\'t belong to the stack. Depending on what\'s there, you get a crash (access violation) or undefined behavior. <strong>This is why infinite recursion is fatal.</strong>' },
            ]
        },
    };

    document.querySelectorAll('.sp-error-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.error;
            const e = errors[key];
            if (!e) return;
            document.querySelector('.sp-error-grid').style.display = 'none';
            const detail = document.getElementById('sp-error-detail');
            detail.style.display = '';
            document.getElementById('sp-error-title').textContent = e.title;
            document.getElementById('sp-error-steps').innerHTML = e.steps.map(s =>
                `<div class="sp-error-step${s.ok ? '' : ' bad'}"><strong>${s.label}:</strong> ${s.desc}</div>`
            ).join('');
        });
    });
    document.getElementById('sp-error-back').addEventListener('click', () => {
        document.querySelector('.sp-error-grid').style.display = '';
        document.getElementById('sp-error-detail').style.display = 'none';
    });
}
