class AnaliseGeral {
    constructor(backendUrl) {
        this.backendUrl = backendUrl || "https://master-bot-beta.vercel.app/analisar";
        this.historicoVelas = [];
        this._analisando = false;
    }

    limparHistorico() {
        this.historicoVelas = [];
        this._analisando = false; 
        console.log("Buffer de análise limpo para novo ativo.");
    }

    adicionarDados(velas) {
        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                open: parseFloat(v.open || 0),
                high: parseFloat(v.high || 0),
                low: parseFloat(v.low || 0),
                close: parseFloat(v.close || 0),
                epoch: parseInt(v.epoch || 0)
            })).filter(v => v.epoch > 0);
        } else if (velas && typeof velas === 'object') {
            const novaVela = {
                open: parseFloat(velas.open || velas.o || 0),
                high: parseFloat(velas.high || velas.h || 0),
                low: parseFloat(velas.low || velas.l || 0),
                close: parseFloat(velas.close || velas.c || 0),
                epoch: parseInt(velas.epoch || velas.e || 0)
            };
            
            if (this.historicoVelas.length === 0) {
                if (novaVela.epoch > 0) this.historicoVelas.push(novaVela);
                return;
            }

            const ultimaVela = this.historicoVelas[this.historicoVelas.length - 1];

            if (novaVela.epoch > ultimaVela.epoch) {
                this.historicoVelas.push(novaVela);
            } else if (novaVela.epoch === ultimaVela.epoch) {
                this.historicoVelas[this.historicoVelas.length - 1] = novaVela;
            }
        }
        
        if (this.historicoVelas.length > 100) {
            this.historicoVelas = this.historicoVelas.slice(-100);
        }
    }

    calcularIndicadoresLocais() {
        // Garantimos 15 velas para ter 14 variações de preço para o RSI
        if (!this.historicoVelas || this.historicoVelas.length < 15) {
            return { tendenciaDow: "NEUTRA", isMartelo: false, rsi: 50, pronto: false };
        }

        const v = this.historicoVelas;
        const atual = v[v.length - 1];
        const anterior = v[v.length - 2];

        const tendenciaDow = atual.close > anterior.close ? "ALTA" : "BAIXA";

        // Identificação de Martelo (Candlestick Pattern)
        const corpo = Math.abs(atual.open - atual.close);
        const precoMinimoCorpo = Math.min(atual.open, atual.close);
        const sombraInferior = precoMinimoCorpo - atual.low;
        const isMartelo = sombraInferior > (corpo * 2) && corpo > 0;

        // Cálculo do RSI (Relative Strength Index)
        let ganhos = 0;
        let perdas = 0;
        for (let i = v.length - 14; i < v.length; i++) {
            const diff = v[i].close - v[i-1].close;
            if (diff >= 0) ganhos += diff;
            else perdas += Math.abs(diff);
        }
        const rsi = perdas === 0 ? 100 : 100 - (100 / (1 + (ganhos / perdas)));

        return { 
            tendenciaDow, 
            isMartelo, 
            rsi: Math.round(rsi),
            volatilidade: atual.high !== atual.low,
            pronto: true
        };
    }

    async obterVereditoCompleto(assetOverride = null) {
        if (this._analisando) return null;

        const indicadores = this.calcularIndicadoresLocais();
        const assetName = assetOverride || (window.app ? app.currentAsset : "R_100");
        
        if (!indicadores.pronto) {
            return { direcao: "NEUTRO", confianca: 0, motivo: "Carregando histórico..." };
        }

        // Formatação dos dados OHLC para facilitar a leitura da IA (reduzindo casas decimais irrelevantes)
        const priceActionData = this.historicoVelas.slice(-15).map(v => ({
            o: Number(v.open.toFixed(5)), 
            h: Number(v.high.toFixed(5)), 
            l: Number(v.low.toFixed(5)), 
            c: Number(v.close.toFixed(5))
        }));

        const payload = {
            asset: assetName,
            indicadores: {
                tendencia: indicadores.tendenciaDow,
                padrao: indicadores.isMartelo ? "MARTELO" : "NORMAL",
                rsi: indicadores.rsi,
                ohlc: priceActionData
            }
        };

        this._analisando = true;
        try {
            const veredito = await this.chamarGroq(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            this._analisando = false;
            // Fallback imediato em caso de erro na rede ou Vercel
            return this.gerarVereditoFallback(indicadores);
        }
    }

    async chamarGroq(payload) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            if (!response.ok) throw new Error("Erro Vercel");

            const data = await response.json();
            const resIA = data.choices ? JSON.parse(data.choices[0].message.content) : data;
            
            return {
                direcao: (resIA.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(resIA.confianca || 0),
                motivo: resIA.motivo || "Análise concluída",
                asset: payload.asset
            };

        } catch (e) {
            return this.gerarVereditoFallback(this.calcularIndicadoresLocais());
        }
    }

    gerarVereditoFallback(ind) {
        let direcao = "NEUTRO";
        if (ind.rsi < 30) direcao = "CALL";
        else if (ind.rsi > 70) direcao = "PUT";

        return {
            direcao: direcao,
            confianca: 51,
            motivo: `Análise Técnica (RSI: ${ind.rsi})`
        };
    }
}
