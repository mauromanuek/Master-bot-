const core = {
    ws: null,
    app_id: '121512',
    ticks: [],
    isAuthorized: false,
    isTrading: false,

    // Inicializa a conexão com o Token do usuário
    init() {
        const token = document.getElementById('api-token').value;
        if(!token) return alert("Por favor, insira o Token!");

        // Abre o WebSocket oficial da Deriv
        this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.app_id}`);

        this.ws.onopen = () => {
            // Solicita autorização
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
            // Subscreve ao Saldo e aos Ticks do ativo Volatility 100 (1s)
            this.ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
            this.ws.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
            ui.addLog("Terminal Conectado e Autorizado!", "success");
        }

        // 2. Atualização de Saldo
        if (data.msg_type === 'balance') {
            document.getElementById('acc-balance').innerText = `$ ${data.balance.balance.toFixed(2)}`;
        }

        // 3. Recebimento de Ticks (Preço em tempo real)
        if (data.msg_type === 'tick') {
            this.processTick(data.tick.quote);
        }

        // 4. Resultado do Contrato (Win/Loss)
        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            if (contract.is_sold) {
                // Envia o resultado para o RiskManager processar lucros/perdas
                if (typeof RiskManager !== 'undefined') {
                    RiskManager.processResult(parseFloat(contract.profit));
                }
            }
        }

        // 5. Tratamento de Erros
        if (data.error) {
            ui.addLog(`Erro API: ${data.error.message}`, "error");
            this.isTrading = false;
        }
    },

    // Processa o preço e chama o cérebro para análise
    processTick(price) {
        this.ticks.push(price);
        if (this.ticks.length > 100) this.ticks.shift();

        // Atualiza preço no Radar
        const priceDisplay = document.getElementById('price-display');
        if(priceDisplay) priceDisplay.innerText = `VOLATILITY 100: ${price.toFixed(2)}`;

        // Só analisa se o Cérebro estiver carregado
        if (typeof Brain !== 'undefined') {
            const analysis = Brain.analyze(this.ticks, ui.currentStrategy);

            // Se o modo RADAR estiver ligado, atualiza a interface
            if (ui.isAnalysisRunning) {
                ui.updateSignal(analysis.action, analysis.strength, analysis.reason);
            }

            // Se o modo BOT estiver ligado e houver sinal forte, executa a ordem
            if (ui.isBotRunning && (analysis.action === 'CALL' || analysis.action === 'PUT')) {
                this.executeTrade(analysis.action, analysis);
            }
        }
    },

    // Envia a ordem de compra/venda para a Deriv
    executeTrade(side, analysis) {
        if (this.isTrading) return; // Impede ordens duplicadas no mesmo tick

        // Verifica Gerenciamento de Risco (Stop Loss / Meta / Pausa)
        if (typeof RiskManager !== 'undefined') {
            if (!RiskManager.canTrade(analysis)) return;

            const settings = RiskManager.getSettings();
            this.isTrading = true;
            ui.addLog(`🚀 Executando ${side} com Stake de $${settings.stake}`, "info");

            this.ws.send(JSON.stringify({
                buy: 1,
                price: settings.stake,
                parameters: {
                    amount: settings.stake,
                    basis: 'stake',
                    contract_type: side,
                    currency: 'USD',
                    duration: 1,
                    duration_unit: 't',
                    symbol: 'R_100'
                },
                subscribe: 1 // Subscreve para receber o resultado win/loss depois
            }));

            // Trava de segurança para não abrir várias ordens em sequência imediata
            setTimeout(() => { this.isTrading = false; }, 3500);
        }
    }
};
