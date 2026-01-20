class AnaliseGeral {
    constructor(backendUrl) {
        // Link oficial para o seu servidor no Render com o endpoint /analisar
        this.backendUrl = backendUrl || "https://master-bot-hpt5.onrender.com/analisar"; 
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;

        // MAPA DE TRADUÇÃO PARA SÍMBOLOS TÉCNICOS DA DERIV (Essencial para casar com a Engine)
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

    /**
     * Reseta os buffers de dados para evitar contaminação entre ativos
     */
    limparHistorico() {
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
        console.log("[Sniper Engine] Memória limpa para novo ciclo.");
    }

    /**
     * Processa a entrada de dados tanto de histórico (Array) quanto de fluxo (Objeto/Tick)
     */
    adicionarDados(velas, tickBruto = null) {
        // Processamento de Ticks para análise de micro-tendência
        if (tickBruto !== null) {
            this.ultimosTicks.push(parseFloat(tickBruto));
            if (this.ultimosTicks.length > 20) this.ultimosTicks.shift();
        }

        // Caso receba um Array (Histórico inicial de subscrição)
        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                open: parseFloat(v.open || v.o || 0),
                high: parseFloat(v.high || v.h || 0),
                low: parseFloat(v.low || v.l || 0),
                close: parseFloat(v.close || v.c || 0),
                epoch: parseInt(v.epoch || v.e || 0)
            })).filter(v => v.epoch > 0);
        } 
        // Caso receba uma única vela (Atualização OHLC em tempo real)
        else if (velas && typeof velas === 'object') {
            const nova = {
                open: parseFloat(velas.open || velas.o || 0),
                high: parseFloat(velas.high || velas.h || 0),
                low: parseFloat(velas.low || velas.l || 0),
                close: parseFloat(velas.close || velas.c || 0),
                epoch: parseInt(velas.epoch || velas.e || 0)
            };
            
            if (nova.epoch > 0) {
                if (this.historicoVelas.length > 0) {
                    const ultima = this.historicoVelas[this.historicoVelas.length - 1];
                    if (nova.epoch > ultima.epoch) {
                        this.historicoVelas.push(nova);
                    } else if (nova.epoch === ultima.epoch) {
                        // Atualiza a vela atual (OHLC ainda variando)
                        this.historicoVelas[this.historicoVelas.length - 1] = nova;
                    }
                } else {
                    this.historicoVelas.push(nova);
                }
            }
        }
        
        // Mantém buffer de 100 velas para análise técnica robusta
        if (this.historicoVelas.length > 100) this.historicoVelas.shift();
    }

    /**
     * Orquestra a chamada para a IA após validar o volume de dados
     */
    async obterVereditoCompleto() {
        // Validação: A Engine Sniper requer volume de dados para calcular Médias e RSI
        if (this._analisando) return null;
        
        if (this.historicoVelas.length < 30) {
            console.warn(`[Sniper Engine] Dados insuficientes: ${this.historicoVelas.length}/30`);
            return null;
        }

        const assetBruto = window.app ? app.currentAsset : "R_100";
        const assetTecnico = this.mapaSimbolos[assetBruto.toUpperCase()] || assetBruto;
        
        const payload = {
            asset: assetTecnico,
            fluxo_ticks: this.ultimosTicks,
            contexto_velas: this.historicoVelas.slice(-50), // Enviamos as últimas 50 para o backend
            indicadores: this.calcularIndicadoresLocais()
        };

        this._analisando = true;
        try {
            const veredito = await this.chamarEngineSniper(payload);
            this._analisando = false;
            return veredito;
        } catch (e) {
            console.error("[Sniper Engine] Falha no processamento:", e);
            this._analisando = false;
            throw e;
        }
    }

    /**
     * Cálculos matemáticos básicos para auxiliar a IA no Backend
     */
    calcularIndicadoresLocais() {
        if (this.historicoVelas.length < 14) return {};
        const fechamentos = this.historicoVelas.map(v => v.close);
        const atual = fechamentos[fechamentos.length - 1];
        const anterior = fechamentos[fechamentos.length - 2];
        
        return {
            ultimo_fechamento: atual,
            variacao_imediata: atual - anterior,
            tendencia_curta: atual > fechamentos[fechamentos.length - 10] ? "ALTA" : "BAIXA"
        };
    }

    /**
     * Comunicação direta com o servidor Python no Render
     */
    async chamarEngineSniper(payload) {
        const controller = new AbortController();
        // 20 segundos de timeout para compensar o 'Cold Start' do Render Free
        const timeoutId = setTimeout(() => controller.abort(), 20000); 

        try {
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
            
            let parsedContent;
            // Desempacota o formato da OpenAI vindo do servidor Python
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const content = data.choices[0].message.content;
                try {
                    // Tenta limpar possíveis marcações de Markdown (```json) se houver
                    const jsonLimpo = content.replace(/```json|```/g, "").trim();
                    parsedContent = JSON.parse(jsonLimpo);
                } catch (jsonErr) {
                    console.error("Erro ao converter resposta da IA em JSON:", content);
                    throw new Error("Resposta da Engine em formato inválido");
                }
            } else {
                parsedContent = data; 
            }
            
            return {
                direcao: (parsedContent.direcao || "NEUTRO").toUpperCase(),
                confianca: parseInt(parsedContent.confianca || 0),
                estratégia: parsedContent.estratégia || "Sniper Quant v1",
                motivo: parsedContent.motivo || "Análise de padrões estruturais finalizada.",
                asset: payload.asset
            };
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                console.warn("[Sniper Engine] Timeout: Servidor demorou demais para responder.");
            }
            throw e;
        }
    }
}
