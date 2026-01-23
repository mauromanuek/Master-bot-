class AnaliseGeral {
    constructor(backendUrl, modo = "principal") {
        this.backendUrl = backendUrl;
        this.modo = modo; 
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
            const tickFloat = parseFloat(tickBruto);
            if (!isNaN(tickFloat)) {
                this.ultimosTicks.push(tickFloat);
            }
            if (this.ultimosTicks.length > 10) this.ultimosTicks.shift();
        }

        const formatarVela = (v) => {
            const o = parseFloat(v.open || v.o);
            const h = parseFloat(v.high || v.h);
            const l = parseFloat(v.low || v.l);
            const c = parseFloat(v.close || v.c);
            const e = parseInt(v.epoch || v.e);
            if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c) || isNaN(e)) return null;
            return { o, h, l, c, e };
        };

        if (Array.isArray(velas)) {
            const novasVelas = velas.map(v => formatarVela(v)).filter(v => v !== null);
            if (this.modo === "radar" || this.historicoVelas.length === 0 || novasVelas.length >= this.historicoVelas.length) {
                this.historicoVelas = novasVelas;
            }
        } else if (velas && typeof velas === 'object') {
            const nova = formatarVela(velas);
            if (!nova) return;
            
            if (this.historicoVelas.length > 0) {
                const indexExistente = this.historicoVelas.findIndex(v => v.e === nova.e);
                if (indexExistente !== -1) {
                    this.historicoVelas[indexExistente] = nova;
                } else {
                    const ultimaVela = this.historicoVelas[this.historicoVelas.length - 1];
                    if (nova.e > ultimaVela.e) {
                        this.historicoVelas.push(nova);
                    }
                }
            } else {
                this.historicoVelas.push(nova);
            }
        }

        if (this.historicoVelas.length > 20) {
            this.historicoVelas.shift();
        }
    }

    async obterVereditoCompleto() {
        if (this._analisando) return this.ultimoVeredito;
        
        const totalVelas = this.historicoVelas.length;
        
        // CORREÇÃO: Removemos a mensagem de contagem para o usuário não ver
        if (totalVelas < 8) {
            return { 
                direcao: "SINC", // Status interno de sincronismo
                confianca: 0, 
                motivo: "Otimizando Engine..." 
            };
        }

        if (this.modo === "principal" && window.app && app.isTrading) {
            return { ...this.ultimoVeredito, motivo: "Operação em curso..." };
        }

        this._analisando = true;
        
        const assetBruto = (window.app && app.currentAsset) ? app.currentAsset : "R_100"; 
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        const payload = {
            asset: assetTecnico,
            contexto_velas: this.historicoVelas.slice(-12), 
            dados_ticks: this.ultimosTicks, 
            config: { sniper_mode: true, agressividade: "high", min_confidence: 65 }
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();
            let res = data;
            
            if (data.choices && data.choices[0] && data.choices[0].message.content) {
                const content = data.choices[0].message.content;
                res = typeof content === 'string' ? JSON.parse(content.replace(/```json|```/g, "")) : content;
            }

            this.ultimoVeredito = {
                direcao: (res.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(res.confianca || 0),
                motivo: res.motivo || "Monitorando mercado",
                estratégia: this.modo === "radar" ? "Radar Hunter" : "Scalper Sniper V2.5"
            };

            return this.ultimoVeredito;
        } catch (e) {
            return { direcao: "NEUTRO", confianca: 0, motivo: "Reconectando..." };
        } finally {
            this._analisando = false;
        }
    }
}
