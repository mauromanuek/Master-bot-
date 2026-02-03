const RiskManager = {
    sessionProfit: 0,
    consecutiveLosses: 0,
    wins: 0,      // Contador de vitórias da sessão
    losses: 0,    // Contador de derrotas da sessão
    isPaused: false,
    pauseTimer: null,
    currentStake: 0, // Armazena o valor atual (com ou sem Martingale)
    maxConsecutiveLosses: 5, // STOP DE CICLO: Limite de segurança para evitar quebras em sequências ruins

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

        // 1. Verifica se algum dos robôs está ativo
        if (!ui.isBotRunning && !ui.isDigitBotRunning) return false;

        // 2. Verifica se o bot está no período de descanso
        if (this.isPaused) {
            ui.updateSignal("PAUSADO", 0, "Aguardando recuperação (Filtro Anti-Loss)");
            return false;
        }

        // 3. Verifica se a meta de lucro (Take Profit) foi atingida
        if (this.sessionProfit >= settings.tp) {
            ui.addLog(`🎯 META ATINGIDA: +$${this.sessionProfit.toFixed(2)}`, "success");
            if (ui.isBotRunning) ui.toggleBot();
            if (ui.isDigitBotRunning) ui.toggleDigitBot();
            return false;
        }

        // 4. Verifica se o limite de perda (Stop Loss) foi atingido
        if (this.sessionProfit <= (settings.sl * -1)) {
            ui.addLog(`⚠️ STOP LOSS ATINGIDO: $${this.sessionProfit.toFixed(2)}`, "error");
            if (ui.isBotRunning) ui.toggleBot();
            if (ui.isDigitBotRunning) ui.toggleDigitBot();
            return false;
        }

        // 5. Filtro de Confiança Especializado por Estratégia
        if (ui.currentMode === 'digits') {
            // Sniper 30% exige precisão extrema
            if (ui.selectedDigitStrategy === 'Sniper 30%') {
                if (analysis.strength < 98) return false;
            } else if (analysis.strength < 85) {
                return false;
            }
        } else {
            if (settings.mode === 'Scalper' && analysis.strength < 80) return false;
            if (settings.mode === 'Caça Ganho' && analysis.strength < 75) return false;
            if (settings.mode === 'Análise Profunda' && analysis.strength < 90) return false;
        }

        return true;
    },

    // 📊 PROCESSA O RESULTADO FINANCEIRO E ATUALIZA ESTATÍSTICAS
    processResult(profit) {
        this.sessionProfit += profit;
        const settings = this.getSettings();
        
        if (profit > 0) {
            // --- CASO DE VITÓRIA (WIN) ---
            this.wins++;
            this.consecutiveLosses = 0; 
            this.currentStake = 0; // Reseta ciclo
            ui.addLog(`✅ GANHOU: +$${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "success");
        } else {
            // --- CASO DE DERROTA (LOSS) ---
            this.losses++;
            this.consecutiveLosses++;
            ui.addLog(`❌ PERDEU: $${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "error");

            // REGRA DE SEGURANÇA: Stop de Ciclo para Sniper
            if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
                ui.addLog(`⚠️ LIMITE DE CICLO ATINGIDO: ${this.maxConsecutiveLosses} losses. Resetando para proteger banca.`, "warn");
                this.consecutiveLosses = 0;
                this.currentStake = settings.stake;
                this.applyPause(5); // Pausa longa para esfriar o algoritmo
            }
        }

        this.updateUIMetrics();

        // Verificação de Meta Global
        if (this.sessionProfit >= settings.tp) {
            ui.addLog(`🎯 SESSÃO FINALIZADA NO TAKE PROFIT: $${this.sessionProfit.toFixed(2)}`, "success");
            if (ui.isBotRunning) ui.toggleBot();
            if (ui.isDigitBotRunning) ui.toggleDigitBot();
        } else if (this.sessionProfit <= (settings.sl * -1)) {
            ui.addLog(`⚠️ SESSÃO FINALIZADA NO STOP LOSS: $${this.sessionProfit.toFixed(2)}`, "error");
            if (ui.isBotRunning) ui.toggleBot();
            if (ui.isDigitBotRunning) ui.toggleDigitBot();
        }
    },

    // 📈 CÁLCULO DE MARTINGALE ESPECIALIZADO (DIFERENCIAÇÃO DE RETORNOS)
    getNextStake(contractType) {
        const settings = this.getSettings();
        
        // Se for a primeira entrada do ciclo
        if (this.consecutiveLosses === 0) {
            this.currentStake = settings.stake;
            return this.currentStake;
        }

        let multiplier = 2.1; 

        // AJUSTE DE RETORNO POR TIPO DE ESTRATÉGIA
        if (ui.currentMode === 'digits') {
            if (ui.selectedDigitStrategy === 'Sniper 30%') {
                /* 🎯 SNIPER 30%: Retorno de ~230%. 
                   Multiplicador suave (1.55x) é suficiente para recuperar e lucrar muito. */
                multiplier = 1.55; 
            } else if (ui.selectedDigitStrategy === 'Coringa Cash') {
                /* ⚡ CORINGA CASH: Retorno de ~31%. 
                   Exige multiplicador alto (4.3x) para que a vitória cubra o prejuízo anterior. */
                multiplier = 4.3;
            } else if (ui.selectedDigitStrategy === 'Equilíbrio de Ouro') {
                /* 🏆 EQUILÍBRIO: Retorno de ~95%. 
                   Multiplicador padrão de recuperação (2.1x). */
                multiplier = 2.1;
            }
        } else {
            // Modos de tendência pagam ~95%
            multiplier = 2.1;
        }

        // Cálculo da Stake do próximo nível do Martingale
        this.currentStake = parseFloat((this.currentStake * multiplier).toFixed(2));
        return this.currentStake;
    },

    updateUIMetrics() {
        const winsTrend = document.getElementById('stat-wins');
        const lossesTrend = document.getElementById('stat-losses');
        if (winsTrend) winsTrend.innerText = this.wins;
        if (lossesTrend) lossesTrend.innerText = this.losses;

        const profitDigit = document.getElementById('digit-profit-display');
        if (profitDigit) {
            profitDigit.innerText = `$ ${this.sessionProfit.toFixed(2)}`;
            profitDigit.className = `text-xl font-black leading-tight ${this.sessionProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }
    },

    applyPause(minutes) {
        this.isPaused = true;
        ui.addLog(`🚫 PAUSA ESTRATÉGICA: Sistema aguardando ${minutes}min para novo ciclo.`, "warn");
        
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        
        this.pauseTimer = setTimeout(() => {
            this.isPaused = false;
            this.consecutiveLosses = 0;
            ui.addLog("🔄 Ciclo de descanso finalizado. Reiniciando monitoramento Sniper.", "info");
        }, minutes * 60 * 1000);
    },

    resetSessao() {
        this.sessionProfit = 0;
        this.consecutiveLosses = 0;
        this.wins = 0;
        this.losses = 0;
        this.isPaused = false;
        this.currentStake = 0;
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
            this.pauseTimer = null;
        }
        this.updateUIMetrics();
    }
};
