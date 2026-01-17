class AnaliseGeral {
    constructor(backendUrl) {
        // Define a rota do backend atualizada para a Vercel
        this.backendUrl = backendUrl || "https://master-bot-beta.vercel.app/analisar";
        this.historicoVelas = [];
    }

    /**
     * Limpa o histórico de velas para evitar contaminação de dados
     * entre ativos diferentes (Resolve Problema 1, 3 e 6)
     */
    limparHistorico() {
        this.historicoVelas = [];
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
            // Processamento de Tick em Tempo Real (OHLC)
            const novaVela = {
                open: parseFloat(velas.open),
                high: parseFloat(velas.high),
                low: parseFloat(velas.low),
                close: parseFloat(velas.close),
                epoch: parseInt(velas.epoch)
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
            volume_check: atual.high !== atual.low,
            pronto: true
        };
    }

    async obterVereditoCompleto() {
        const indicadores = this.calcularIndicadoresLocais();
        
        // Garante que o ativo analisado seja EXATAMENTE o que o sistema exibe
        const assetName = window.app ? app.currentAsset : "R_100";
        
        if (!indicadores.pronto) {
            return {
                direcao: "NEUTRO",
                confianca: 0,
                motivo: "Aguardando maturação de dados (Mínimo 14 velas)"
            };
        }

        // Prepara histórico reduzido para a IA economizar tokens e focar no momentum
        const priceActionData = this.historicoVelas.slice(-15).map(v => ({
            o: v.open, h: v.high, l: v.low, c: v.close
        }));

        const payload = {
            contexto: `Scalping Profissional - LLaMA 3.3`,
            asset: assetName,
            indicadores: {
                tendencia: indicadores.tendenciaDow,
                padrao: indicadores.isMartelo ? "MARTELO" : "NORMAL",
                rsi: indicadores.rsi,
                ohlc: priceActionData
            }
        };

        return await this.chamarGroq(payload);
    }

    async chamarGroq(payload) {
        try {
            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Erro na rede/Vercel");

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                const veredito = JSON.parse(data.choices[0].message.content);
                return {
                    direcao: veredito.direcao || "NEUTRO",
                    confianca: veredito.confianca || 0,
                    motivo: veredito.motivo || "Análise concluída pela IA"
                };
            }
            throw new Error("Formato de resposta inválido");

        } catch (e) {
            console.warn("Fallback Ativado:", e.message);
            const ind = this.calcularIndicadoresLocais();
            
            // Lógica Técnica Híbrida de Contingência
            let direcao = "NEUTRO";
            let confianca = 50;

            if (ind.rsi < 30) { direcao = "CALL"; confianca = 65; }
            else if (ind.rsi > 70) { direcao = "PUT"; confianca = 65; }
            else if (ind.isMartelo && ind.tendenciaDow === "BAIXA") { direcao = "CALL"; confianca = 60; }

            return {
                direcao: direcao,
                confianca: confianca,
                motivo: "Análise Técnica Local (IA em Standby)"
            };
        }
    }
}
