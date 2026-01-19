class AnaliseGeral {
    constructor(backendUrl) {
        this.backendUrl = backendUrl || "https://master-bot-beta.vercel.app/analisar";
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
    }

    limparHistorico() {
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
        console.log("Memória limpa para novo ciclo.");
    }

    adicionarDados(velas, tickBruto = null) {
        // 1. Processamento de Ticks em Tempo Real
        if (tickBruto !== null) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 20) this.ultimosTicks.shift();
        }

        // 2. Processamento de Velas OHLC (Padronização de chaves para o histórico interno)
        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                open: parseFloat(v.open || v.o || 0),
                high: parseFloat(v.high || v.h || 0),
                low: parseFloat(v.low || v.l || 0),
                close: parseFloat(v.close || v.c || 0),
                epoch: parseInt(v.epoch || v.e || 0)
            }));
        } else if (velas && typeof velas === 'object') {
            const nova = {
                open: parseFloat(velas.open || velas.o || 0),
                high: parseFloat(velas.high || velas.h || 0),
                low: parseFloat(velas.low || velas.l || 0),
                close: parseFloat(velas.close || velas.c || 0),
                epoch: parseInt(velas.epoch || velas.e || 0)
            };
            
            if (this.historicoVelas.length > 0) {
                const ultima = this.historicoVelas[this.historicoVelas.length - 1];
                if (nova.epoch > ultima.epoch) {
                    this.historicoVelas.push(nova);
                } else if (nova.epoch === ultima.epoch) {
                    this.historicoVelas[this.historicoVelas.length - 1] = nova;
                }
            } else if (nova.epoch > 0) {
                this.historicoVelas.push(nova);
            }
        }
        
        if (this.historicoVelas.length > 100) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        // Proteção contra chamadas simultâneas e dados insuficientes
        if (this._analisando || this.historicoVelas.length < 10) {
            return null;
        }

        const assetName = window.app ? app.currentAsset : "R_100";
        
        // CORREÇÃO: Mapeamento correto das chaves para o Payload
        const payload = {
            asset: assetName,
            fluxo_ticks: this.ultimosTicks,
            contexto_velas: this.historicoVelas.slice(-15).map(v => ({
                open: v.open.toFixed(5),
                close: v.close.toFixed(5),
                high: v.high.toFixed(5),
                low: v.low.toFixed(5)
            }))
        };

        this._analisando = true;
        try {
            const veredito = await this.chamarGroq(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            console.error("[AnaliseGeral] Falha na análise:", e);
            this._analisando = false;
            return { direcao: "NEUTRO", confianca: 0, motivo: "Instabilidade na IA" };
        }
    }

    async chamarGroq(payload) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Aumentado para 15s para maior estabilidade

        try {
            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            
            // Tratamento robusto para extração do conteúdo da Groq
            let content;
            try {
                content = typeof data.choices[0].message.content === 'string' 
                    ? JSON.parse(data.choices[0].message.content) 
                    : data.choices[0].message.content;
            } catch (parseError) {
                console.error("[AnaliseGeral] Erro ao decodificar JSON da IA:", data);
                throw new Error("Resposta da IA inválida");
            }
            
            return {
                direcao: (content.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(content.confianca || 0),
                estratégia: content.estratégia || "Análise de Momentum",
                motivo: content.motivo || "Veredito técnico processado",
                asset: payload.asset
            };
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    }
}
