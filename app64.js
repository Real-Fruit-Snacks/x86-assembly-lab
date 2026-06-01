// ============================================================
// x64 Sandbox controller (self-contained). Drives AsmSimulator64.
// Reuses the existing sandbox CSS classes; touches no 32-bit code.
// ============================================================
(function () {
    const SANDBOX64_EXAMPLES = {
        'widths': `; 64-bit register widths and the sub-register rules
mov rax, 0x1122334455667788   ; full 64-bit value (needs 64 bits!)
mov eax, 0xFFFFFFFF           ; writing EAX ZEROES the upper 32 of RAX
mov rax, 0x1122334455667788   ; reset
mov ax, 0xBEEF                ; writing AX preserves the upper 48 bits
mov al, 0x99                  ; writing AL preserves the rest`,

        'newregs': `; The eight new registers R8-R15 and their parts
mov r8, 0xCAFEF00DDEADBEEF    ; full 64-bit
mov r9d, 0x12345678           ; R9D = low 32 (zeroes upper half of R9)
mov r10w, 0xABCD              ; R10W = low 16
mov r11b, 0x42                ; R11B = low 8 (no high-byte form exists)`,

        'arith64': `; 64-bit arithmetic and wraparound
mov rax, 0xFFFFFFFFFFFFFFFF   ; the largest 64-bit value (-1 signed)
add rax, 1                    ; wraps to 0, sets CF (carry out)
mov rbx, 1000000000000        ; a trillion - far beyond 32-bit range
imul rbx, rbx, 3              ; signed multiply, stays exact`,

        'loop64': `; A loop: sum 1..5 using a 64-bit counter
    xor eax, eax              ; eax = 0 (also clears upper RAX)
    mov rcx, 5                ; counter
sum:
    add rax, rcx              ; accumulate
    dec rcx                   ; count down
    jnz sum                   ; loop while rcx != 0
    ; RAX = 15`,

        'callret64': `; A clean call/ret: double a value in place
    mov rax, 21
    call dbl                  ; pushes return address, jumps
    mov rdx, rax              ; RDX = 42
    jmp done
dbl:
    imul rax, rax, 2          ; RAX *= 2
    ret                       ; pops return address
done:
    nop`,

        'winabi': `; Windows x64 calling convention: args in RCX, RDX, R8, R9
; (no PUSHes - the first four integer args go in registers)
    mov rcx, 10               ; 1st argument
    mov rdx, 20               ; 2nd argument
    mov r8, 30                ; 3rd argument
    mov r9, 40                ; 4th argument
    call add4
    ; RAX = 100 (the "return value" register)
    jmp end
add4:
    mov rax, rcx
    add rax, rdx
    add rax, r8
    add rax, r9
    ret
end:
    nop`,
    };

    let sim = null, lines = [], pc = 0, loaded = false, fmt = 'hex';

    function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function hl(line) {
        const m = line.match(/^(\s*)(\w+)(.*)$/);
        if (!m) return esc(line);
        return `${m[1]}<span style="color:var(--mauve,#cba6f7)">${esc(m[2])}</span>${esc(m[3])}`;
    }

    function fmtVal(val, bits) {
        val = BigInt(val) & sim.mask(bits);
        if (fmt === 'hex') return '0x' + val.toString(16).toUpperCase();
        if (fmt === 'bin') return val.toString(2).padStart(bits, '0');
        const s = sim.toSigned(val, bits);
        return s < 0n ? `${s} (${val})` : String(val);
    }

    function buildTrace() {
        const trace = document.getElementById('sb64-trace');
        trace.innerHTML = '';
        lines.forEach((line, i) => {
            const t = line.trim();
            const isComment = t.startsWith(';') || t.startsWith('#');
            const isLabel = /^\w+:$/.test(t);
            const isEmpty = t === '';
            const row = document.createElement('div');
            row.className = 'mini-inst';
            row.dataset.idx = i;
            const asm = isComment
                ? `<span style="color:var(--overlay0,var(--text-dim));font-style:italic">${esc(line)}</span>`
                : isLabel ? `<span class="lbl">${esc(line)}</span>`
                : isEmpty ? '' : hl(line);
            row.innerHTML = `<span class="mini-marker"></span><span class="mini-asm">${asm}</span><span class="mini-result"></span>`;
            trace.appendChild(row);
        });
    }

    function refreshTrace(resultText) {
        document.querySelectorAll('#sb64-trace .mini-inst').forEach(r => {
            const i = parseInt(r.dataset.idx);
            r.classList.toggle('current', i === pc && !sim.finished);
            r.classList.toggle('executed', i < pc);
        });
        if (resultText !== undefined && pc > 0) {
            const prev = document.querySelector(`#sb64-trace .mini-inst[data-idx="${pc - 1}"] .mini-result`);
            // find the actually-executed line (skip blanks/labels handled by engine)
        }
    }

    function renderRegs() {
        const body = document.getElementById('sb64-regs');
        const active = sim.getActiveRegs();
        if (!active.length) {
            body.innerHTML = '<div class="sim-reg-row" style="color:var(--text-dim);font-size:0.8rem">No registers set yet</div>';
        } else {
            body.innerHTML = '';
            active.forEach(name => {
                const row = document.createElement('div');
                const isChanged = sim.changed.has(name);
                row.className = 'sim-reg-row' + (isChanged ? ' changed' : '');
                row.innerHTML = `<span class="sim-reg-name">${name.toUpperCase()}</span>` +
                                `<span class="sim-reg-value">${fmtVal(sim.getReg(name), 64)}</span>`;
                body.appendChild(row);
            });
        }
        // flags
        const fbox = document.getElementById('sb64-flags');
        fbox.style.display = '';
        document.getElementById('sb64-flags-body').innerHTML =
            ['ZF', 'CF', 'SF', 'OF'].map(f =>
                `<div class="sim-reg-row"><span class="sim-reg-name">${f}</span><span class="sim-reg-value">${sim.flags[f]}</span></div>`
            ).join('');
    }

    function explain(html) { document.getElementById('sb64-explain').innerHTML = html; }

    function load() {
        const code = document.getElementById('sb64-code').value;
        sim = new AsmSimulator64();
        sim.loadProgram(code);
        lines = sim.lines;
        pc = sim.pc;
        loaded = true;
        buildTrace();
        refreshTrace();
        renderRegs();
        explain('<h4>Loaded</h4><p>Program loaded. Click <strong>Step</strong> to execute one instruction at a time, or <strong>Run All</strong> to run to the end.</p>');
        setButtons(true);
    }

    // Execute the current line, capture its result for the explanation panel,
    // then advance the program counter (honoring jumps), mirroring sim.step().
    function stepCapturing() {
        if (!loaded || sim.finished) return;
        const idx = pc;
        const lineText = (lines[idx] || '').trim();
        // execute manually to capture result, then advance pc like step()
        sim.jumpTarget = null;
        const result = sim.execute(lines[idx]);
        if (sim.jumpTarget !== null) sim.pc = sim.jumpTarget; else sim.pc = idx + 1;
        if (sim.pc >= sim.lines.length) sim.finished = true;
        pc = sim.pc;
        refreshTrace();
        renderRegs();
        if (result && (result.description || result.error)) {
            const cls = result.error ? 'color:var(--red,#f38ba8)' : '';
            explain(`<h4>${result.error ? 'Error' : 'Executed'}</h4><pre class="code-block" style="margin:0 0 .5rem">${esc(lineText)}</pre><p style="${cls}">${esc(result.description || '')}</p>`);
        }
        if (sim.finished) { setButtons(true, true); }
    }

    function runAll() {
        if (!loaded) return;
        let guard = 0;
        while (!sim.finished && guard < 100000) { stepCapturing(); guard++; }
        explain(explainHtmlDone());
    }

    function explainHtmlDone() {
        return '<h4>Finished</h4><p>Program reached the end. Click <strong>Reset</strong> to run it again, or edit the code and <strong>Load &amp; Reset</strong>.</p>';
    }

    function reset() {
        if (!loaded) return;
        sim.loadProgram(document.getElementById('sb64-code').value);
        pc = sim.pc;
        lastResult = null;
        buildTrace();
        refreshTrace();
        renderRegs();
        explain('<h4>Reset</h4><p>Back to the start. Click <strong>Step</strong> to begin.</p>');
        setButtons(true);
    }

    function setButtons(haveProgram, finished) {
        document.getElementById('sb64-step').disabled = !haveProgram || finished;
        document.getElementById('sb64-runall').disabled = !haveProgram || finished;
        document.getElementById('sb64-reset').disabled = !haveProgram;
    }

    function init() {
        const codeEl = document.getElementById('sb64-code');
        if (!codeEl) return; // section not present
        if (codeEl.dataset.booted) return; // already wired (guard against double-load)
        codeEl.dataset.booted = '1';
        document.getElementById('sb64-run').addEventListener('click', load);
        document.getElementById('sb64-step').addEventListener('click', stepCapturing);
        document.getElementById('sb64-runall').addEventListener('click', runAll);
        document.getElementById('sb64-reset').addEventListener('click', reset);
        document.getElementById('sb64-examples').addEventListener('change', e => {
            const ex = e.target.value;
            if (ex && SANDBOX64_EXAMPLES[ex]) { codeEl.value = SANDBOX64_EXAMPLES[ex]; load(); }
            e.target.value = '';
        });
        document.querySelectorAll('#sb64-regbox .format-btn').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#sb64-regbox .format-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                fmt = b.dataset.fmt;
                if (loaded) renderRegs();
            });
        });
        // start with a friendly default program
        if (!codeEl.value.trim()) codeEl.value = SANDBOX64_EXAMPLES['widths'];
        setButtons(false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();