const RiskManager = {
    sessionProfit: 0,
    consecutiveLosses: 0,
    isPaused: false,
    pauseTimer: null,

    // Captura os valores atuais da interface
    getSettings() {
        return {
            stake: parseFloat(document.getElementById('inp-stake').value) || 0.35,
            tp: parseFloat(document.getElementById('inp-tp').value) || 5.00,
            sl: parseFloat(document.getElementById('inp-sl').value) || 10.00,
            mode: ui.currentStrategy
        };
    },

    // 🛡️ FILTRO ANTES DE QUALQUER OPERAÇÃO
    canTrade(analysis) {
        const settings = this.getSettings();

        // 1. Verifica se o robô está ativo na interface
        if (!ui.isBotRunning) return false;

        // 2. Verifica se o bot está no período de descanso (após 2 losses)
        if (this.isPaused) {
            ui.updateSignal("PAUSADO", 0, "Aguardando tempo de recuperação (Filtro Duro)");
            return false;
        }

        // 3. Verifica se bateu a meta de lucro (Take Profit)
        if (this.sessionProfit >= settings.tp) {
            ui.addLog(`🎯 META ATINGIDA: +$${this.sessionProfit.toFixed(2)}`, "success");
            ui.toggleBot(); // Desliga o robô
            return false;
        }

        // 4. Verifica se bateu o limite de perda (Stop Loss)
        if (this.sessionProfit <= (settings.sl * -1)) {
            ui.addLog(`⚠️ STOP LOSS ATINGIDO: $${this.sessionProfit.toFixed(2)}`, "error");
            ui.toggleBot(); // Desliga o robô
            return false;
        }

        // 5. Filtro de Confiança Mínima por Modo
        if (settings.mode === 'Scalper' && analysis.strength < 80) return false;
        if (settings.mode === 'Caça Ganho' && analysis.strength < 75) return false;
        if (settings.mode === 'Análise Profunda' && analysis.strength < 90) return false;

        return true;
    },

    // 📊 PROCESSA O RESULTADO DO CONTRATO
    processResult(profit) {
        this.sessionProfit += profit;
        
        if (profit > 0) {
            // WIN
            this.consecutiveLosses = 0;
            ui.addLog(`✅ GANHOU: +$${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "success");
        } else {
            // LOSS
            this.consecutiveLosses++;
            ui.addLog(`❌ PERDEU: $${profit.toFixed(2)} | Total: $${this.sessionProfit.toFixed(2)}`, "error");

            // REGRA: 2 perdas seguidas no Scalping -> Pausa de 2 minutos
            if (ui.currentStrategy === 'Scalper' && this.consecutiveLosses >= 2) {
                this.applyPause(2); // 2 minutos de pausa
            }
        }
    },

    // Aplica a pausa forçada (Filtro Anti-Loss)
    applyPause(minutes) {
        this.isPaused = true;
        ui.addLog(`🚫 PAUSA FORÇADA: 2 perdas no Scalper. Aguardando ${minutes}min.`, "warn");
        
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        
        this.pauseTimer = setTimeout(() => {
            this.isPaused = false;
            this.consecutiveLosses = 0;
            ui.addLog("🔄 Pausa encerrada. Retomando operações...", "info");
        }, minutes * 60 * 1000);
    }
};
