const Brain = {
    // Memória para análise de dígitos
    digitHistory: [],

    // 1️⃣ ANALISADOR DE TENDÊNCIA (MODOS ORIGINAIS - MANTIDOS)
    analyze(ticks, mode) {
        if (ticks.length < 30) return { action: "CALIBRANDO...", strength: 10, reason: "Aguardando volume de dados" };

        const lastPrice = ticks[ticks.length - 1];
        const prevPrice = ticks[ticks.length - 2];
        
        const ema9 = this.calculateEMA(ticks, 9);
        const ema21 = this.calculateEMA(ticks, 21);
        const rsi = this.calculateRSI(ticks, 14);
        const volatility = this.getVolatility(ticks);

        const currentMove = Math.abs(lastPrice - prevPrice);
        if (currentMove > (volatility * 3)) {
            return { action: "AGUARDAR", strength: 0, reason: "Pico de Volatilidade Detectado" };
        }

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

    logicScalper(price, prev, ema9, ema21, ticks) {
        const isTrendUp = ema9 > ema21;
        const last3TicksUp = ticks.slice(-3).every((t, i, a) => i === 0 || t > a[i-1]);
        const last3TicksDown = ticks.slice(-3).every((t, i, a) => i === 0 || t < a[i-1]);
        if (isTrendUp && last3TicksUp && price > ema9) return { action: "CALL", strength: 85, reason: "Micro-Tendência e Fluxo de Alta" };
        if (!isTrendUp && last3TicksDown && price < ema9) return { action: "PUT", strength: 85, reason: "Micro-Tendência e Fluxo de Baixa" };
        const candleMove = price - ticks[ticks.length - 5]; 
        if (candleMove < 0 && price > ema21 && price < prev) return { action: "CALL", strength: 70, reason: "Rejeição Curta em Suporte" };
        return { action: "NEUTRO", strength: 20, reason: "Aguardando Momento" };
    },

    logicCacaGanho(price, ema21, rsi, ticks) {
        const sma50 = this.calculateEMA(ticks, 50);
        const trendUp = price > sma50;
        const touchedEMA = ticks.slice(-5).some(t => Math.abs(t - ema21) < 0.01);
        if (trendUp && touchedEMA && price > ema21 && rsi < 65) return { action: "CALL", strength: 75, reason: "Pullback Confirmado na EMA 21" };
        if (!trendUp && touchedEMA && price < ema21 && rsi > 35) return { action: "PUT", strength: 75, reason: "Pullback Confirmado na EMA 21" };
        return { action: "NEUTRO", strength: 10, reason: "Buscando Tendência Definida" };
    },

    logicDeepAnalysis(price, ema9, ema21, rsi, ticks) {
        const ema200 = this.calculateEMA(ticks, 100); 
        const isMacroUp = price > ema200;
        const isMicroUp = ema9 > ema21;
        if (isMacroUp && isMicroUp && rsi > 50 && rsi < 70) {
            const lowRSI = this.calculateRSI(ticks.slice(-10), 5);
            if (lowRSI > 50) return { action: "CALL", strength: 95, reason: "Alinhamento Macro/Micro Alta" };
        }
        if (!isMacroUp && !isMicroUp && rsi < 50 && rsi > 30) {
            const highRSI = this.calculateRSI(ticks.slice(-10), 5);
            if (highRSI < 50) return { action: "PUT", strength: 95, reason: "Alinhamento Macro/Micro Baixa" };
        }
        return { action: "AGUARDAR", strength: 5, reason: "Divergência Estrutural" };
    },

    // 2️⃣ MOTOR PROFISSIONAL DE DÍGITOS (EDGE ESTATÍSTICO)
    analyzeDigits(price) {
        const priceStr = price.toString();
        const lastDigit = parseInt(priceStr.charAt(priceStr.length - 1));
        
        this.digitHistory.push(lastDigit);
        if (this.digitHistory.length > 50) this.digitHistory.shift(); // Aumentado para análise de sequência

        const counts = new Array(10).fill(0);
        const last25 = this.digitHistory.slice(-25);
        last25.forEach(d => counts[d]++);
        const stats = counts.map(c => Math.round((c / last25.length) * 100));

        // Filtro de Micro-Volatilidade (Proteção contra Spikes no Tick)
        const isVolatile = this.checkMicroVolatility();

        return {
            last: lastDigit,
            stats: stats,
            isVolatile: isVolatile,
            signals: isVolatile ? [] : this.getProfessionalDigitSignals(stats, last25)
        };
    },

    getProfessionalDigitSignals(stats, last25) {
        let activeSignals = [];

        // --- ESTRATÉGIA 1: CORINGA CASH (Under 7) ---
        // Foco: Segurança. Probabilidade ~70%. Ganho ~$0.31
        const highNumbersFreq = stats[7] + stats[8] + stats[9];
        if (highNumbersFreq < 12) {
            activeSignals.push({ 
                type: 'DIGITUNDER', barrier: 7, name: 'Coringa Cash', conf: 85,
                reason: 'Baixa pressão de números altos (7-9)'
            });
        }

        // --- ESTRATÉGIA 2: EQUILÍBRIO DE OURO (Under 5 ou Over 4) ---
        // Foco: Lucro Alto (~100%). Ganho ~$0.95.
        // Base: Teoria da Exaustão Estatística (Saturação)
        
        const last12 = last25.slice(-12);
        const highCount = last12.filter(d => d >= 5).length;
        const lowCount = last12.filter(d => d <= 4).length;

        // Se nos últimos 12 ticks, 9 ou mais foram ALTOS (75% saturação)
        // O Edge estatístico diz que a exaustão vai gerar números BAIXOS agora.
        if (highCount >= 9) {
            activeSignals.push({ 
                type: 'DIGITUNDER', barrier: 5, name: 'Equilíbrio de Ouro', conf: 90,
                reason: 'Saturação de números ALTOS. Exaustão detectada.'
            });
        }

        // Inverso: Se houve saturação de números BAIXOS
        if (lowCount >= 9) {
            activeSignals.push({ 
                type: 'DIGITOVER', barrier: 4, name: 'Equilíbrio de Ouro', conf: 90,
                reason: 'Saturação de números BAIXOS. Explosão iminente.'
            });
        }

        return activeSignals;
    },

    // Filtra se o mercado de ticks está muito "nervoso" (Spikes de 1s)
    checkMicroVolatility() {
        if (this.digitHistory.length < 10) return false;
        const recent = this.digitHistory.slice(-5);
        const uniqueDigits = new Set(recent).size;
        // Se em 5 ticks só saiu o mesmo número ou números muito colados, 
        // o mercado está sem liquidez ou travado.
        return uniqueDigits <= 1; 
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
        for(let i=1; i<last10.length; i++) diffs += Math.abs(last10[i] - last10[i-1]);
        return diffs / 10;
    }
};
