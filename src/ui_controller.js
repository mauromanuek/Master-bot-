const ui = {
    currentStrategy: 'Scalper',
    selectedDigitStrategy: 'Coringa Cash', 
    currentMode: 'analysis',
    isBotRunning: false,
    isDigitBotRunning: false,
    isAnalysisRunning: false,
    wakeLock: null,
    statusInterval: null,

    // 1. GESTÃO DE ACESSO PÓS-LOGIN
    onLoginSuccess() {
        document.getElementById('view-login').style.display = 'none';
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('main-footer').style.display = 'grid';
        
        // Inicializa o esqueleto do gráfico de barras de dígitos
        this.initDigitGraph();
        // Ativa a proteção de tela e o ticker de status
        this.requestWakeLock();
        this.startStatusTicker();
    },

    // 2. CONTROLE DO RADAR (ANÁLISE MANUAL DE TENDÊNCIA)
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

    // 3. CONTROLE DO ROBÔ (OPERAÇÃO AUTOMÁTICA DE TENDÊNCIA)
    toggleBot() {
        this.isBotRunning = !this.isBotRunning;
        const btn = document.getElementById('btn-bot');
        
        if (this.isBotRunning) {
            btn.innerText = "Parar Operação";
            btn.style.backgroundColor = "#ef4444";
            btn.style.color = "#fff";
            this.addLog(`🚀 Robô Trend Iniciado: ${this.currentStrategy}`, "success");
        } else {
            btn.innerText = "Iniciar Operação";
            btn.style.backgroundColor = "#fcd535";
            btn.style.color = "#000";
            this.addLog("🛑 Operação de tendência interrompida.", "warn");
        }
    },

    // 4. CONTROLE DO ROBÔ DE DÍGITOS (PROBABILIDADE / EDGE ESTATÍSTICO)
    toggleDigitBot() {
        this.isDigitBotRunning = !this.isDigitBotRunning;
        const btn = document.getElementById('btn-digit-bot');
        
        if (this.isDigitBotRunning) {
            btn.innerText = "PARAR OPERAÇÃO";
            btn.classList.replace('bg-green-600', 'bg-red-600');
            this.addLog(`🎲 Bot de Dígitos Ativo: ${this.selectedDigitStrategy}`, "success");
            this.showNotification(`Operação Iniciada: ${this.selectedDigitStrategy}`);
        } else {
            btn.innerText = "ANALISAR & OPERAR";
            btn.classList.replace('bg-red-600', 'bg-green-600');
            this.addLog("🛑 Bot de Dígitos interrompido.", "warn");
        }
    },

    // 5. GESTÃO DO MODAL DE DEFINIÇÕES (ESTILO LUXO)
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
        const strategySelect = document.getElementById('select-digit-strategy');
        this.selectedDigitStrategy = strategySelect.value;
        
        document.getElementById('inp-stake').value = document.getElementById('digit-stake').value;
        document.getElementById('inp-tp').value = document.getElementById('digit-tp').value;
        document.getElementById('inp-sl').value = document.getElementById('digit-sl').value;

        this.addLog(`Configurações de Dígitos Salvas: ${this.selectedDigitStrategy}`, "warn");
        this.toggleDigitSettings();
    },

    // 6. GESTÃO DE ESTRATÉGIAS DO HEADER
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
        this.addLog(`Estratégia Trend alterada para: ${name.toUpperCase()}`, "info");
        this.closeAllMenus();
        
        if (this.isAnalysisRunning) {
            this.updateSignal("SINTONIZANDO...", 20, `Ajustando motor para ${name}`);
        }
    },

    // 7. ATUALIZAÇÃO DA INTERFACE DE SINAIS (RADAR)
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

    // 8. MOTOR VISUAL DE DÍGITOS (GRÁFICO DE BARRAS)
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

    // 9. TABELA DE HISTÓRICO "TRADER" (DÍGITOS)
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

    // 10. NAVEGAÇÃO ENTRE ABAS E GESTÃO DE LOGS
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
        if (logWin.childNodes.length > 50) logWin.removeChild(logWin.firstChild);
    },

    // 🚀 NOVAS FUNCIONALIDADES: Wake Lock e Notificações de Status
    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.addLog("🛡️ Bloqueio de suspensão ativo: A tela não irá desligar.", "info");
            }
        } catch (err) {
            console.warn("Wake Lock não suportado ou erro ao ativar.");
        }
    },

    startStatusTicker() {
        if (this.statusInterval) clearInterval(this.statusInterval);
        this.statusInterval = setInterval(() => {
            if (typeof Brain !== 'undefined' && (this.isBotRunning || this.isDigitBotRunning || this.isAnalysisRunning)) {
                this.showNotification(Brain.statusMessage);
            }
        }, 10000);
    },

    showNotification(msg) {
        let toast = document.getElementById('ui-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ui-toast';
            toast.className = 'fixed top-24 left-1/2 -translate-x-1/2 z-[500] bg-yellow-500 text-black px-6 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-2xl transition-all duration-500 opacity-0 pointer-events-none text-center';
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0px)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
        }, 4000);
    },

    clearTerminal() {
        if (this.isBotRunning || this.isDigitBotRunning) {
            alert("Atenção: Pare o robô antes de resetar as estatísticas da sessão!");
            return;
        }

        if (confirm("Deseja zerar todos os logs, contadores de Win/Loss e histórico de trades da sessão?")) {
            if (typeof RiskManager !== 'undefined') RiskManager.resetSessao();
            const logWindow = document.getElementById('log-window');
            if (logWindow) logWindow.innerHTML = '<div class="log-entry text-gray-500 italic">> Sessão reiniciada. Terminal limpo.</div>';
            const historyList = document.getElementById('digit-history-list');
            if (historyList) historyList.innerHTML = '';
            document.getElementById('digit-profit-display').innerText = '$ 0.00';
            document.getElementById('digit-profit-display').className = 'text-xl font-black text-gray-400';
            document.getElementById('stat-wins').innerText = '0';
            document.getElementById('stat-losses').innerText = '0';
            this.addLog("As estatísticas da sessão foram redefinidas.", "warn");
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
