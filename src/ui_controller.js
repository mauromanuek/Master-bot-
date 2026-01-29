const ui = {
    currentStrategy: 'Scalper',
    selectedDigitStrategy: 'Coringa Cash', // Estratégia padrão para dígitos
    currentMode: 'analysis',
    isBotRunning: false,
    isDigitBotRunning: false,
    isAnalysisRunning: false,

    // 1. GESTÃO DE ACESSO
    onLoginSuccess() {
        document.getElementById('view-login').style.display = 'none';
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('main-footer').style.display = 'grid';
        this.initDigitGraph();
    },

    // 2. CONTROLE DO RADAR (ANÁLISE MANUAL)
    toggleAnalysis() {
        this.isAnalysisRunning = !this.isAnalysisRunning;
        const btn = document.getElementById('btn-analysis-control');
        if (this.isAnalysisRunning) {
            btn.innerText = "Desligar Radar";
            btn.classList.replace('bg-blue-600', 'bg-red-600');
            this.addLog(`Radar ativado no modo: ${this.currentStrategy}`, "info");
        } else {
            btn.innerText = "Iniciar Radar";
            btn.classList.replace('bg-red-600', 'bg-blue-600');
            this.updateSignal("---", 0, "Radar Desativado");
        }
    },

    // 3. CONTROLE DO ROBÔ (OPERAÇÃO TENDÊNCIA)
    toggleBot() {
        this.isBotRunning = !this.isBotRunning;
        const btn = document.getElementById('btn-bot');
        if (this.isBotRunning) {
            btn.innerText = "Parar Operação";
            btn.style.backgroundColor = "#ef4444";
            btn.style.color = "#fff";
            this.addLog(`🚀 Robô Iniciado: ${this.currentStrategy}`, "success");
        } else {
            btn.innerText = "Iniciar Operação";
            btn.style.backgroundColor = "#fcd535";
            btn.style.color = "#000";
            this.addLog("🛑 Operação interrompida.", "warn");
        }
    },

    // 4. CONTROLE DO ROBÔ (DÍGITOS)
    toggleDigitBot() {
        this.isDigitBotRunning = !this.isDigitBotRunning;
        const btn = document.getElementById('btn-digit-bot');
        if (this.isDigitBotRunning) {
            btn.innerText = "PARAR OPERAÇÃO";
            btn.classList.replace('bg-green-600', 'bg-red-600');
            this.addLog(`🎲 Bot de Dígitos Ativo: ${this.selectedDigitStrategy}`, "success");
        } else {
            btn.innerText = "ANALISAR & OPERAR";
            btn.classList.replace('bg-red-600', 'bg-green-600');
            this.addLog("🛑 Bot de Dígitos Desativado.", "warn");
        }
    },

    // 5. MODAL DE DEFINIÇÕES
    toggleDigitSettings() {
        const modal = document.getElementById('digit-settings-modal');
        if (modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        } else {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }
    },

    saveDigitSettings() {
        // Captura a estratégia selecionada no Select
        this.selectedDigitStrategy = document.getElementById('select-digit-strategy').value;
        
        // Sincroniza valores visuais da tela de Bot Principal com os inputs do Modal
        document.getElementById('inp-stake').value = document.getElementById('digit-stake').value;
        document.getElementById('inp-tp').value = document.getElementById('digit-tp').value;
        document.getElementById('inp-sl').value = document.getElementById('digit-sl').value;

        this.addLog(`Configurações Aplicadas: ${this.selectedDigitStrategy}`, "warn");
        this.toggleDigitSettings();
    },

    // 6. GESTÃO DE ESTRATÉGIAS SUPERIOR
    toggleAnalysisMenu(e) {
        if (e) e.stopPropagation();
        document.getElementById('analysis-menu').classList.toggle('show');
    },

    closeAllMenus() {
        const menu = document.getElementById('analysis-menu');
        if (menu) menu.classList.remove('show');
    },

    setStrategy(name) {
        this.currentStrategy = name;
        document.getElementById('selected-analysis-name').innerText = name;
        this.addLog(`Estratégia Trend: ${name.toUpperCase()}`, "info");
        this.closeAllMenus();
        if (this.isAnalysisRunning) {
            this.updateSignal("SINTONIZANDO...", 20, `Ajustando para ${name}`);
        }
    },

    // 7. ATUALIZAÇÃO DA INTERFACE SINAIS
    updateSignal(signal, strength, reason) {
        const disp = document.getElementById('signal-display');
        const desc = document.getElementById('strategy-desc');
        const bar = document.getElementById('signal-strength');
        if (!disp || !desc || !bar) return;

        disp.innerText = signal;
        desc.innerText = reason;
        bar.style.width = strength + '%';

        if (signal === 'CALL') {
            disp.style.color = "#22c55e";
            bar.style.backgroundColor = "#22c55e";
        } else if (signal === 'PUT') {
            disp.style.color = "#ef4444";
            bar.style.backgroundColor = "#ef4444";
        } else {
            disp.style.color = "#fff";
            bar.style.backgroundColor = "#fcd535";
        }
    },

    // 8. MOTOR VISUAL DÍGITOS
    initDigitGraph() {
        const graph = document.getElementById('digit-graph');
        if (!graph || graph.children.length > 0) return;
        for (let i = 0; i < 10; i++) {
            graph.innerHTML += `
                <div class="flex-1 flex flex-col items-center gap-1">
                    <span id="d-perc-${i}" class="text-[7px] text-gray-500 font-bold">0%</span>
                    <div id="d-bar-${i}" class="w-full bg-gray-800 rounded-t-sm digit-bar" style="height: 10%"></div>
                    <span class="text-[9px] text-gray-400 font-bold">${i}</span>
                </div>`;
        }
    },

    updateDigitUI(last, stats) {
        const view = document.getElementById('current-digit-view');
        if (view) view.innerText = last;
        stats.forEach((perc, i) => {
            const bar = document.getElementById(`d-bar-${i}`);
            const txt = document.getElementById(`d-perc-${i}`);
            if (bar && txt) {
                bar.style.height = `${Math.max(perc * 3, 5)}%`;
                txt.innerText = `${perc}%`;
                if (perc >= 18) bar.style.backgroundColor = '#22c55e';
                else if (perc <= 5) bar.style.backgroundColor = '#ef4444';
                else bar.style.backgroundColor = '#374151';
            }
        });
    },

    // 9. TABELA DE HISTÓRICO "TRADER"
    addDigitHistoryRow(contract) {
        const list = document.getElementById('digit-history-list');
        if (!list) return;
        const row = document.createElement('tr');
        row.className = "border-b border-gray-800/50 bg-black/5";
        const profit = parseFloat(contract.profit);
        const colorClass = profit >= 0 ? 'text-green-500' : 'text-red-500';
        const sign = profit >= 0 ? '+' : '';
        row.innerHTML = `
            <td class="p-4 text-white uppercase font-bold">${contract.contract_type}</td>
            <td class="p-4 text-gray-400">${contract.exit_tick}</td>
            <td class="p-4 text-gray-300">$ ${contract.buy_price.toFixed(2)}</td>
            <td class="p-4 text-right ${colorClass} font-bold">${sign}${profit.toFixed(2)}</td>`;
        list.insertBefore(row, list.firstChild);
        if (list.childNodes.length > 10) list.removeChild(list.lastChild);
    },

    // 10. NAVEGAÇÃO E LOGS
    switchMode(mode) {
        this.currentMode = mode;
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`mode-${mode}`).classList.add('active');
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${mode}`).classList.add('active');
        const strategyBtn = document.getElementById('btn-strategy');
        if (mode === 'digits') {
            strategyBtn.style.visibility = 'hidden';
            this.initDigitGraph();
        } else {
            strategyBtn.style.visibility = 'visible';
        }
    },

    addLog(msg, type = "info") {
        const logWin = document.getElementById('log-window');
        if (!logWin) return;
        const now = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        let colorClass = 'text-blue-400';
        if (type === 'success') colorClass = 'text-green-500 font-bold';
        if (type === 'warn') colorClass = 'text-yellow-500';
        if (type === 'error') colorClass = 'text-red-500 font-bold';
        logEntry.innerHTML = `<span class="text-gray-600 mr-2">[${now}]</span><span class="${colorClass}">${msg}</span>`;
        logWin.appendChild(logEntry);
        logWin.scrollTop = logWin.scrollHeight;
    },

    clearTerminal() {
        if (this.isBotRunning || this.isDigitBotRunning) {
            alert("Pare o robô antes de resetar!");
            return;
        }
        if (confirm("Resetar todos os dados da sessão?")) {
            if (typeof RiskManager !== 'undefined') RiskManager.resetSessao();
            const logWindow = document.getElementById('log-window');
            if (logWindow) logWindow.innerHTML = '<div class="log-entry text-gray-500 italic">> Sessão reiniciada.</div>';
            const historyList = document.getElementById('digit-history-list');
            if (historyList) historyList.innerHTML = '';
            document.getElementById('stat-wins').innerText = '0';
            document.getElementById('stat-losses').innerText = '0';
            this.addLog("Terminal Resetado.", "warn");
        }
    }
};

document.addEventListener('click', (event) => {
    const strategyBtn = document.getElementById('btn-strategy');
    const analysisMenu = document.getElementById('analysis-menu');
    if (strategyBtn && analysisMenu) {
        if (!strategyBtn.contains(event.target) && !analysisMenu.contains(event.target)) {
            ui.closeAllMenus();
        }
    }
});
