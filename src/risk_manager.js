const RiskManager = {
    sessionProfit: 0,
    consecutiveLosses: 0,
    wins: 0,      // Contador de vitórias
    losses: 0,    // Contador de derrotas
    isPaused: false,
    pauseTimer: null,

    // Captura os valores atuais configurados na interface do usuário
    getSettings() {
        return {
            stake: parseFloat(document.getElementById('inp-stake').value) || 0.35,
            tp: parseFloat(document.getElementById('inp-tp').value) || 5.00,
            sl: parseFloat(document.getElementById('inp-sl').value) || 10.00,
            mode: ui.currentStrategy
        };
    },

    // 🛡️ FILTRO DE SEGURANÇA ANTES DE CADA OPERAÇÃO
    canTrade(analysis) {
        const settings = this.getSettings();

        // 1. Verifica se o robô está ativo na interface
        if (!ui.isBotRunning) return false;

        // 2. Verifica se o bot está no período de descanso (Filtro Duro pós 2 losses)
        if (this.isPaused) {
            ui.updateSignal("PAUSADO", 0, "Aguardando recuperação (Filtro Anti-Loss)");
            return false;
        }

        // 3. Verifica se a meta de lucro (Take Profit) foi atingida
        if (this.sessionProfit >= settings.tp) {
            ui.addLog(`🎯 META ATINGIDA: +$${this.sessionProfit.toFixed(2)}`, "success");
            ui.toggleBot(); // Desliga o robô automaticamente
            return false;
        }

        // 4. Verifica se o limite de perda (Stop Loss) foi atingido
        if (this.sessionProfit <= (settings.sl * -1)) {
            ui.addLog(`⚠️ STOP LOSS ATINGIDO: $${this.sessionProfit.toFixed(2)}`, "error");
            ui.toggleBot(); // Desliga o robô automaticamente
            return false;
        }

        // 5. Filtro de Confiança Mínima Baseado na Estratégia Selecionada
        if (settings.mode === 'Scalper' && analysis.strength < 80) return false;
        if (settings.mode === 'Caça Ganho' && analysis.strength < 75) return false;
        if (settings.mode === 'Análise Profunda' && analysis.strength < 90) return false;

        return true;
    },

    // 📊 PROCESSA O RESULTADO FINANCEIRO E ATUALIZA ESTATÍSTICAS
    processResult(profit) {
        // Incrementa o lucro ou prejuízo na sessão
        this.sessionProfit += profit;
        
        // Seleção de fluxo baseada no resultado (Win ou Loss)
        if (profit > 0) {
            // Caso de Vitória (WIN)
            this.wins++;
            this.consecutiveLosses = 0; // Reseta perdas consecutivas
            ui.addLog(`✅ GANHOU: +$${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "success");
        } else {
            // Caso de Derrota (LOSS)
            this.losses++;
            this.consecutiveLosses++;
            ui.addLog(`❌ PERDEU: $${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "error");

            // REGRA RIGOROSA: 2 perdas seguidas no Scalping -> Pausa automática de 2 minutos
            if (ui.currentStrategy === 'Scalper' && this.consecutiveLosses >= 2) {
                this.applyPause(2); 
            }
        }

        // Atualiza os contadores Visuais (Placar de Wins/Losses)
        const winsElement = document.getElementById('stat-wins');
        const lossesElement = document.getElementById('stat-losses');
        
        if (winsElement) winsElement.innerText = this.wins;
        if (lossesElement) lossesElement.innerText = this.losses;

        // Verificação final de Meta após o processamento do contrato
        const settings = this.getSettings();
        if (this.sessionProfit >= settings.tp) {
            ui.addLog(`🎯 SESSÃO FINALIZADA NO TAKE PROFIT: $${this.sessionProfit.toFixed(2)}`, "success");
            if (ui.isBotRunning) ui.toggleBot();
        } else if (this.sessionProfit <= (settings.sl * -1)) {
            ui.addLog(`⚠️ SESSÃO FINALIZADA NO STOP LOSS: $${this.sessionProfit.toFixed(2)}`, "error");
            if (ui.isBotRunning) ui.toggleBot();
        }
    },

    // APLICA PAUSA FORÇADA PARA EVITAR QUEBRA DE BANCA EM CICLOS RUINS
    applyPause(minutes) {
        this.isPaused = true;
        ui.addLog(`🚫 FILTRO DURO: 2 perdas seguidas no Scalper. Pausando por ${minutes}min.`, "warn");
        
        // Limpa qualquer timer anterior caso exista
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        
        // Inicia o contador de tempo para retomar as operações
        this.pauseTimer = setTimeout(() => {
            this.isPaused = false;
            this.consecutiveLosses = 0;
            ui.addLog("🔄 Tempo de recuperação finalizado. Motor pronto para retomar.", "info");
        }, minutes * 60 * 1000);
    },

    // FUNÇÃO DE RESET COMPLETO DA SESSÃO (CHAMADA PELO UI_CONTROLLER)
    resetSessao() {
        this.sessionProfit = 0;
        this.consecutiveLosses = 0;
        this.wins = 0;
        this.losses = 0;
        this.isPaused = false;
        
        // Cancela qualquer pausa de tempo que estiver rodando
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
            this.pauseTimer = null;
        }
    }
};
