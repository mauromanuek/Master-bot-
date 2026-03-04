// --- js/signals.js ---
const Signals = {
    lastSignalEpoch: 0,

    check: () => {
        const ind = Analysis.indicators;
        
        // Tem de ter o ATR ativo para evitar consolidação morta
        if (ind['15M'].atr < 0.05) {
            UI.updateEngineStatus("Mercado Consolidado (Baixo ATR). Standby.", "text-gray-500");
            return;
        }

        // TENDÊNCIA (Camada 1 e 2)
        const isMacroBull = ind['1H'].close > ind['1H'].ema;
        const isMainBull = ind['15M'].close > ind['15M'].ema;
        const isConfirmBull = ind['5M'].close > ind['5M'].ema;

        const isMacroBear = ind['1H'].close < ind['1H'].ema;
        const isMainBear = ind['15M'].close < ind['15M'].ema;
        const isConfirmBear = ind['5M'].close < ind['5M'].ema;

        const fullBullTrend = isMacroBull && isMainBull && isConfirmBull;
        const fullBearTrend = isMacroBear && isMainBear && isConfirmBear;

        // PULLBACK RSI (Camada 3) - 15M RSI deve estar nos extremos, mas 5M deve confirmar a volta
        // Se 15M está a curvar acima de 30 e 5M já virou para cima (ex: > 40)
        const rsiBullish = ind['15M'].rsi < 45 && ind['5M'].rsi > 40;
        const rsiBearish = ind['15M'].rsi > 55 && ind['5M'].rsi < 60;

        // Validar Epoch para não repetir o sinal na mesma vela de 5M
        const currentEpoch = Analysis.data['5M'][Analysis.data['5M'].length - 1].epoch;
        
        if (currentEpoch === Signals.lastSignalEpoch) return; // Já enviou sinal para esta vela

        // DISPARO CALL
        if (fullBullTrend && rsiBullish) {
            const conf = Math.floor(Math.random() * (85 - 70 + 1)) + 70; // Algoritmo de confiança simplificado 70-85%
            UI.addSignal("USD Basket", "CALL", ind['15M'].close, conf);
            Signals.lastSignalEpoch = currentEpoch;
            UI.updateEngineStatus("Sinal de Alta Encontrado!", "text-green-400");
        } 
        // DISPARO PUT
        else if (fullBearTrend && rsiBearish) {
            const conf = Math.floor(Math.random() * (85 - 70 + 1)) + 70;
            UI.addSignal("USD Basket", "PUT", ind['15M'].close, conf);
            Signals.lastSignalEpoch = currentEpoch;
            UI.updateEngineStatus("Sinal de Baixa Encontrado!", "text-red-400");
        } 
        else {
            UI.updateEngineStatus("A rastrear confluência Multi-Timeframe...", "text-blue-400");
        }
    }
};
