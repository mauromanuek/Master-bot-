class AnaliseGeral {
    constructor(backendUrl) {
        this.backendUrl = backendUrl;
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
        this.ultimoVeredito = { direcao: "NEUTRO", confianca: 0 };
        
        this.mapaSimbolos = {
            "VOLATILITY 10 INDEX": "R_10",
            "VOLATILITY 25 INDEX": "R_25",
            "VOLATILITY 50 INDEX": "R_50",
            "VOLATILITY 75 INDEX": "R_75",
            "VOLATILITY 100 INDEX": "R_100",
            "BOOM 300 INDEX": "B_300",
            "CRASH 300 INDEX": "C_300",
            "BOOM 500 INDEX": "B_500",
            "CRASH 500 INDEX": "C_500",
            "STEP INDEX": "STPINDEX"
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

        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                o: parseFloat(v.open || v.o),
                h: parseFloat(v.high || v.h),
                l: parseFloat(v.low || v.l),
                c: parseFloat(v.close || v.c),
                e: parseInt(v.epoch || v.e)
            }));
        } else if (velas && typeof velas === 'object') {
            const nova = {
                o: parseFloat(velas.open || velas.o),
                h: parseFloat(velas.high || velas.h),
                l: parseFloat(velas.low || velas.l),
                c: parseFloat(velas.close || velas.c),
                e: parseInt(velas.epoch || velas.e)
            };
            
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
        if (this._analisando || this.historicoVelas.length < 30) return null;

        this._analisando = true;
        const assetBruto = app.currentAsset;
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        // MISSÃO 2-A: Enviando contexto estrutural
        const payload = {
            asset: assetTecnico,
            contexto_velas: this.historicoVelas.slice(-60), // Última hora em M1
            config: { sniper_mode: true, min_confidence: 70 }
        };

        try {
            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            let res = data;
            
            // Unboxing da resposta se vier encapsulada (compatibilidade)
            if (data.choices) {
                res = JSON.parse(data.choices[0].message.content.replace(/```json|```/g, ""));
            }

            this.ultimoVeredito = {
                direcao: (res.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(res.confianca || 0),
                motivo: res.motivo || "",
                estratégia: res.estratégia || "Sniper"
            };

            this._analisando = false;
            return this.ultimoVeredito;
        } catch (e) {
            this._analisando = false;
            console.error("Erro na Engine:", e);
            return null;
        }
    }
}
