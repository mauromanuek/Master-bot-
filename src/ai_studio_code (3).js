const ui = {
    currentStrategy: 'Scalper',
    isBotRunning: false,
    isAnalysisRunning: false,

    // 1. GESTÃO DE ACESSO
    onLoginSuccess() {
        document.getElementById('view-login').style.display = 'none';
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('main-footer').style.display = 'grid';
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
            this.updateSignal("---", 0, "Sistema de Radar Desativado");
        }
    },

    // 3. CONTROLE DO ROBÔ (OPERAÇÃO AUTOMÁTICA)
    toggleBot() {
        this.isBotRunning = !this.isBotRunning;
        const btn = document.getElementById('btn-bot');
        
        if (this.isBotRunning) {
            btn.innerText = "Parar Operação";
            btn.style.backgroundColor = "#ef4444"; // Vermelho
            btn.style.color = "#fff";
            this.addLog(`🚀 Robô Iniciado [Modo: ${this.currentStrategy}]`, "success");
        } else {
            btn.innerText = "Iniciar Operação";
            btn.style.backgroundColor = "#fcd535"; // Amarelo Original
            btn.style.color = "#000";
            this.addLog("🛑 Operação interrompida pelo usuário.", "warn");
        }
    },

    // 4. GESTÃO DE ESTRATÉGIAS E MENUS
    toggleAnalysisMenu(e) {
        if (e) e.stopPropagation();
        document.getElementById('analysis-menu').classList.toggle('show');
    },

    closeAllMenus() {
        document.getElementById('analysis-menu').classList.remove('show');
    },

    setStrategy(name) {
        this.currentStrategy = name;
        document.getElementById('selected-analysis-name').innerText = name;
        this.addLog(`Estratégia alterada para: ${name.toUpperCase()}`, "warn");
        this.closeAllMenus();
        
        // Se o radar estiver ligado, dá um reset visual para nova análise
        if (this.isAnalysisRunning) {
            this.updateSignal("SINTONIZANDO...", 20, `Otimizando motor para ${name}`);
        }
    },

    // 5. ATUALIZAÇÃO DA INTERFACE DE SINAIS
    updateSignal(signal, strength, reason) {
        const disp = document.getElementById('signal-display');
        const desc = document.getElementById('strategy-desc');
        const bar = document.getElementById('signal-strength');

        disp.innerText = signal;
        desc.innerText = reason;
        bar.style.width = strength + '%';

        // Cores baseadas no sinal
        if (signal === 'CALL') {
            disp.style.color = "#22c55e"; // Verde
            bar.style.backgroundColor = "#22c55e";
        } else if (signal === 'PUT') {
            disp.style.color = "#ef4444"; // Vermelho
            bar.style.backgroundColor = "#ef4444";
        } else {
            disp.style.color = "#fff";
            bar.style.backgroundColor = "#fcd535";
        }
    },

    // 6. NAVEGAÇÃO ENTRE ABAS (RADAR / BOT)
    switchMode(mode) {
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`mode-${mode}`).classList.add('active');
        
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${mode}`).classList.add('active');
    },

    // 7. SISTEMA DE LOGS PROFISSIONAL
    addLog(msg, type = "info") {
        const logWin = document.getElementById('log-window');
        const now = new Date().toLocaleTimeString();
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let colorClass = 'text-blue-400'; // Default info
        if (type === 'success') colorClass = 'text-green-500 font-bold';
        if (type === 'warn') colorClass = 'text-yellow-500';
        if (type === 'error') colorClass = 'text-red-500 font-bold';

        logEntry.innerHTML = `
            <span class="text-gray-600 mr-2">[${now}]</span>
            <span class="${colorClass}">${msg}</span>
        `;

        logWin.appendChild(logEntry);
        logWin.scrollTop = logWin.scrollHeight;

        // Limita o número de logs na tela para não pesar a memória
        if (logWin.childNodes.length > 50) {
            logWin.removeChild(logWin.firstChild);
        }
    }
};

// Listener para fechar menus ao clicar fora
document.addEventListener('click', () => ui.closeAllMenus());