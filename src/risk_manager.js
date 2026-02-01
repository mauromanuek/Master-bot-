const RiskManager = {
    sessionProfit: 0,
    consecutiveLosses: 0,
    wins: 0,      // Contador de vitórias da sessão
    losses: 0,    // Contador de derrotas da sessão
    isPaused: false,
    pauseTimer: null,
    currentStake: 0, // Armazena o valor atual (com ou sem Martingale)

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

        // 2. Verifica se o bot está no período de descanso (Filtro Duro pós 2 losses no Scalper)
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
        // Para Dígitos, usamos a confiança vinda do sinal. Para outros, a força da análise.
        if (ui.currentMode === 'digits') {
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
        // Incrementa o lucro ou prejuízo na sessão
        this.sessionProfit += profit;
        
        // Seleção de fluxo baseada no resultado (Win ou Loss)
        if (profit > 0) {
            // --- CASO DE VITÓRIA (WIN) ---
            this.wins++;
            this.consecutiveLosses = 0; 
            
            // Reseta a Stake para o valor inicial (Fim do ciclo Martingale)
            this.currentStake = 0; 

            ui.addLog(`✅ GANHOU: +$${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "success");
        } else {
            // --- CASO DE DERROTA (LOSS) ---
            this.losses++;
            this.consecutiveLosses++;
            
            ui.addLog(`❌ PERDEU: $${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "error");

            // REGRA RIGOROSA: 2 perdas seguidas no Scalping -> Pausa automática
            if (ui.currentStrategy === 'Scalper' && ui.currentMode !== 'digits' && this.consecutiveLosses >= 2) {
                this.applyPause(2); 
            }
        }

        // Atualiza os contadores Visuais (Placar de Wins/Losses e Profit de Dígitos)
        this.updateUIMetrics();

        // Verificação final de Meta após o processamento
        const settings = this.getSettings();
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

    // 📈 CÁLCULO DE MARTINGALE DINÂMICO (PROFISSIONAL)
    // Calcula quanto deve ser a próxima entrada para recuperar e lucrar
    getNextStake(contractType) {
        const settings = this.getSettings();
        
        // Se não houver perdas acumuladas, usa a stake padrão
        if (this.consecutiveLosses === 0) {
            this.currentStake = settings.stake;
            return this.currentStake;
        }

        // --- MULTIPLICADORES INTELIGENTES ---
        let multiplier = 2.1; 

        // Se estiver operando DÍGITOS, o multiplicador muda conforme a estratégia escolhida
        if (ui.currentMode === 'digits') {
            if (ui.selectedDigitStrategy === 'Coringa Cash') {
                // Como o lucro é de ~31%, o multiplicador precisa ser maior (3.55x) para recuperar o anterior
                multiplier = 3.55;
            } else if (ui.selectedDigitStrategy === 'Equilíbrio de Ouro') {
                // Como o lucro é de ~95% (quase o dobro), um multiplicador baixo (2.1x) já resolve
                multiplier = 2.1;
            }
        } else {
            // Para modos de tendência (Scalper, etc) que pagam cerca de 95%
            multiplier = 2.1;
        }

        // Calcula a nova stake baseada na última stake usada no ciclo
        this.currentStake = parseFloat((this.currentStake * multiplier).toFixed(2));
        return this.currentStake;
    },

    // Atualiza todos os elementos de texto de lucro/placar na interface
    updateUIMetrics() {
        // Placar Bot de Tendência
        const winsTrend = document.getElementById('stat-wins');
        const lossesTrend = document.getElementById('stat-losses');
        if (winsTrend) winsTrend.innerText = this.wins;
        if (lossesTrend) lossesTrend.innerText = this.losses;

        // Placar Bot de Dígitos
        const profitDigit = document.getElementById('digit-profit-display');
        if (profitDigit) {
            profitDigit.innerText = `$ ${this.sessionProfit.toFixed(2)}`;
            profitDigit.className = `text-xl font-black leading-tight ${this.sessionProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }
    },

    // APLICA PAUSA FORÇADA PARA EVITAR QUEBRA DE BANCA
    applyPause(minutes) {
        this.isPaused = true;
        ui.addLog(`🚫 FILTRO DURO: 2 perdas seguidas. Pausando por ${minutes}min.`, "warn");
        
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        
        this.pauseTimer = setTimeout(() => {
            this.isPaused = false;
            this.consecutiveLosses = 0;
            ui.addLog("🔄 Tempo de recuperação finalizado. Retomando motor.", "info");
        }, minutes * 60 * 1000);
    },

    // FUNÇÃO DE RESET COMPLETO DA SESSÃO
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
