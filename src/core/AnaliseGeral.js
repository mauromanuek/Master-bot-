class AnaliseGeral {
    constructor(backendUrl) {
        // Define a rota do backend atualizada para a Vercel
        this.backendUrl = backendUrl || "https://master-bot-beta.vercel.app/analisar";
        this.historicoVelas = [];
        this._analisando = false; // Lock de execução para evitar múltiplas chamadas simultâneas
    }

    /**
     * Limpa o histórico de velas para evitar contaminação de dados
     * entre ativos diferentes (Resolve Problema 1, 3 e 6)
     */
    limparHistorico() {
        this.historicoVelas = [];
        this._analisando = false; 
        console.log("Buffer de análise limpo para novo ativo.");
    }

    adicionarDados(velas) {
        // Garante que as velas recebidas da Deriv API sejam armazenadas corretamente
        if (Array.isArray(velas)) {
            // Carga inicial de histórico (count: 50)
            this.historicoVelas = velas.map(v => ({
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                epoch: parseInt(v.epoch)
            }));
        } else if (velas && typeof velas === 'object') {
            // Processamento de Tick em Tempo Real (OHLC) - Normalização explícita
            const novaVela = {
                open: parseFloat(velas.open || velas.o),
                high: parseFloat(velas.high || velas.h),
                low: parseFloat(velas.low || velas.l),
                close: parseFloat(velas.close || velas.c),
                epoch: parseInt(velas.epoch || velas.e)
            };
            
            if (this.historicoVelas.length === 0) {
                this.historicoVelas.push(novaVela);
                return;
            }

            const ultimaVela = this.historicoVelas[this.historicoVelas.length - 1];

            // Se o epoch for maior, é uma nova vela de 1 minuto
            if (novaVela.epoch > ultimaVela.epoch) {
                this.historicoVelas.push(novaVela);
            } else {
                // Se for o mesmo epoch, atualiza a vela atual (formação do OHLC)
                this.historicoVelas[this.historicoVelas.length - 1] = novaVela;
            }
        }
        
        // Mantém buffer otimizado para análise de momentum e RSI
        if (this.historicoVelas.length > 100) {
            this.historicoVelas = this.historicoVelas.slice(-100);
        }
    }

    calcularIndicadoresLocais() {
        // Precisamos de pelo menos 14 velas para RSI e Dow (Problema 4)
        if (!this.historicoVelas || this.historicoVelas.length < 14) {
            return { tendenciaDow: "NEUTRA", isMartelo: false, rsi: 50, pronto: false };
        }

        const v = this.historicoVelas;
        const atual = v[v.length - 1];
        const anterior = v[v.length - 2];

        // 1. Teoria de Dow
        const tendenciaDow = atual.close > anterior.close ? "ALTA" : "BAIXA";

        // 2. Price Action: Martelo
        const corpo = Math.abs(atual.open - atual.close);
        const precoMinimoCorpo = Math.min(atual.open, atual.close);
        const sombraInferior = precoMinimoCorpo - atual.low;
        const isMartelo = sombraInferior > (corpo * 2) && corpo > 0;

        // 3. RSI Real (Período 14)
        let ganhos = 0;
        let perdas = 0;
        for (let i = v.length - 14; i < v.length; i++) {
            if (!v[i-1]) continue;
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
        // Lock de proteção para evitar múltiplas chamadas (Problema: IA bloqueia o ciclo)
        if (this._analisando) return null;

        const indicadores = this.calcularIndicadoresLocais();
        // Resolve contaminação: Usa assetOverride (Radar) ou o asset fixo do momento da chamada
        const assetName = assetOverride || (window.app ? app.currentAsset : "R_100");
        
        if (!indicadores.pronto) {
            return {
                direcao: "NEUTRO",
                confianca: 0,
                motivo: "Aguardando maturação (Mínimo 14 velas)"
            };
        }

        const priceActionData = this.historicoVelas.slice(-15).map(v => ({
            o: v.open, h: v.high, l: v.low, c: v.close
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
            throw e;
        }
    }

    async chamarGroq(payload) {
        try {
            // Timeout via AbortController para não travar o bot
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
            
            // Adaptado para o novo formato simplificado do app.py corrigido
            const resIA = data.choices ? JSON.parse(data.choices[0].message.content) : data;
            
            return {
                direcao: resIA.direcao || "NEUTRO",
                confianca: resIA.confianca || 0,
                motivo: resIA.motivo || "Análise concluída",
                asset: payload.asset // Echo para conferência de segurança
            };

        } catch (e) {
            const ind = this.calcularIndicadoresLocais();
            let direcao = "NEUTRO";
            if (ind.rsi < 30) direcao = "CALL";
            else if (ind.rsi > 70) direcao = "PUT";

            return {
                direcao: direcao,
                confianca: 50,
                motivo: "Fallback: Análise Técnica Local"
            };
        }
    }
}
