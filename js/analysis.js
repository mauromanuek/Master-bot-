// --- js/analysis.js ---
const Analysis = {
    data: {
        '1H': [],
        '15M': [],
        '5M':[]
    },
    
    indicators: {
        '1H': { ema: null, rsi: null, atr: null, close: null },
        '15M': { ema: null, rsi: null, atr: null, close: null },
        '5M': { ema: null, rsi: null, atr: null, close: null }
    },

    updateHistory: (tf, candles) => {
        Analysis.data[tf] = candles.map(c => ({
            epoch: parseInt(c.epoch),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        }));
        Analysis.runCalculations(tf);
    },

    updateRealtime: (tf, candle) => {
        const arr = Analysis.data[tf];
        if (arr.length === 0) return;

        const cObj = {
            epoch: parseInt(candle.open_time),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close)
        };

        if (arr[arr.length - 1].epoch === cObj.epoch) {
            arr[arr.length - 1] = cObj; // Atualiza a vela atual
        } else {
            arr.push(cObj); // Nova vela
            if(arr.length > 1500) arr.shift();
        }

        Analysis.runCalculations(tf);
        
        // Só verifica sinais se tivermos dados de todos os TFs atualizados
        if(Analysis.indicators['1H'].ema && Analysis.indicators['15M'].ema && Analysis.indicators['5M'].ema) {
            Signals.check();
        }
    },

    runCalculations: (tf) => {
        const arr = Analysis.data[tf];
        if (arr.length < 200) return;

        const close = arr[arr.length - 1].close;
        Analysis.indicators[tf].close = close;

        // Configuração de Períodos Dinâmicos
        const emaPeriod = tf === '1H' ? 1000 : (tf === '15M' ? 200 : 50);
        
        if (arr.length >= emaPeriod) {
            Analysis.indicators[tf].ema = Analysis.math.ema(arr, emaPeriod);
            const dir = close > Analysis.indicators[tf].ema ? 'UP' : 'DOWN';
            UI.updateIndicator(tf, 'ema', Analysis.indicators[tf].ema, dir);
        }

        Analysis.indicators[tf].rsi = Analysis.math.rsi(arr, 14);
        UI.updateIndicator(tf, 'rsi', Analysis.indicators[tf].rsi);

        Analysis.indicators[tf].atr = Analysis.math.atr(arr, 14);
        UI.updateIndicator(tf, 'atr', Analysis.indicators[tf].atr);
    },

    math: {
        ema: (data, period) => {
            let k = 2 / (period + 1);
            let ema = data[0].close;
            for (let i = 1; i < data.length; i++) {
                ema = (data[i].close * k) + (ema * (1 - k));
            }
            return ema;
        },
        rsi: (data, period) => {
            let gains = 0, losses = 0;
            for (let i = 1; i <= period; i++) {
                let diff = data[i].close - data[i-1].close;
                if (diff >= 0) gains += diff; else losses -= diff;
            }
            let avgGain = gains / period;
            let avgLoss = losses / period;

            for (let i = period + 1; i < data.length; i++) {
                let diff = data[i].close - data[i-1].close;
                let gain = diff >= 0 ? diff : 0;
                let loss = diff < 0 ? -diff : 0;
                avgGain = ((avgGain * (period - 1)) + gain) / period;
                avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            }
            if (avgLoss === 0) return 100;
            let rs = avgGain / avgLoss;
            return 100 - (100 / (1 + rs));
        },
        atr: (data, period) => {
            let trSum = 0;
            let trArr =[];
            for (let i = 1; i < data.length; i++) {
                let tr = Math.max(
                    data[i].high - data[i].low,
                    Math.abs(data[i].high - data[i-1].close),
                    Math.abs(data[i].low - data[i-1].close)
                );
                trArr.push(tr);
            }
            for(let i=0; i<period; i++) trSum += trArr[i];
            let atr = trSum / period;
            for(let i=period; i<trArr.length; i++) {
                atr = ((atr * (period - 1)) + trArr[i]) / period;
            }
            return atr;
        }
    }
};
