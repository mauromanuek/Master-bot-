const core = {
    ws: null,
    app_id: '121512',
    ticks: [],
    isAuthorized: false,
    isTrading: false, // Trava de segurança para impedir ordens duplas

    // Inicializa a conexão com o Token do usuário
    init() {
        const token = document.getElementById('api-token').value;
        if(!token) return alert("Por favor, insira o Token!");

        // Abre o WebSocket oficial da Deriv
        this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.app_id}`);

        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({ authorize: token }));
        };

        this.ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            this.handleResponse(data);
        };

        this.ws.onclose = () => {
            if(typeof ui !== 'undefined') ui.addLog("Conexão encerrada com o servidor.", "error");
        };
    },

    // Trata todas as respostas vindas da Deriv
    handleResponse(data) {
        // 1. Sucesso na Autorização
        if (data.msg_type === 'authorize' && !data.error) {
            this.isAuthorized = true;
            ui.onLoginSuccess();
            // Subscreve ao Saldo e aos Ticks
            this.ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
            this.ws.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
            ui.addLog("Terminal Conectado e Autorizado!", "success");
        }

        // 2. Atualização de Saldo (Sincroniza os dois painéis)
        if (data.msg_type === 'balance') {
            const bal = data.balance.balance.toFixed(2);
            if(document.getElementById('acc-balance')) document.getElementById('acc-balance').innerText = `$ ${bal}`;
            if(document.getElementById('digit-balance-display')) document.getElementById('digit-balance-display').innerText = `$ ${bal}`;
        }

        // 3. Recebimento de Ticks
        if (data.msg_type === 'tick') {
            this.processTick(data.tick.quote);
        }

        // 4. Resultado do Contrato (Win/Loss)
        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            
            if (contract.is_sold) {
                // LIBERA A TRAVA PARA PRÓXIMA OPERAÇÃO
                this.isTrading = false; 

                // Processa lucro/perda e atualiza estatísticas
                if (typeof RiskManager !== 'undefined') {
                    RiskManager.processResult(parseFloat(contract.profit));
                    
                    // Atualiza display de lucro na tela de dígitos
                    const profitEl = document.getElementById('digit-profit-display');
                    if (profitEl) {
                        const sessao = RiskManager.sessionProfit;
                        profitEl.innerText = `$ ${sessao.toFixed(2)}`;
                        profitEl.className = `text-xl font-black leading-tight ${sessao >= 0 ? 'text-green-500' : 'text-red-500'}`;
                    }
                }

                // Adiciona linha na tabela "Trader" se for operação de dígitos
                if (contract.contract_type.includes('DIGIT') && typeof ui !== 'undefined') {
                    ui.addDigitHistoryRow(contract);
                }
            }
        }

        // 5. Tratamento de Erros
        if (data.error) {
            ui.addLog(`Erro API: ${data.error.message}`, "error");
            this.isTrading = false; // Destrava em caso de erro na compra
        }
    },

    // Processa o preço e alimenta o Cérebro (Tendência e Dígitos)
    processTick(price) {
        this.ticks.push(price);
        if (this.ticks.length > 100) this.ticks.shift();

        // Atualiza preço visual no Radar
        const priceDisplay = document.getElementById('price-display');
        if(priceDisplay) priceDisplay.innerText = `VOLATILITY 100: ${price.toFixed(2)}`;

        // --- MOTOR DE ANÁLISE ---
        if (typeof Brain !== 'undefined' && typeof ui !== 'undefined') {
            
            // 1. ANÁLISE DE DÍGITOS (Sempre ativa no fundo para o gráfico)
            const digitData = Brain.analyzeDigits(price);
            ui.updateDigitUI(digitData.last, digitData.stats);

            // Se estiver na aba DÍGITOS e o BOT de DÍGITOS ligado
            if (ui.isDigitBotRunning && digitData.signals.length > 0) {
                // Pega o primeiro sinal da lista (o mais forte)
                this.executeDigitTrade(digitData.signals[0]);
            }

            // 2. ANÁLISE DE TENDÊNCIA (Modos Scalper, Caça Ganho, Profunda)
            const trendAnalysis = Brain.analyze(this.ticks, ui.currentStrategy);

            if (ui.isAnalysisRunning) {
                ui.updateSignal(trendAnalysis.action, trendAnalysis.strength, trendAnalysis.reason);
            }

            if (ui.isBotRunning && (trendAnalysis.action === 'CALL' || trendAnalysis.action === 'PUT')) {
                this.executeTrade(trendAnalysis.action, trendAnalysis);
            }
        }
    },

    // Execução de Ordem para MODOS DE TENDÊNCIA
    executeTrade(side, analysis) {
        if (this.isTrading) return;

        if (typeof RiskManager !== 'undefined') {
            if (!RiskManager.canTrade(analysis)) return;

            // BUSCA A STAKE CALCULADA (Pode ser o valor inicial ou Martingale)
            const tradeStake = RiskManager.getNextStake(side);
            
            this.isTrading = true;
            ui.addLog(`🚀 Enviando ${side} ($${tradeStake})`, "info");

            this.ws.send(JSON.stringify({
                buy: 1,
                price: parseFloat(tradeStake),
                parameters: {
                    amount: parseFloat(tradeStake),
                    basis: 'stake',
                    contract_type: side,
                    currency: 'USD',
                    duration: 1,
                    duration_unit: 't',
                    symbol: 'R_100'
                },
                subscribe: 1
            }));
        }
    },

    // NOVO: Execução de Ordem para MÓDULO DE DÍGITOS
    executeDigitTrade(signal) {
        if (this.isTrading) return;

        // Verifica gerenciamento (Usa confiança do sinal como força de análise)
        if (typeof RiskManager !== 'undefined') {
            if (!RiskManager.canTrade({ strength: signal.conf })) return;

            // BUSCA A STAKE CALCULADA (Martingale específico para dígitos)
            const tradeStake = RiskManager.getNextStake(signal.type);
            
            this.isTrading = true;
            ui.addLog(`🎲 ${signal.name} [$${tradeStake}]`, "info");

            // Define os parâmetros baseados na estratégia de dígito
            let params = {
                amount: parseFloat(tradeStake),
                basis: 'stake',
                contract_type: signal.type,
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: 'R_100'
            };

            // Adiciona Barreira (ex: Under 7 precisa de barrier "7")
            if (signal.barrier !== undefined) {
                params.barrier = signal.barrier.toString();
            }

            this.ws.send(JSON.stringify({
                buy: 1,
                price: parseFloat(tradeStake),
                parameters: params,
                subscribe: 1
            }));
        }
    }
};
