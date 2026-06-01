// ============================================================
// x64 Playground controller (interactive, button-driven).
// Drives AsmSimulator64. No code editor: actions map to real
// instructions executed on the engine. Self-contained; reuses
// the existing CSS and touches no 32-bit code.
// ============================================================
(function () {
    let sim = null, fmt = 'hex';
    let history = [];          // stack of {snap, callstack, label} for Undo
    let callstack = ['main'];  // call-chain frame names

    const GP_ALWAYS = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi'];
    const GP_NEW = ['r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'];
    const FRAME_COLORS = ['accent', 'mauve', 'green', 'peach', 'teal'];

    function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function $(id) { return document.getElementById(id); }

    function fmtVal(val, bits) {
        val = BigInt(val) & sim.mask(bits);
        if (fmt === 'hex') return '0x' + val.toString(16).toUpperCase();
        if (fmt === 'bin') return val.toString(2).padStart(bits, '0');
        const s = sim.toSigned(val, bits);
        return s < 0n ? `${s} (${val})` : String(val);
    }
    function fmtPtr(val) {
        if (fmt === 'dec') return String(BigInt(val) & sim.mask(64));
        if (fmt === 'bin') return (BigInt(val) & sim.mask(64)).toString(2);
        return '0x' + (BigInt(val) & sim.mask(64)).toString(16).toUpperCase().padStart(16, '0');
    }

    function render() {
        $('sb64-rsp').textContent = fmtPtr(sim.getReg('rsp'));
        $('sb64-rbp').textContent = fmtPtr(sim.getReg('rbp'));
        $('sb64-rsp-card').classList.toggle('changed', sim.changed.has('rsp'));
        $('sb64-rbp-card').classList.toggle('changed', sim.changed.has('rbp'));

        const list = GP_ALWAYS.concat(GP_NEW.filter(r => sim.shown.has(r)));
        const body = $('sb64-regs');
        body.innerHTML = '';
        list.forEach(name => {
            const cell = document.createElement('div');
            const touched = sim.shown.has(name);
            cell.className = 'sb64-reg' + (sim.changed.has(name) ? ' changed' : (touched ? '' : ' dim'));
            cell.innerHTML = `<span class="sb64-reg-name">${name.toUpperCase()}</span>` +
                             `<span class="sb64-reg-val">${fmtVal(sim.getReg(name), 64)}</span>`;
            body.appendChild(cell);
        });

        $('sb64-flags').innerHTML = ['ZF', 'CF', 'SF', 'OF'].map(f =>
            `<span class="sb64-flag${sim.flags[f] ? ' set' : ''}"><b>${f}</b> ${sim.flags[f]}</span>`
        ).join('');

        renderCallstack();
        renderStack();
    }

    function renderCallstack() {
        $('sb64-callstack').innerHTML = callstack.map((name, i) => {
            const color = FRAME_COLORS[i % FRAME_COLORS.length];
            const current = i === callstack.length - 1;
            const arrow = i > 0 ? '<span class="sp-callstack-arrow">&rarr;</span>' : '';
            return `${arrow}<span class="sp-callstack-frame sp-callstack-color-${color}${current ? ' current' : ''}">` +
                   `${esc(name)}${current ? ' <em>(current)</em>' : ''}</span>`;
        }).join('');
    }

    function renderStack() {
        const el = $('sb64-stack');
        const entries = sim.getStackEntries();
        if (!entries.length) {
            el.innerHTML = '<div class="sb64-empty">Stack is empty. PUSH, CALL, or PROLOGUE to begin.</div>';
            return;
        }
        el.innerHTML = entries.map(e => {
            const isRsp = e.label.includes('RSP'), isRbp = e.label.includes('RBP');
            const cls = 'stack-entry' + (isRsp ? ' esp' : isRbp ? ' ebp' : '');
            return `<div class="${cls}">` +
                   `<span style="color:var(--text-dim)">${fmtPtr(e.addr)}</span>` +
                   `<span style="color:var(--text)">0x${e.val.toString(16).toUpperCase()}</span>` +
                   `<span style="color:var(--accent)">${esc(e.label)}</span></div>`;
        }).join('');
    }

    function explain(asm, desc, isErr) {
        $('sb64-explain').innerHTML = `<h4>${isErr ? 'Error' : "What's Happening"}</h4>` +
            (asm ? `<div class="sp-explain-asm">${esc(asm)}</div>` : '') +
            `<p class="sp-explain-desc" style="${isErr ? 'color:var(--red)' : ''}">${desc}</p>`;
    }

    function log(asm, note, isErr) {
        const el = $('sb64-log');
        if (el.querySelector('em')) el.innerHTML = '';
        const row = document.createElement('div');
        row.style.cssText = 'padding:0.15rem 0;border-bottom:1px solid rgba(69,71,90,0.3)';
        row.innerHTML = `<span style="color:var(--green)">${esc(asm)}</span>` +
                        (note ? ` <span style="color:${isErr ? 'var(--red)' : 'var(--text-dim)'}">&mdash; ${esc(note)}</span>` : '');
        el.appendChild(row);
        el.scrollTop = el.scrollHeight;
    }

    function pushHistory(label) {
        history.push({ snap: sim.snapshot(), callstack: callstack.slice(), label });
        $('sb64-undo').disabled = false;
        if (history.length > 200) history.shift();
    }

    function exec(instr, callstackMutation) {
        pushHistory(instr);
        const r = sim.execute(instr);
        if (r.error) { history.pop(); $('sb64-undo').disabled = history.length === 0; }
        else if (callstackMutation) callstackMutation();
        return r;
    }

    function afterAction(instr, r) {
        render();
        if (r.error) { explain(instr, esc(r.description), true); log(instr, r.description, true); }
        else { explain(instr, esc(r.description) || '(done)'); log(instr, r.description); }
    }

    function doPush() {
        const v = $('sb64-push-val').value.trim() || '0';
        const instr = `push ${v}`;
        afterAction(instr, exec(instr));
    }
    function doPop() {
        const instr = `pop ${$('sb64-pop-dst').value}`;
        afterAction(instr, exec(instr));
    }
    function doCall() {
        const name = ($('sb64-call-name').value.trim() || 'func').replace(/[^\w]/g, '');
        const instr = `push 0   ; return address (call ${name})`;
        const r = exec(instr, () => callstack.push(name));
        render();
        if (r.error) { explain(`call ${name}`, esc(r.description), true); log(`call ${name}`, r.description, true); }
        else {
            explain(`call ${name}`, `Pushed the return address onto the stack and entered <strong>${esc(name)}</strong>. RSP dropped by 8. Use RET to return to the caller.`);
            log(`call ${name}`, 'return address pushed; entered ' + name);
        }
    }
    function doRet() {
        if (callstack.length <= 1) {
            explain('ret', 'Already in <strong>main</strong> &mdash; nothing to return to. CALL a function first.', true);
            return;
        }
        const instr = `pop r11  ; discard return address (ret)`;
        const leaving = callstack[callstack.length - 1];
        exec(instr, () => callstack.pop());
        sim.shown.delete('r11');
        render();
        explain('ret', `Returned from <strong>${esc(leaving)}</strong> to <strong>${esc(callstack[callstack.length - 1])}</strong>. The return address was popped and RSP rose by 8.`);
        log('ret', `returned from ${leaving}`);
    }
    function doPrologue() {
        pushHistory('prologue');
        sim.execute('push rbp');
        sim.execute('mov rbp, rsp');
        render();
        explain('push rbp\nmov rbp, rsp', 'Standard function prologue: saved the caller\u2019s RBP on the stack, then pointed RBP at the current RSP. RBP now anchors this frame &mdash; locals live below it, arguments above.');
        log('push rbp; mov rbp, rsp', 'frame established');
    }
    function doAlloc() {
        const n = ($('sb64-alloc-n').value.trim() || '16');
        const instr = `sub rsp, ${n}`;
        const r = exec(instr);
        render();
        if (r.error) { explain(instr, esc(r.description), true); log(instr, r.description, true); }
        else { explain(instr, `Reserved ${esc(n)} bytes of local space by lowering RSP. The gap between RSP and RBP holds this function\u2019s locals.`); log(instr, 'locals reserved'); }
    }
    function doLeave() {
        pushHistory('leave');
        const r = sim.execute('leave');
        render();
        if (r.error) { history.pop(); $('sb64-undo').disabled = history.length === 0; explain('leave', esc(r.description), true); log('leave', r.description, true); }
        else { explain('leave', 'Tore down the frame: set RSP back to RBP (discarding locals), then popped the saved RBP. Equivalent to <code>mov rsp, rbp; pop rbp</code>.'); log('leave', 'frame torn down'); }
    }
    function doExec(instrArg) {
        const instr = (instrArg !== undefined ? instrArg : $('sb64-exec').value).trim();
        if (!instr) return;
        afterAction(instr, exec(instr));
    }

    function undo() {
        if (!history.length) return;
        const prev = history.pop();
        sim.restore(prev.snap);
        callstack = prev.callstack;
        $('sb64-undo').disabled = history.length === 0;
        render();
        explain('', `Undid: <code>${esc(prev.label)}</code>. State rolled back one step.`);
        log('undo', prev.label);
    }

    const SCENARIOS = {
        empty: () => {},
        pushed: () => { ['10', '20', '30'].forEach(v => sim.execute(`push ${v}`)); },
        frame: () => {
            sim.execute('mov rcx, 7'); sim.execute('push rbp'); sim.execute('mov rbp, rsp');
            sim.execute('sub rsp, 16'); sim.execute('mov qword ptr [rbp-8], 99');
        },
        callchain: () => {
            sim.execute('push 0'); callstack.push('f');
            sim.execute('push 0'); callstack.push('g');
            sim.execute('mov rax, 5');
        },
        divide: () => {
            sim.execute('mov rax, 1000');
            sim.execute('cqo');
            sim.execute('mov rbx, 7');
        },
    };
    function loadScenario() {
        const which = $('sb64-scenario').value;
        sim = new AsmSimulator64();
        callstack = ['main'];
        history = [];
        $('sb64-undo').disabled = true;
        (SCENARIOS[which] || SCENARIOS.empty)();
        sim.changed = new Set();
        render();
        $('sb64-log').innerHTML = '<em style="color:var(--text-dim)">No actions yet.</em>';
        explain('', which === 'empty'
            ? 'Fresh machine. RSP sits at its base address and the stack is empty. Use the action buttons to interact.'
            : `Loaded the <strong>${which}</strong> scenario. Inspect the stack and registers, then keep interacting.`);
    }

    function reset() { $('sb64-scenario').value = 'empty'; loadScenario(); }

    function init() {
        const root = $('sb64-regs');
        if (!root) return;
        if (root.dataset.booted) return;
        root.dataset.booted = '1';

        sim = new AsmSimulator64();

        $('sb64-push').addEventListener('click', doPush);
        $('sb64-pop').addEventListener('click', doPop);
        $('sb64-call').addEventListener('click', doCall);
        $('sb64-ret').addEventListener('click', doRet);
        $('sb64-prologue').addEventListener('click', doPrologue);
        $('sb64-alloc').addEventListener('click', doAlloc);
        $('sb64-leave').addEventListener('click', doLeave);
        $('sb64-exec-btn').addEventListener('click', () => doExec());
        $('sb64-exec').addEventListener('keydown', e => { if (e.key === 'Enter') doExec(); });
        $('sb64-undo').addEventListener('click', undo);
        $('sb64-reset').addEventListener('click', reset);
        $('sb64-load').addEventListener('click', loadScenario);

        document.querySelectorAll('#sandbox64 .sp-chip').forEach(c =>
            c.addEventListener('click', () => { $('sb64-exec').value = c.dataset.ex; doExec(c.dataset.ex); }));

        document.querySelectorAll('#sb64-regbox .format-btn').forEach(b =>
            b.addEventListener('click', () => {
                document.querySelectorAll('#sb64-regbox .format-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active'); fmt = b.dataset.fmt; render();
            }));

        const ft = $('sb64-facts-toggle');
        if (ft) ft.addEventListener('click', () => {
            const hidden = $('sb64-facts-body').classList.toggle('collapsed');
            ft.textContent = hidden ? 'Show' : 'Hide';
        });

        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();