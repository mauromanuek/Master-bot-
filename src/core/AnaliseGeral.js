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
            const tickFloat = parseFloat(tickBruto);
            if (!isNaN(tickFloat)) {
                this.ultimosTicks.push(tickFloat);
            }
            // Mantém apenas os últimos 10 ticks para análise de micro-momentum
            if (this.ultimosTicks.length > 10) this.ultimosTicks.shift();
        }

        const formatarVela = (v) => {
            const o = parseFloat(v.open || v.o);
            const h = parseFloat(v.high || v.h);
            const l = parseFloat(v.low || v.l);
            const c = parseFloat(v.close || v.c);
            const e = parseInt(v.epoch || v.e);
            
            // Validação rigorosa: Não adiciona velas com dados corrompidos (NaN)
            if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c) || isNaN(e)) return null;
            
            return { o, h, l, c, e };
        };

        if (Array.isArray(velas)) {
            // No modo RADAR ou carga inicial, preenchemos o buffer filtrando nulos
            const novasVelas = velas.map(v => formatarVela(v)).filter(v => v !== null);
            if (this.modo === "radar" || this.historicoVelas.length === 0 || novasVelas.length >= this.historicoVelas.length) {
                this.historicoVelas = novasVelas;
            }
        } else if (velas && typeof velas === 'object') {
            const nova = formatarVela(velas);
            if (!nova) return; // Aborta se a vela formatada for inválida
            
            if (this.historicoVelas.length > 0) {
                const indexExistente = this.historicoVelas.findIndex(v => v.e === nova.e);
                
                if (indexExistente !== -1) {
                    // Atualização da vela atual (OHLC Stream)
                    this.historicoVelas[indexExistente] = nova;
                } else {
                    // Verificação cronológica para evitar dados out-of-order
                    const ultimaVela = this.historicoVelas[this.historicoVelas.length - 1];
                    if (nova.e > ultimaVela.e) {
                        this.historicoVelas.push(nova);
                    }
                }
            } else {
                this.historicoVelas.push(nova);
            }
        }

        // SNIPER MODE: Mantemos um buffer saudável de 20 velas para garantir os cálculos da EMA
        if (this.historicoVelas.length > 20) {
            this.historicoVelas.shift();
        }
    }

    /**
     * Envia os dados para o Backend Python e retorna a decisão da IA
     */
    async obterVereditoCompleto() {
        // CORREÇÃO: Se estiver analisando, aguarda a promessa anterior em vez de apenas retornar o último
        if (this._analisando) return this.ultimoVeredito;
        
        const totalVelas = this.historicoVelas.length;
        
        // GATILHO SNIPER: Verificação mínima de buffer
        if (totalVelas < 8) {
            return { 
                direcao: "NEUTRO", 
                confianca: 0, 
                motivo: `Sincronizando: ${totalVelas}/8 velas` 
            };
        }

        // Bloqueio de segurança se já houver uma operação em curso
        if (this.modo === "principal" && window.app && app.isTrading) {
            // Retorna um estado informativo em vez de neutro seco
            return { ...this.ultimoVeredito, motivo: "Monitorando contrato ativo..." };
        }

        this._analisando = true;
        
        // Identificação do ativo atual de forma segura
        const assetBruto = (window.app && app.currentAsset) ? app.currentAsset : "R_100"; 
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;

        // PAYLOAD OTIMIZADO: Enviamos 12 velas para o backend ter margem de cálculo para EMA 3/5
        const payload = {
            asset: assetTecnico,
            contexto_velas: this.historicoVelas.slice(-12), 
            dados_ticks: this.ultimosTicks, 
            config: { 
                sniper_mode: true, 
                agressividade: "high", 
                min_confidence: 65     
            }
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // Timeout de 8s para não travar o bot

            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();
            let res = data;
            
            // Parser robusto para o formato de resposta
            if (data.choices && data.choices[0] && data.choices[0].message.content) {
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
            console.error("Erro na comunicação com a Engine Sniper:", e);
            // Se houver erro, retornamos NEUTRO mas não resetamos a confiança anterior se ela for alta
            return { 
                direcao: "NEUTRO", 
                confianca: 0, 
                motivo: e.name === 'AbortError' ? "Tempo de resposta excedido" : "Erro de conexão" 
            };
        } finally {
            this._analisando = false;
        }
    }
}
