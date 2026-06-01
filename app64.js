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

    function refreshTrace() {
        document.querySelectorAll('#sb64-trace .mini-inst').forEach(r => {
            const i = parseInt(r.dataset.idx);
            r.classList.toggle('current', i === pc && !sim.finished);
            r.classList.toggle('executed', i < pc);
        });
    }

    const GP_ALWAYS = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi'];
    const GP_NEW = ['r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'];

    function renderRegs() {
        // pointer cards (RSP / RBP)
        const rspCard = document.getElementById('sb64-rsp-card');
        const rbpCard = document.getElementById('sb64-rbp-card');
        document.getElementById('sb64-rsp').textContent = fmtVal(sim.getReg('rsp'), 64);
        document.getElementById('sb64-rbp').textContent = fmtVal(sim.getReg('rbp'), 64);
        rspCard.classList.toggle('changed', sim.changed.has('rsp'));
        rbpCard.classList.toggle('changed', sim.changed.has('rbp'));

        // general-purpose register grid: always show the core six, plus any
        // new register (R8-R15) the program has touched.
        const shown = sim.shown;
        const list = GP_ALWAYS.concat(GP_NEW.filter(r => shown.has(r)));
        const body = document.getElementById('sb64-regs');
        body.innerHTML = '';
        list.forEach(name => {
            const cell = document.createElement('div');
            const touched = shown.has(name);
            cell.className = 'sb64-reg' + (sim.changed.has(name) ? ' changed' : (touched ? '' : ' dim'));
            cell.innerHTML = `<span class="sb64-reg-name">${name.toUpperCase()}</span>` +
                             `<span class="sb64-reg-val">${fmtVal(sim.getReg(name), 64)}</span>`;
            body.appendChild(cell);
        });

        // flags
        document.getElementById('sb64-flags').innerHTML =
            ['ZF', 'CF', 'SF', 'OF'].map(f =>
                `<span class="sb64-flag${sim.flags[f] ? ' set' : ''}"><b>${f}</b> ${sim.flags[f]}</span>`
            ).join('');

        renderStack();
    }

    function renderStack() {
        const el = document.getElementById('sb64-stack');
        const entries = sim.getStackEntries();
        if (!entries.length) {
            el.innerHTML = '<div class="sb64-empty">Stack is empty. PUSH, CALL, or a prologue will fill it.</div>';
            return;
        }
        el.innerHTML = entries.map(e => {
            const isRsp = e.label.includes('RSP'), isRbp = e.label.includes('RBP');
            const cls = 'stack-entry' + (isRsp ? ' esp' : isRbp ? ' ebp' : '');
            return `<div class="${cls}">` +
                   `<span style="color:var(--text-dim)">0x${e.addr.toString(16).toUpperCase()}</span>` +
                   `<span style="color:var(--text)">0x${e.val.toString(16).toUpperCase()}</span>` +
                   `<span style="color:var(--accent)">${esc(e.label)}</span></div>`;
        }).join('');
    }

    function explain(html) { document.getElementById('sb64-explain').innerHTML = html; }

    function logLine(lineText, result) {
        const log = document.getElementById('sb64-log');
        if (log.querySelector('em')) log.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'padding:0.15rem 0;border-bottom:1px solid rgba(69,71,90,0.3)';
        const color = result.error ? 'var(--red)' : 'var(--text-dim)';
        row.innerHTML = `<span style="color:var(--green)">${esc(lineText)}</span>` +
                        (result.description ? ` <span style="color:${color}">&mdash; ${esc(result.description)}</span>` : '');
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
    }

    function clearLog() {
        document.getElementById('sb64-log').innerHTML = '<em style="color:var(--text-dim)">No instructions executed yet.</em>';
    }

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
        clearLog();
        explain('<h4>Loaded</h4><p class="sp-explain-desc">Program loaded. Click <strong>Step</strong> to execute one instruction at a time, or <strong>Run All</strong> to run to the end.</p>');
        setButtons(true);
    }

    // Execute the current line, capture its result for the explanation panel,
    // then advance the program counter (honoring jumps), mirroring sim.step().
    function stepCapturing() {
        if (!loaded || sim.finished) return;
        const idx = pc;
        const lineText = (lines[idx] || '').trim();
        sim.jumpTarget = null;
        const result = sim.execute(lines[idx]);
        if (sim.jumpTarget !== null) sim.pc = sim.jumpTarget; else sim.pc = idx + 1;
        if (sim.pc >= sim.lines.length) sim.finished = true;
        pc = sim.pc;
        refreshTrace();
        renderRegs();
        const isRealInstr = lineText && !lineText.startsWith(';') && !lineText.startsWith('#') && !/^\w+:$/.test(lineText);
        if (isRealInstr && (result.description || result.error)) {
            const cls = result.error ? 'color:var(--red)' : '';
            explain(`<h4>${result.error ? 'Error' : 'Executed'}</h4>` +
                    `<div class="sp-explain-asm">${esc(lineText)}</div>` +
                    `<p class="sp-explain-desc" style="${cls}">${esc(result.description || '')}</p>`);
            logLine(lineText, result);
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
        return '<h4>Finished</h4><p class="sp-explain-desc">Program reached the end. Click <strong>Reset</strong> to run it again, or edit the code and <strong>Load &amp; Reset</strong>.</p>';
    }

    function reset() {
        if (!loaded) return;
        sim.loadProgram(document.getElementById('sb64-code').value);
        pc = sim.pc;
        buildTrace();
        refreshTrace();
        renderRegs();
        clearLog();
        explain('<h4>Reset</h4><p class="sp-explain-desc">Back to the start. Click <strong>Step</strong> to begin.</p>');
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
                if (sim) renderRegs();
            });
        });
        // collapsible Key Facts panel
        const factsToggle = document.getElementById('sb64-facts-toggle');
        if (factsToggle) {
            factsToggle.addEventListener('click', () => {
                const body = document.getElementById('sb64-facts-body');
                const hidden = body.classList.toggle('collapsed');
                factsToggle.textContent = hidden ? 'Show' : 'Hide';
            });
        }
        // start with a friendly default program and a live (zeroed) register view
        if (!codeEl.value.trim()) codeEl.value = SANDBOX64_EXAMPLES['widths'];
        sim = new AsmSimulator64();
        renderRegs();
        setButtons(false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();