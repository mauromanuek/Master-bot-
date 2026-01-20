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
        console.log("[Sniper Engine] Memória limpa para novo ciclo.");
    }

    adicionarDados(velas, tickBruto = null) {
        if (tickBruto !== null) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 20) this.ultimosTicks.shift();
        }

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
        // Reduzido para 5 velas para aumentar a sensibilidade do Scalping Sniper
        if (this._analisando || this.historicoVelas.length < 5) return null;

        const assetName = window.app ? app.currentAsset : "R_100";
        
        const payload = {
            asset: assetName,
            fluxo_ticks: this.ultimosTicks,
            contexto_velas: this.historicoVelas.slice(-20) // Enviamos mais contexto para cálculo de tendência
        };

        this._analisando = true;
        try {
            // Chamada direta para a Engine Determinística
            const veredito = await this.chamarEngineSniper(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            console.error("[Sniper Engine] Falha no processamento:", e);
            this._analisando = false;
            return { direcao: "NEUTRO", confianca: 0, motivo: "Erro de processamento local" };
        }
    }

    async chamarEngineSniper(payload) {
        // Reduzimos o timeout drasticamente, pois a lógica técnica é instantânea (diferente da IA)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); 

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
            
            // O backend agora retorna o JSON estruturado diretamente no content
            const content = typeof data.choices[0].message.content === 'string' 
                ? JSON.parse(data.choices[0].message.content) 
                : data.choices[0].message.content;
            
            return {
                direcao: (content.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(content.confianca || 0),
                estratégia: content.estratégia || "Sniper Technical",
                motivo: content.motivo || "Análise estrutural processada",
                asset: payload.asset
            };
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    }
}
