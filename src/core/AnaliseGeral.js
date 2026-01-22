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
            // Mantemos apenas 10 ticks para sentir a velocidade imediata (Scalper puro)
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
            // CORREÇÃO: Garante que o histórico não seja limpo se recebermos pacotes menores da API
            const novasVelas = velas.map(v => formatarVela(v));
            if (this.historicoVelas.length === 0 || novasVelas.length > 1) {
                this.historicoVelas = novasVelas;
            }
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
        // CORREÇÃO: Aumentado para 100 para que indicadores de período longo (como Médias de 20 ou 50 no Python)
        // tenham dados suficientes e não retornem "NEUTRO" por erro de cálculo.
        if (this.historicoVelas.length > 100) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        if (this._analisando) return null;
        
        // AGRESSIVIDADE: Agora ele começa a operar com apenas 10 velas de histórico
        if (this.historicoVelas.length < 10) {
            console.log(`[Scalper] Aquecendo motor: ${this.historicoVelas.length}/10`);
            return { direcao: "NEUTRO", confianca: 0, motivo: "Aquecimento de buffer" };
        }

        if (window.app && app.isTrading) return null;

        this._analisando = true;
        
        const assetBruto = app.currentAsset; 
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        // CÁLCULO DE MOMENTUM LOCAL (Antes de enviar ao Python)
        const v = this.historicoVelas;
        const ultimaVela = v[v.length - 1];
        const penultimaVela = v[v.length - 2];
        const direcaoImediata = ultimaVela.c > penultimaVela.c ? "ALTA" : "BAIXA";

        const payload = {
            asset: assetTecnico,
            // CORREÇÃO: Enviamos 30 velas (em vez de 15) para garantir estabilidade nos indicadores do backend
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
                motivo: res.motivo || "Análise rápida concluída",
                estratégia: "Agressive Scalper V2"
            };

            return this.ultimoVeredito;
        } catch (e) {
            console.warn("[Scalper] Engine falhou, operando em modo offline...");
            return { direcao: "NEUTRO", confianca: 0 };
        } finally {
            // CORREÇÃO: O uso do finally garante que o bot nunca fique travado em "analisando = true"
            // mesmo se a rede falhar, permitindo que a próxima tentativa ocorra.
            this._analisando = false;
        }
    }
}
