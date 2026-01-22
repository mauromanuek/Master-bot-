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

    /**
     * Reseta o estado do analista para trocar de ativo ou reiniciar o bot
     */
    limparHistorico() {
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
        this.ultimoVeredito = { direcao: "NEUTRO", confianca: 0 };
    }

    /**
     * Processa e armazena os dados recebidos da API (Stream ou Histórico)
     */
    adicionarDados(velas, tickBruto = null) {
        if (tickBruto !== null) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            // Mantém apenas os últimos 10 ticks para análise de micro-momentum
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
            // No modo RADAR ou carga inicial, substituímos/preenchemos o buffer
            const novasVelas = velas.map(v => formatarVela(v));
            if (this.modo === "radar" || this.historicoVelas.length === 0 || novasVelas.length >= this.historicoVelas.length) {
                this.historicoVelas = novasVelas;
            }
        } else if (velas && typeof velas === 'object') {
            const nova = formatarVela(velas);
            
            if (this.historicoVelas.length > 0) {
                const ultima = this.historicoVelas[this.historicoVelas.length - 1];
                if (nova.e > ultima.e) {
                    // Novo candle fechado ou novo período
                    this.historicoVelas.push(nova);
                } else if (nova.e === ultima.e) {
                    // Atualização do candle atual (real-time tick)
                    this.historicoVelas[this.historicoVelas.length - 1] = nova;
                }
            } else {
                this.historicoVelas.push(nova);
            }
        }

        // SNIPER MODE: Não precisamos de 100 velas. 
        // Mantemos 20 para ter margem de cálculo, mas enviaremos apenas 10.
        if (this.historicoVelas.length > 20) {
            this.historicoVelas.shift();
        }
    }

    /**
     * Envia os dados para o Backend Python e retorna a decisão da IA
     */
    async obterVereditoCompleto() {
        if (this._analisando) return this.ultimoVeredito;
        
        const totalVelas = this.historicoVelas.length;
        
        // GATILHO SNIPER: Liberamos a análise a partir de 8 velas para máxima velocidade
        if (totalVelas < 8) {
            return { 
                direcao: "NEUTRO", 
                confianca: 0, 
                motivo: `Sincronizando: ${totalVelas}/8 velas` 
            };
        }

        // Bloqueio de segurança se já houver uma operação em curso no app
        if (this.modo === "principal" && window.app && app.isTrading) {
            return this.ultimoVeredito;
        }

        this._analisando = true;
        
        // Identificação do ativo atual
        const assetBruto = window.app ? app.currentAsset : "R_100"; 
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        // PAYLOAD OTIMIZADO: Enviamos apenas o necessário para evitar erro 100/10
        const payload = {
            asset: assetTecnico,
            contexto_velas: this.historicoVelas.slice(-10), // Apenas as últimas 10 velas
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
                headers: { 
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();
            let res = data;
            
            // Parser para o formato OpenAI/JSON aninhado se necessário
            if (data.choices && data.choices[0].message.content) {
                const content = data.choices[0].message.content;
                res = typeof content === 'string' ? JSON.parse(content.replace(/```json|```/g, "")) : content;
            }

            this.ultimoVeredito = {
                direcao: (res.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(res.confianca || 0),
                motivo: res.motivo || "Análise concluída",
                estratégia: this.modo === "radar" ? "Radar Hunter Sniper" : "Scalper Sniper V2.5"
            };

            return this.ultimoVeredito;
        } catch (e) {
            console.error("Erro na comunicação com a Engine:", e);
            return { 
                direcao: "NEUTRO", 
                confianca: 0, 
                motivo: "Erro de conexão com o servidor" 
            };
        } finally {
            this._analisando = false;
        }
    }
}
