class AnaliseGeral {
    constructor(backendUrl) {
        this.backendUrl = backendUrl;
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
        this.ultimoVeredito = { direcao: "NEUTRO", confianca: 0 };
        
        // Mapeamento estendido para garantir que o Python reconheça o ativo
        this.mapaSimbolos = {
            "VOLATILITY 10 INDEX": "R_10",
            "VOLATILITY 25 INDEX": "R_25",
            "VOLATILITY 50 INDEX": "R_50",
            "VOLATILITY 75 INDEX": "R_75",
            "VOLATILITY 100 INDEX": "R_100",
            "VOLATILITY 10 (1S)": "1Z10",
            "VOLATILITY 15 (1S)": "1HZ15V",
            "VOLATILITY 100 (1S)": "1HZ100V"
        };
    }

    limparHistorico() {
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
    }

    adicionarDados(velas, tickBruto = null) {
        if (tickBruto !== null) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 20) this.ultimosTicks.shift();
        }

        // Normalização de chaves para garantir compatibilidade com o Motor Python
        const formatarVela = (v) => ({
            o: parseFloat(v.open || v.o),
            h: parseFloat(v.high || v.h),
            l: parseFloat(v.low || v.l),
            c: parseFloat(v.close || v.c),
            e: parseInt(v.epoch || v.e)
        });

        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => formatarVela(v));
        } else if (velas && typeof velas === 'object') {
            const nova = formatarVela(velas);
            
            if (this.historicoVelas.length > 0) {
                const ultima = this.historicoVelas[this.historicoVelas.length - 1];
                if (nova.e > ultima.e) {
                    this.historicoVelas.push(nova);
                } else {
                    this.historicoVelas[this.historicoVelas.length - 1] = nova;
                }
            } else {
                this.historicoVelas.push(nova);
            }
        }
        if (this.historicoVelas.length > 100) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        // Reduzi para 20 velas para o Scalping Sniper disparar mais rápido
        if (this._analisando || this.historicoVelas.length < 20) return null;

        this._analisando = true;
        
        // Captura o asset atual do objeto global app
        const assetBruto = app.currentAsset; 
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        const payload = {
            asset: assetTecnico,
            contexto_velas: this.historicoVelas.slice(-30), // Enviamos 30 para o Python calcular SMA20
            config: { sniper_mode: true, min_confidence: 70 }
        };

        try {
            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();
            let res = data;
            
            // Tratamento robusto para a resposta do motor
            if (data.choices && data.choices[0].message.content) {
                const content = data.choices[0].message.content;
                // Se a IA retornar como string JSON, nós parseamos. Se já for objeto, usamos direto.
                res = typeof content === 'string' ? JSON.parse(content.replace(/```json|```/g, "")) : content;
            }

            this.ultimoVeredito = {
                direcao: (res.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(res.confianca || 0),
                motivo: res.motivo || "Aguardando sinal",
                estratégia: res.estratégia || "Sniper Quant"
            };

            this._analisando = false;
            return this.ultimoVeredito;
        } catch (e) {
            this._analisando = false;
            console.error("Erro na Engine Sniper:", e);
            return { direcao: "NEUTRO", confianca: 0, motivo: "Erro de conexão com servidor" };
        }
    }
}
