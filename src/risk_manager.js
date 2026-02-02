const RiskManager = {
    sessionProfit: 0,
    consecutiveLosses: 0,
    wins: 0,      // Contador de vitórias da sessão
    losses: 0,    // Contador de derrotas da sessão
    isPaused: false,
    pauseTimer: null,
    currentStake: 0, // Armazena o valor atual (com ou sem Martingale)
    maxConsecutiveLosses: 6, // STOP DE CICLO: Após 6 perdas, reseta a stake para proteger a banca

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

        // 1. Verifica se algum dos robôs está ativo (Tendência ou Dígitos)
        if (!ui.isBotRunning && !ui.isDigitBotRunning) return false;

        // 2. Verifica se o bot está no período de descanso
        if (this.isPaused) {
            ui.updateSignal("PAUSADO", 0, "Aguardando recuperação (Filtro Anti-Loss)");
            return false;
        }

        // 3. Verifica se a meta de lucro (Take Profit) foi atingida na sessão
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

        // 5. Filtro de Confiança Mínima Baseado na Estratégia
        if (ui.currentMode === 'digits') {
            // Sniper 30% exige confiança máxima (98) devido à barreira curta
            if (ui.selectedDigitStrategy === 'Sniper 30%' && analysis.strength < 95) return false;
            if (analysis.strength < 80) return false;
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
            this.currentStake = 0; // Fim do ciclo Martingale
            ui.addLog(`✅ GANHOU: +$${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "success");
        } else {
            // --- CASO DE DERROTA (LOSS) ---
            this.losses++;
            this.consecutiveLosses++;
            ui.addLog(`❌ PERDEU: $${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "error");

            // REGRA DE SEGURANÇA: Stop de Ciclo
            if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
                ui.addLog(`⚠️ STOP DE CICLO: ${this.maxConsecutiveLosses} perdas seguidas. Resetando Stake para segurança.`, "warn");
                this.consecutiveLosses = 0;
                this.currentStake = settings.stake;
                this.applyPause(3); // Pausa obrigatória de 3 minutos após quebra de ciclo
            }

            // REGRA RIGOROSA: 2 perdas seguidas no Scalping -> Pausa automática
            if (ui.currentStrategy === 'Scalper' && ui.currentMode !== 'digits' && this.consecutiveLosses >= 2) {
                this.applyPause(2); 
            }
        }

        this.updateUIMetrics();

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

    // 📈 CÁLCULO DE MARTINGALE DINÂMICO E SUAVE
    getNextStake(contractType) {
        const settings = this.getSettings();
        
        if (this.consecutiveLosses === 0) {
            this.currentStake = settings.stake;
            return this.currentStake;
        }

        let multiplier = 2.1; 

        if (ui.currentMode === 'digits') {
            if (ui.selectedDigitStrategy === 'Sniper 30%') {
                // MARTINGALE SUAVE: Como paga ~230%, um multiplicador de 1.5x já recupera com lucro
                multiplier = 1.5; 
            } else if (ui.selectedDigitStrategy === 'Coringa Cash') {
                // Paga ~31%, exige multiplicador alto para recuperar em 1 tentativa
                multiplier = 3.55;
            } else if (ui.selectedDigitStrategy === 'Equilíbrio de Ouro') {
                // Paga ~95%, multiplicador padrão
                multiplier = 2.1;
            }
        } else {
            multiplier = 2.1;
        }

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
        ui.addLog(`🚫 FILTRO DE SEGURANÇA: Pausando por ${minutes}min para análise de mercado.`, "warn");
        
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        
        this.pauseTimer = setTimeout(() => {
            this.isPaused = false;
            this.consecutiveLosses = 0;
            ui.addLog("🔄 Tempo de recuperação finalizado. Retomando motor.", "info");
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
