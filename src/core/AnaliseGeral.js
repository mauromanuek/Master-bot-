class AnaliseGeral {
    constructor(backendUrl, modo = "principal") {
        this.backendUrl = backendUrl;
        this.modo = modo; // "principal" ou "radar"
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
            "VOLATILITY 10 (1S)": "1Z10",
            "VOLATILITY 15 (1S)": "1HZ15V",
            "VOLATILITY 100 (1S)": "1HZ100V",
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
        this.ultimoVeredito = { direcao: "NEUTRO", confianca: 0 };
    }

    adicionarDados(velas, tickBruto = null) {
        if (tickBruto !== null) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 10) this.ultimosTicks.shift();
        }

        const formatarVela = (v) => ({
            o: parseFloat(v.open || v.o),
            h: parseFloat(v.high || v.h),
            l: parseFloat(v.low || v.l),
            c: parseFloat(v.close || v.c),
            e: parseInt(v.epoch || v.e)
        });

        if (Array.isArray(velas)) {
            // No modo RADAR, sempre substituímos o histórico pelo novo pacote isolado
            const novasVelas = velas.map(v => formatarVela(v));
            if (this.modo === "radar" || this.historicoVelas.length === 0 || novasVelas.length >= this.historicoVelas.length) {
                this.historicoVelas = novasVelas;
            }
        } else if (velas && typeof velas === 'object') {
            const nova = formatarVela(velas);
            
            if (this.historicoVelas.length > 0) {
                const ultima = this.historicoVelas[this.historicoVelas.length - 1];
                if (nova.e > ultima.e) {
                    this.historicoVelas.push(nova);
                } else if (nova.e === ultima.e) {
                    this.historicoVelas[this.historicoVelas.length - 1] = nova;
                }
            } else {
                this.historicoVelas.push(nova);
            }
        }

        if (this.historicoVelas.length > 100) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        if (this._analisando) return this.ultimoVeredito;
        
        const totalVelas = this.historicoVelas.length;
        if (totalVelas < 10) {
            return { direcao: "NEUTRO", confianca: 0, motivo: "Buffer insuficiente" };
        }

        // Só bloqueia por trading se for o analista principal
        if (this.modo === "principal" && window.app && app.isTrading) return this.ultimoVeredito;

        this._analisando = true;
        
        const assetBruto = window.app ? app.currentAsset : "R_100"; 
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        const payload = {
            asset: assetTecnico,
            contexto_velas: this.historicoVelas.slice(-30),
            dados_ticks: this.ultimosTicks, 
            config: { 
                sniper_mode: true, 
                agressividade: "high", 
                min_confidence: 65     
            }
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
            
            if (data.choices && data.choices[0].message.content) {
                const content = data.choices[0].message.content;
                res = typeof content === 'string' ? JSON.parse(content.replace(/```json|```/g, "")) : content;
            }

            this.ultimoVeredito = {
                direcao: (res.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(res.confianca || 0),
                motivo: res.motivo || "Análise concluída",
                estratégia: this.modo === "radar" ? "Radar Hunter V1" : "Agressive Scalper V2.5"
            };

            return this.ultimoVeredito;
        } catch (e) {
            return { direcao: "NEUTRO", confianca: 0, motivo: "Erro de conexão" };
        } finally {
            this._analisando = false;
        }
    }
}
