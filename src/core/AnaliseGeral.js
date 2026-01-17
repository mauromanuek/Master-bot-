class AnaliseGeral {
    constructor(backendUrl) {
        // Define a rota do backend atualizada para a Vercel
        this.backendUrl = backendUrl || "https://master-bot-beta.vercel.app/analisar";
        this.historicoVelas = [];
    }

    /**
     * Limpa o histórico de velas para evitar contaminação de dados
     * entre ativos diferentes (Resolve Problema 1: Ativo Preso)
     */
    limparHistorico() {
        this.historicoVelas = [];
    }

    adicionarDados(velas) {
        // Garante que as velas recebidas da Deriv API sejam armazenadas corretamente
        // Se receber um array (histórico inicial), substitui; se receber um objeto único (tick/ohlc), adiciona ao array
        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => ({
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                epoch: v.epoch
            }));
        } else if (velas && typeof velas === 'object') {
            const novaVela = {
                open: parseFloat(velas.open),
                high: parseFloat(velas.high),
                low: parseFloat(velas.low),
                close: parseFloat(velas.close),
                epoch: velas.epoch
            };
            
            // Evita duplicatas pelo timestamp (epoch)
            if (this.historicoVelas.length === 0 || this.historicoVelas[this.historicoVelas.length - 1].epoch !== novaVela.epoch) {
                this.historicoVelas.push(novaVela);
            } else {
                // Se for o mesmo epoch, apenas atualiza a vela atual (formato OHLC da Deriv)
                this.historicoVelas[this.historicoVelas.length - 1] = novaVela;
            }
        }
        
        // Mantém apenas as últimas 100 velas para não sobrecarregar a memória
        if (this.historicoVelas.length > 100) {
            this.historicoVelas = this.historicoVelas.slice(-100);
        }
    }

    calcularIndicadoresLocais() {
        // Precisamos de pelo menos 14 velas para uma análise de RSI e tendência confiável
        if (!this.historicoVelas || this.historicoVelas.length < 14) {
            return { tendenciaDow: "NEUTRA", isMartelo: false, rsi: 50 };
        }

        const v = this.historicoVelas;
        const atual = v[v.length - 1];
        const anterior = v[v.length - 2];

        // 1. Teoria de Dow (Direção imediata do preço)
        const tendenciaDow = atual.close > anterior.close ? "ALTA" : "BAIXA";

        // 2. Price Action: Padrão Martelo (Reversão de Fundo)
        // Corrigido para identificar rejeição real de preço na sombra inferior
        const corpo = Math.abs(atual.open - atual.close);
        const precoMinimoCorpo = Math.min(atual.open, atual.close);
        const sombraInferior = precoMinimoCorpo - atual.low;
        
        // Um martelo clássico tem a sombra inferior pelo menos 2x maior que o corpo
        const isMartelo = sombraInferior > (corpo * 2) && corpo > 0;

        // 3. RSI Real (Relative Strength Index) - Período 14
        let ganhos = 0;
        let perdas = 0;
        
        for (let i = v.length - 14; i < v.length; i++) {
            if (!v[i-1]) continue;
            const diferenca = v[i].close - v[i-1].close;
            if (diferenca >= 0) ganhos += diferenca;
            else perdas += Math.abs(diferenca);
        }
        
        const rsi = perdas === 0 ? 100 : 100 - (100 / (1 + (ganhos / perdas)));

        return { 
            tendenciaDow, 
            isMartelo, 
            rsi: Math.round(rsi),
            volume_check: atual.high !== atual.low // Verifica se há volatilidade
        };
    }

    async obterVereditoCompleto() {
        const indicadores = this.calcularIndicadoresLocais();
        const assetName = document.getElementById('current-asset-name')?.innerText || "Ativo Desconhecido";
        
        // Prepara o conjunto de dados OHLC para o Llama 3.3
        // Enviar os últimos 20 candles para análise de momentum
        const priceActionData = this.historicoVelas.slice(-20).map(v => ({
            o: v.open,
            h: v.high,
            l: v.low,
            c: v.close
        }));

        const payload = {
            contexto: `Análise Profissional para Scalping - Ativo: ${assetName}`,
            asset: assetName, // Envio explícito do ativo para evitar Problema 1
            indicadores: {
                tendencia: indicadores.tendenciaDow,
                padrao_reversao: indicadores.isMartelo ? "MARTELO DETECTADO" : "NENHUM",
                rsi_valor: indicadores.rsi,
                ohlc_history: priceActionData
            }
        };

        return await this.chamarGroq(payload);
    }

    async chamarGroq(payload) {
        try {
            // Verifica se há dados antes de enviar para evitar resposta "NEUTRO" por falta de informação
            if (!payload.indicadores.ohlc_history || payload.indicadores.ohlc_history.length < 5) {
                throw new Error("Dados insuficientes para análise");
            }

            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || "Falha no Servidor Vercel");
            }

            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const content = data.choices[0].message.content;
                const veredito = JSON.parse(content);
                
                // Validação de segurança do JSON retornado pela IA
                if (!veredito.direcao || veredito.confianca === undefined) {
                    throw new Error("IA retornou dados incompletos");
                }
                
                return veredito;
            } else {
                throw new Error("Resposta da IA fora do padrão");
            }

        } catch (e) {
            console.warn("IA indisponível ou dados incompletos, usando lógica técnica local...", e.message);
            
            // FALLBACK: Se a Vercel/IA falhar ou houver erro de parsing, o bot usa análise técnica pura
            const ind = this.calcularIndicadoresLocais();
            let direcao = "NEUTRO";
            
            // Lógica Oportunista Híbrida de Fallback (Resolve Problema 4)
            if (ind.rsi < 30 || ind.isMartelo) direcao = "CALL";
            else if (ind.rsi > 70) direcao = "PUT";

            return {
                direcao: direcao,
                confianca: 50,
                motivo: "Baseado em RSI e Price Action Local (Modo de Segurança)"
            };
        }
    }
}
