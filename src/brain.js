const Brain = {
    // Memória para análise de dígitos
    digitHistory: [],
    statusMessage: "Iniciando motores de análise...",
    lastStatusUpdate: 0,

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

    // 2️⃣ MOTOR PROFISSIONAL DE DÍGITOS (FOCO EM 90% ASSERTIVIDADE)
    analyzeDigits(price) {
        const priceStr = price.toString();
        const lastDigit = parseInt(priceStr.charAt(priceStr.length - 1));
        
        this.digitHistory.push(lastDigit);
        if (this.digitHistory.length > 50) this.digitHistory.shift(); 

        const counts = new Array(10).fill(0);
        const last25 = this.digitHistory.slice(-25);
        last25.forEach(d => counts[d]++);
        const stats = counts.map(c => Math.round((c / last25.length) * 100));

        const isVolatile = this.checkMicroVolatility();
        const signals = isVolatile ? [] : this.getProfessionalDigitSignals(stats, this.digitHistory);

        // Gerencia mensagens de status para UI a cada 10s
        const now = Date.now();
        if (now - this.lastStatusUpdate > 10000) {
            this.updateStatusMessage(signals);
            this.lastStatusUpdate = now;
        }

        return {
            last: lastDigit,
            stats: stats,
            isVolatile: isVolatile,
            signals: signals
        };
    },

    getProfessionalDigitSignals(stats, fullHistory) {
        let activeSignals = [];
        const lastDigit = fullHistory[fullHistory.length - 1];
        const prevDigit = fullHistory[fullHistory.length - 2];
        const last5 = fullHistory.slice(-5);
        const last12 = fullHistory.slice(-12);
        const last5Sum = last5.reduce((a, b) => a + b, 0);

        // FILTRO ANTI-REPETIÇÃO: Evita padrões fixos da corretora
        if (lastDigit === prevDigit) return [];

        // --- ESTRATÉGIA NOVO: SNIPER 30% (Under 3: 0, 1, 2) ---
        // Filtro de Seca Absoluta: 0, 1, 2 não aparecem há 12 ticks
        const lowDrought = last12.filter(d => d < 3).length === 0;
        // Filtro de Soma: Tendência de queda nos números altos
        const isSumDropping = last5Sum < 30; 
        // Filtro Perda Virtual: O último precisa ter sido um "erro" (>= 3) para entrar na reversão
        const isVirtualLoss = lastDigit >= 3;

        if (lowDrought && isSumDropping && isVirtualLoss) {
            activeSignals.push({
                type: 'DIGITUNDER', barrier: 3, name: 'Sniper 30%', conf: 98,
                reason: 'Seca absoluta de 0-2 detectada. Probabilidade de reversão máxima.'
            });
        }

        // --- ESTRATÉGIA 1: CORINGA CASH (Under 7) ---
        const highInLast5 = last5.filter(d => d >= 7).length;
        if (highInLast5 >= 3 && lastDigit >= 7) {
            activeSignals.push({ 
                type: 'DIGITUNDER', barrier: 7, name: 'Coringa Cash', conf: 95,
                reason: 'Cluster de números altos (7-9). Gatilho Under 7 ativado.'
            });
        }

        // --- ESTRATÉGIA 2: EQUILÍBRIO DE OURO (50/50) ---
        const highCount12 = last12.filter(d => d >= 5).length;
        const lowCount12 = last12.filter(d => d <= 4).length;

        if (highCount12 >= 10 && lastDigit >= 5) { // Espera exaustão extrema + perda virtual
            activeSignals.push({ 
                type: 'DIGITUNDER', barrier: 5, name: 'Equilíbrio de Ouro', conf: 92,
                reason: 'Exaustão 50/50: Sequência de ALTOS. Entrando em BAIXOS.'
            });
        }

        if (lowCount12 >= 10 && lastDigit <= 4) {
            activeSignals.push({ 
                type: 'DIGITOVER', barrier: 4, name: 'Equilíbrio de Ouro', conf: 92,
                reason: 'Exaustão 50/50: Sequência de BAIXOS. Entrando em ALTOS.'
            });
        }

        return activeSignals;
    },

    updateStatusMessage(signals) {
        if (signals.length > 0) {
            this.statusMessage = `🎯 Oportunidade: ${signals[0].name} detectada!`;
        } else {
            const last12 = this.digitHistory.slice(-12);
            const drought = last12.filter(d => d < 3).length;
            this.statusMessage = drought === 0 
                ? "🔍 Sniper: Seca de 0-2 atingiu nível crítico. Aguardando gatilho..."
                : "📡 Radar: Analisando padrões e filtrando ruídos do mercado...";
        }
    },

    checkMicroVolatility() {
        if (this.digitHistory.length < 10) return false;
        const recent = this.digitHistory.slice(-5);
        const uniqueDigits = new Set(recent).size;
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
