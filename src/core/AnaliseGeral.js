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
        // 1. Processamento de Ticks em Tempo Real (Velocidade do preço)
        if (tickBruto) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 20) this.ultimosTicks.shift();
        }

        // 2. Processamento de Velas OHLC
        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                o: parseFloat(v.open), h: parseFloat(v.high), l: parseFloat(v.low), c: parseFloat(v.close), e: v.epoch
            }));
        } else if (velas && typeof velas === 'object' && velas.e) {
            const nova = { o: parseFloat(velas.o), h: parseFloat(velas.h), l: parseFloat(velas.l), c: parseFloat(velas.c), e: velas.e };
            
            if (this.historicoVelas.length > 0) {
                const ultima = this.historicoVelas[this.historicoVelas.length - 1];
                if (nova.e > ultima.e) this.historicoVelas.push(nova);
                else if (nova.e === ultima.e) this.historicoVelas[this.historicoVelas.length - 1] = nova;
            } else {
                this.historicoVelas.push(nova);
            }
        }
        
        if (this.historicoVelas.length > 50) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        if (this._analisando || this.historicoVelas.length < 10) return null;

        const assetName = window.app ? app.currentAsset : "R_100";
        
        // Pacote de dados brutos para a IA decidir
        const payload = {
            asset: assetName,
            fluxo_ticks: this.ultimosTicks,
            contexto_velas: this.historicoVelas.slice(-15).map(v => ({
                open: v.o.toFixed(5), close: v.c.toFixed(5), high: v.h.toFixed(5), low: v.l.toFixed(5)
            }))
        };

        this._analisando = true;
        try {
            const veredito = await this.chamarGroq(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            this._analisando = false;
            return { direcao: "NEUTRO", confianca: 0, motivo: "Erro na IA" };
        }
    }

    async chamarGroq(payload) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(this.backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();
        const resIA = JSON.parse(data.choices[0].message.content);
        
        return {
            direcao: (resIA.direcao || "NEUTRO").toUpperCase(),
            confianca: parseInt(resIA.confianca || 0),
            estratégia: resIA.estratégia || "Análise de Fluxo",
            motivo: resIA.motivo || "Decisão autônoma",
            asset: payload.asset
        };
    }
}
