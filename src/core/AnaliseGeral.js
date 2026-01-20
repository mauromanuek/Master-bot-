class AnaliseGeral {
    constructor(backendUrl) {
        // Ajustado para apontar para o seu novo endpoint Flask determinístico
        this.backendUrl = backendUrl || "http://localhost:5000/analisar"; 
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
        // Sniper exige pelo menos 20 velas para calcular Tendência e Zonas de Memória
        if (this._analisando || this.historicoVelas.length < 20) return null;

        const assetName = window.app ? app.currentAsset : "R_100";
        
        // Payload agora focado em dados brutos para a lógica determinística do Python
        const payload = {
            asset: assetName,
            fluxo_ticks: this.ultimosTicks,
            contexto_velas: this.historicoVelas.slice(-30), // Enviamos contexto para Médias Móveis e Suporte/Resistência
            indicadores: this.calcularIndicadoresLocais() // Opcional: pré-processamento no JS
        };

        this._analisando = true;
        try {
            const veredito = await this.chamarEngineSniper(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            console.error("[Sniper Engine] Falha no processamento:", e);
            this._analisando = false;
            return { direcao: "NEUTRO", confianca: 0, motivo: "Erro de conexão com a Engine" };
        }
    }

    // Função auxiliar para otimizar o trabalho do Backend
    calcularIndicadoresLocais() {
        if (this.historicoVelas.length < 14) return {};
        const closes = this.historicoVelas.slice(-14).map(v => v.close);
        // Exemplo simples de retorno de RSI local para o backend
        return {
            ultimo_fechamento: closes[closes.length - 1],
            variacao: closes[closes.length - 1] - closes[0]
        };
    }

    async chamarEngineSniper(payload) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // Sniper precisa de resposta em < 3s

        try {
            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // REMOVIDO: Lógica de data.choices[0] (IA)
            // ADICIONADO: Leitura direta do JSON determinístico
            const content = await response.json();
            
            return {
                direcao: (content.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(content.confianca || 0),
                estratégia: content.estratégia || "Sniper Quant",
                motivo: content.motivo || "Análise técnica estrutural",
                asset: payload.asset
            };
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    }
}
