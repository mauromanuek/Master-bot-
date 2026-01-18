class AnaliseGeral {
    constructor(backendUrl) {
        this.backendUrl = backendUrl || "https://master-bot-beta.vercel.app/analisar";
        this.historicoVelas = [];
        this.ultimosTicks = []; // Nova lista para Ticks brutos
        this._analisando = false;
    }

    limparHistorico() {
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
    }

    adicionarDados(velas, tickBruto = null) {
        // 1. Processa Velas (OHLC)
        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                o: parseFloat(v.open), h: parseFloat(v.high), l: parseFloat(v.low), c: parseFloat(v.close)
            }));
        }

        // 2. Processa Ticks em tempo real (para sentir a pressão de compra/venda)
        if (tickBruto) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 20) this.ultimosTicks.shift();
        }
        
        if (this.historicoVelas.length > 50) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        if (this._analisando || this.historicoVelas.length < 10) return null;

        // Preparamos o pacote de dados BRUTOS para a IA
        const payload = {
            asset: window.app ? app.currentAsset : "R_100",
            data_hora: new Date().toISOString(),
            contexto_ohlc: this.historicoVelas.slice(-20), // Últimas 20 velas
            fluxo_ticks: this.ultimosTicks, // Últimos 20 movimentos de preço
            indicadores_sugeridos: this.calcularIndicadoresLocais() // Apenas como referência
        };

        this._analisando = true;
        try {
            const veredito = await this.chamarGroq(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            this._analisando = false;
            return { direcao: "NEUTRO", motivo: "Erro de conexão" };
        }
    }

    async chamarGroq(payload) {
        const response = await fetch(this.backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        const resIA = JSON.parse(data.choices[0].message.content);
        
        return {
            direcao: resIA.direcao.toUpperCase(),
            confianca: resIA.confianca,
            estratégia: resIA.estratégia,
            motivo: resIA.motivo
        };
    }

    calcularIndicadoresLocais() {
        const v = this.historicoVelas;
        const atual = v[v.length - 1];
        const anterior = v[v.length - 2];
        return {
            rsi_estimado: 50, // O JS não precisa mais calcular com precisão, a IA fará isso
            tendencia_imediata: atual.c > anterior.c ? "ALTA" : "BAIXA"
        };
    }
}
