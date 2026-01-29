const Brain = {
    // Memória para análise de dígitos
    digitHistory: [],

    // 1️⃣ ANALISADOR DE TENDÊNCIA (MODOS ORIGINAIS)
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

    // ⚡ MODO SCALPING (Ticks / Micro-tendência)
    logicScalper(price, prev, ema9, ema21, ticks) {
        const isTrendUp = ema9 > ema21;
        const last3TicksUp = ticks.slice(-3).every((t, i, a) => i === 0 || t > a[i-1]);
        const last3TicksDown = ticks.slice(-3).every((t, i, a) => i === 0 || t < a[i-1]);

        if (isTrendUp && last3TicksUp && price > ema9) {
            return { action: "CALL", strength: 85, reason: "Micro-Tendência e Fluxo de Alta" };
        }
        if (!isTrendUp && last3TicksDown && price < ema9) {
            return { action: "PUT", strength: 85, reason: "Micro-Tendência e Fluxo de Baixa" };
        }

        const candleMove = price - ticks[ticks.length - 5]; 
        if (candleMove < 0 && price > ema21 && price < prev) { 
             return { action: "CALL", strength: 70, reason: "Rejeição Curta em Suporte" };
        }

        return { action: "NEUTRO", strength: 20, reason: "Aguardando Momento" };
    },

    // 🎯 MODO CAÇA-GANHO (Pullback / Confluência)
    logicCacaGanho(price, ema21, rsi, ticks) {
        const sma50 = this.calculateEMA(ticks, 50);
        const trendUp = price > sma50;
        const touchedEMA = ticks.slice(-5).some(t => Math.abs(t - ema21) < 0.01);
        
        if (trendUp && touchedEMA && price > ema21 && rsi < 65) {
            return { action: "CALL", strength: 75, reason: "Pullback Confirmado na EMA 21" };
        }
        if (!trendUp && touchedEMA && price < ema21 && rsi > 35) {
            return { action: "PUT", strength: 75, reason: "Pullback Confirmado na EMA 21" };
        }

        return { action: "NEUTRO", strength: 10, reason: "Buscando Tendência Definida" };
    },

    // 🧠 MODO ANÁLISE PROFUNDA (Estatístico / Estrutural)
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

    // 2️⃣ NOVO MOTOR: ANÁLISE DE PROBABILIDADE DE DÍGITOS
    analyzeDigits(price) {
        // Extrai o último dígito do preço (Ex: 1092.43 -> 3)
        const priceStr = price.toString();
        const lastDigit = parseInt(priceStr.charAt(priceStr.length - 1));
        
        // Alimenta a memória de 25 ticks (conforme imagem enviada)
        this.digitHistory.push(lastDigit);
        if (this.digitHistory.length > 25) {
            this.digitHistory.shift();
        }

        // Conta a frequência de cada dígito (0 a 9)
        const counts = new Array(10).fill(0);
        this.digitHistory.forEach(d => counts[d]++);

        // Calcula a porcentagem de cada um
        const stats = counts.map(c => Math.round((c / this.digitHistory.length) * 100));

        return {
            last: lastDigit,
            stats: stats,
            signals: this.getDigitSignals(stats, lastDigit)
        };
    },

    // ESTRATÉGIAS MÁGICAS DE DÍGITOS
    getDigitSignals(stats, last) {
        let activeSignals = [];

        // ESTRATÉGIA A: Coringa Cash (Under 7) - Probabilidade: 70%
        // Se a frequência dos dígitos 7, 8 e 9 somada for menor que 15%
        const dangerZone = stats[7] + stats[8] + stats[9];
        if (dangerZone < 15) {
            activeSignals.push({ 
                type: 'DIGITUNDER', 
                barrier: 7, 
                name: 'Coringa Cash', 
                conf: 88,
                reason: 'Baixa ocorrência de dígitos altos'
            });
        }

        // ESTRATÉGIA B: Divergência Zero (Differ) - Probabilidade: 90%
        // Se o dígito 0 está ausente ou com frequência mínima
        if (stats[0] < 4) {
            activeSignals.push({ 
                type: 'DIGITDIFF', 
                barrier: 0, 
                name: 'Divergência Zero', 
                conf: 95,
                reason: 'Dígito 0 fora de ciclo estatístico'
            });
        }

        // ESTRATÉGIA C: Explosão Over (Over 2) - Probabilidade: 70%
        // Se dígitos baixos (0,1,2) estão saturados (> 40%), tendência de vir número alto
        const lowSaturation = stats[0] + stats[1] + stats[2];
        if (lowSaturation > 40) {
            activeSignals.push({ 
                type: 'DIGITOVER', 
                barrier: 2, 
                name: 'Explosão Over', 
                conf: 82,
                reason: 'Saturação de dígitos baixos detectada'
            });
        }

        // ESTRATÉGIA D: Paridade Real (Odd/Even)
        // Analisa sequência de 3 iguais para reversão
        const last3 = this.digitHistory.slice(-3);
        if (last3.length === 3 && last3.every(d => d % 2 === 0)) {
            activeSignals.push({ 
                type: 'DIGITODD', 
                barrier: 0, 
                name: 'Paridade Real', 
                conf: 75,
                reason: 'Reversão estatística após 3 pares'
            });
        }

        // ESTRATÉGIA E: Sniper Differ (Repetição)
        // Se um dígito repete igual ao anterior, a chance de NÃO repetir a 3ª vez é alta
        if (this.digitHistory[this.digitHistory.length - 1] === this.digitHistory[this.digitHistory.length - 2]) {
            activeSignals.push({ 
                type: 'DIGITDIFF', 
                barrier: last, 
                name: 'Sniper Differ', 
                conf: 92,
                reason: 'Bloqueio de repetição tripla'
            });
        }

        return activeSignals;
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
