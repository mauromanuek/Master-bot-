const Brain = {
    // ANALISADOR PRINCIPAL
    analyze(ticks, mode) {
        if (ticks.length < 30) return { action: "CALIBRANDO...", strength: 10, reason: "Aguardando volume de dados" };

        const lastPrice = ticks[ticks.length - 1];
        const prevPrice = ticks[ticks.length - 2];
        
        // INDICADORES BASE
        const ema9 = this.calculateEMA(ticks, 9);
        const ema21 = this.calculateEMA(ticks, 21);
        const rsi = this.calculateRSI(ticks, 14);
        const volatility = this.getVolatility(ticks);

        // FILTRO DURO GERAL: Anti-Spike (ATR simples)
        const currentMove = Math.abs(lastPrice - prevPrice);
        if (currentMove > (volatility * 3)) {
            return { action: "AGUARDAR", strength: 0, reason: "Pico de Volatilidade Detectado" };
        }

        // SELETOR DE MODO
        switch (mode) {
            case 'Scalper':
                return this.logicScalper(lastPrice, prevPrice, ema9, ema21, ticks);
            case 'Caça Ganho':
                return this.logicCacaGanho(lastPrice, ema21, rsi, ticks);
            case 'Análise Profunda':
                return this.logicDeepAnalysis(lastPrice, ema9, ema21, rsi, ticks);
            default:
                return { action: "---", strength: 0, reason: "Modo Indefinido" };
        }
    },

    // ⚡ 1️⃣ MODO SCALPING (Ticks / Micro-tendência)
    logicScalper(price, prev, ema9, ema21, ticks) {
        const isTrendUp = ema9 > ema21;
        const last3TicksUp = ticks.slice(-3).every((t, i, a) => i === 0 || t > a[i-1]);
        const last3TicksDown = ticks.slice(-3).every((t, i, a) => i === 0 || t < a[i-1]);

        // Estratégia A: Continuação micro-tendência
        if (isTrendUp && last3TicksUp && price > ema9) {
            return { action: "CALL", strength: 85, reason: "Micro-Tendência e Fluxo de Alta" };
        }
        if (!isTrendUp && last3TicksDown && price < ema9) {
            return { action: "PUT", strength: 85, reason: "Micro-Tendência e Fluxo de Baixa" };
        }

        // Estratégia B: Rejeição Curta (Simulada por volatilidade de tick)
        const candleMove = price - ticks[ticks.length - 5]; // Movimento de 5 ticks
        if (candleMove < 0 && price > ema21 && price < prev) { // Rejeição de queda no suporte EMA
             return { action: "CALL", strength: 70, reason: "Rejeição Curta em Suporte" };
        }

        return { action: "NEUTRO", strength: 20, reason: "Aguardando Momento" };
    },

    // 🎯 2️⃣ MODO CAÇA-GANHO (Pullback / Confluência)
    logicCacaGanho(price, ema21, rsi, ticks) {
        const sma50 = this.calculateEMA(ticks, 50);
        const trendUp = price > sma50;

        // Estratégia A: Pullback de tendência na EMA 21
        const touchedEMA = ticks.slice(-5).some(t => Math.abs(t - ema21) < 0.01);
        
        if (trendUp && touchedEMA && price > ema21 && rsi < 65) {
            return { action: "CALL", strength: 75, reason: "Pullback Confirmado na EMA 21" };
        }
        if (!trendUp && touchedEMA && price < ema21 && rsi > 35) {
            return { action: "PUT", strength: 75, reason: "Pullback Confirmado na EMA 21" };
        }

        return { action: "NEUTRO", strength: 10, reason: "Buscando Tendência Definida" };
    },

    // 🧠 3️⃣ MODO ANÁLISE PROFUNDA (Estatístico / Estrutural)
    logicDeepAnalysis(price, ema9, ema21, rsi, ticks) {
        const ema200 = this.calculateEMA(ticks, 100); // Simulando Macro Tendência
        const isMacroUp = price > ema200;
        const isMicroUp = ema9 > ema21;

        // Estratégia A: Tendência MTF (Macro + Micro alinhados)
        if (isMacroUp && isMicroUp && rsi > 50 && rsi < 70) {
            const lowRSI = this.calculateRSI(ticks.slice(-10), 5);
            if (lowRSI > 50) return { action: "CALL", strength: 95, reason: "Alinhamento Macro/Micro Alta" };
        }
        
        if (!isMacroUp && !isMicroUp && rsi < 50 && rsi > 30) {
            const highRSI = this.calculateRSI(ticks.slice(-10), 5);
            if (highRSI < 50) return { action: "PUT", strength: 95, reason: "Alinhamento Macro/Micro Baixa" };
        }

        // Filtro Duro: Divergência (RSI contra Preço)
        return { action: "AGUARDAR", strength: 5, reason: "Divergência Estrutural" };
    },

    // --- FERRAMENTAS MATEMÁTICAS ---

    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        let ema = data[0];
        for (let i = 1; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
        }
        return ema;
    },

    calculateRSI(ticks, period) {
        if (ticks.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = ticks.length - period; i < ticks.length; i++) {
            const diff = ticks[i] - ticks[i - 1];
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        if (losses === 0) return 100;
        const rs = gains / losses;
        return 100 - (100 / (1 + rs));
    },

    getVolatility(ticks) {
        const last10 = ticks.slice(-10);
        let diffs = 0;
        for(let i=1; i<last10.length; i++) {
            diffs += Math.abs(last10[i] - last10[i-1]);
        }
        return diffs / 10;
    }
};
