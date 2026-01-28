const core = {
    ws: null,
    app_id: '121512',
    ticks: [],
    isAuthorized: false,
    isTrading: false, // Trava de segurança para ordem única

    // Inicializa a conexão com o Token do usuário
    init() {
        const token = document.getElementById('api-token').value;
        if(!token) return alert("Por favor, insira o Token!");

        // Abre o WebSocket oficial da Deriv com seu App ID 121512
        this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.app_id}`);

        this.ws.onopen = () => {
            // Solicita autorização ao servidor
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

        // 2. Atualização de Saldo em tempo real
        if (data.msg_type === 'balance') {
            const balanceElement = document.getElementById('acc-balance');
            if(balanceElement) balanceElement.innerText = `$ ${data.balance.balance.toFixed(2)}`;
        }

        // 3. Recebimento de Ticks (Preço em tempo real)
        if (data.msg_type === 'tick') {
            this.processTick(data.tick.quote);
        }

        // 4. Resultado do Contrato (Win/Loss) - Sincronização Real
        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            
            // Verifica se o contrato foi finalizado no servidor
            if (contract.is_sold) {
                // LIBERA A TRAVA: Agora o robô pode procurar uma nova entrada
                this.isTrading = false; 

                // Envia o resultado para o RiskManager processar e atualizar placar
                if (typeof RiskManager !== 'undefined') {
                    RiskManager.processResult(parseFloat(contract.profit));
                }
            }
        }

        // 5. Tratamento de Erros da API
        if (data.error) {
            ui.addLog(`Erro API: ${data.error.message}`, "error");
            // Se houver erro na compra, libera a trava para tentar novamente no próximo sinal
            if (data.msg_type === 'buy') {
                this.isTrading = false;
            }
        }
    },

    // Processa o preço e chama o cérebro para análise técnica
    processTick(price) {
        this.ticks.push(price);
        if (this.ticks.length > 100) this.ticks.shift();

        // Atualiza preço visual no Radar
        const priceDisplay = document.getElementById('price-display');
        if(priceDisplay) priceDisplay.innerText = `VOLATILITY 100: ${price.toFixed(2)}`;

        // Só inicia análise se o Cérebro (brain.js) estiver carregado
        if (typeof Brain !== 'undefined') {
            const analysis = Brain.analyze(this.ticks, ui.currentStrategy);

            // Se o modo RADAR estiver ligado na interface, atualiza o sinal visual
            if (ui.isAnalysisRunning) {
                ui.updateSignal(analysis.action, analysis.strength, analysis.reason);
            }

            // Se o modo BOT estiver ligado e o cérebro enviar CALL ou PUT forte
            if (ui.isBotRunning && (analysis.action === 'CALL' || analysis.action === 'PUT')) {
                this.executeTrade(analysis.action, analysis);
            }
        }
    },

    // Envia a ordem oficial de compra/venda para o servidor da Deriv
    executeTrade(side, analysis) {
        // TRAVA DE ORDEM ÚNICA: Impede que o bot abra 2 contratos ao mesmo tempo
        if (this.isTrading) return; 

        // Verifica Gerenciamento de Risco (Stop Loss / Meta / Pausa por Loss)
        if (typeof RiskManager !== 'undefined') {
            if (!RiskManager.canTrade(analysis)) return;

            const settings = RiskManager.getSettings();
            
            // Ativa o bloqueio de novas operações até que esta seja concluída
            this.isTrading = true; 
            
            ui.addLog(`🚀 Enviando ${side} com Stake de $${settings.stake}`, "info");

            this.ws.send(JSON.stringify({
                buy: 1,
                price: parseFloat(settings.stake),
                parameters: {
                    amount: parseFloat(settings.stake),
                    basis: 'stake',
                    contract_type: side,
                    currency: 'USD',
                    duration: 1,
                    duration_unit: 't',
                    symbol: 'R_100'
                },
                subscribe: 1 // Crucial: Subscreve para receber o fechamento do contrato automaticamente
            }));
        }
    }
};
