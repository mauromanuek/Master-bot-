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
        // Reduzido para 50 para liberar memória e acelerar o processamento
        if (this.historicoVelas.length > 50) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        if (this._analisando) return null;
        
        // AGRESSIVIDADE: Agora ele começa a operar com apenas 10 velas de histórico
        if (this.historicoVelas.length < 10) {
            console.log(`[Scalper] Aquecendo motor: ${this.historicoVelas.length}/10`);
            return null;
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
            // Enviamos apenas 15 velas para o Python focar no AGORA
            contexto_velas: this.historicoVelas.slice(-15),
            dados_ticks: this.ultimosTicks, // Ticks para sentir a força do "vapt-vupt"
            config: { 
                sniper_mode: true, 
                agressividade: "high", // Flag para o Python mudar a estratégia
                min_confidence: 65     // Reduzido para entrar em mais operações
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

            this._analisando = false;
            return this.ultimoVeredito;
        } catch (e) {
            this._analisando = false;
            console.warn("[Scalper] Engine falhou, operando em modo offline...");
            return { direcao: "NEUTRO", confianca: 0 };
        }
    }
}
