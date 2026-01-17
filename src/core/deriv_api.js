const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,

    /**
     * Inicializa a conexão e configura os listeners globais
     */
    connect(token, callback) {
        if (this.socket) this.socket.close();
        
        // Conexão via WebSocket Seguro (WSS) com App ID oficial
        this.socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=121512');

        this.socket.onopen = () => {
            this.log("Conectado ao servidor Deriv. Autorizando...");
            this.socket.send(JSON.stringify({ authorize: token }));
        };

        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            
            // Tratamento de Erros Globais
            if (data.error) {
                if (data.error.code === 'AlreadySubscribed') return; 
                if (callback) callback(data);
                return;
            }

            // Sucesso na Autorização: Inicia fluxos de saldo e contratos
            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                this.socket.send(JSON.stringify({ 
                    proposal_open_contract: 1, 
                    subscribe: 1 
                }));
            }

            this.handleResponses(data);
            if (callback) callback(data);
        };

        this.socket.onerror = (err) => {
            if (callback) callback({ error: { message: "Erro de conexão com servidor" } });
        };
    },

    /**
     * Gerencia a troca de ativo limpando subscrições anteriores (Resoluçao Problema 1)
     */
    changeSymbol(newSymbol) {
        if (!newSymbol || this.currentSymbol === newSymbol) return;
        
        // 1. Esquece subscrição de velas atual
        if (this.candleSubscriptionId) {
            this.socket.send(JSON.stringify({ forget: this.candleSubscriptionId }));
            this.candleSubscriptionId = null;
        }

        // 2. Comando FORGET_ALL para limpar qualquer resíduo de streaming (Dígitos/Ticks)
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc", "ticks"] }));
        
        this.currentSymbol = newSymbol;
        
        // 3. Limpeza de Memória no Frontend
        if (window.app) {
            if (app.analista) app.analista.limparHistorico();
            app.currentAsset = newSymbol; 
        }

        // 4. Reinicia subscrições para o novo ativo
        this.subscribeCandles(this.callbacks['candles']);
        
        // 5. Se o módulo de dígitos estiver ativo, reinicia a subscrição de ticks
        if (window.DigitModule && DigitModule.isAnalysisRunning) {
            this.socket.send(JSON.stringify({ ticks: this.currentSymbol, subscribe: 1 }));
        }
    },

    /**
     * Subscreve ao histórico de velas (OHLC)
     */
    subscribeCandles(callback) {
        if (!this.isAuthorized || !this.currentSymbol) return;
        
        this.callbacks['candles'] = callback;
        
        this.socket.send(JSON.stringify({
            ticks_history: this.currentSymbol,
            adjust_start_time: 1,
            count: 50,
            end: "latest",
            granularity: 60,
            style: "candles",
            subscribe: 1
        }));
    },

    /**
     * Executa ordens de compra/venda
     */
    buy(type, stake, prefix, callback, extraParams = {}) {
        if (!this.isAuthorized) return;

        this.callbacks['buy'] = callback;
        this._pendingPrefix = prefix || 'm';

        // Lógica de tempo de expiração baseada no tipo de ativo
        const isFastAsset = this.currentSymbol.includes('1Z') || this.currentSymbol.includes('1HZ');
        
        const request = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: type,
                currency: 'USD',
                duration: isFastAsset ? 5 : 1,
                duration_unit: isFastAsset ? 't' : 'm', 
                symbol: this.currentSymbol,
                ...extraParams
            }
        };

        this.socket.send(JSON.stringify(request));
    },

    /**
     * Distribuidor central de mensagens do Socket
     */
    handleResponses(data) {
        // Atualiza ID de subscrição para controle de limpeza
        if (data.msg_type === 'candles' && data.subscription) {
            this.candleSubscriptionId = data.subscription.id;
        }

        // --- CANAL 1: Histórico Inicial (Array) ---
        if (data.msg_type === 'candles' && this.callbacks['candles']) {
            this.callbacks['candles'](data.candles);
        } 
        
        // --- CANAL 2: Vela em Formação (OHLC) ---
        else if (data.msg_type === 'ohlc') {
            // Filtro de Ativo Seguro: Ignora se o símbolo não bater com o atual
            if (data.ohlc.symbol === this.currentSymbol && this.callbacks['candles']) {
                this.callbacks['candles'](data.ohlc);
            }
        }

        // --- CANAL 3: Ticks em tempo real (Estratégia de Dígitos) ---
        else if (data.msg_type === 'tick') {
            if (data.tick.symbol === this.currentSymbol && window.DigitModule) {
                DigitModule.processTick(data.tick);
            }
        }

        // --- CANAL 4: Atualização de Saldo ---
        if (data.msg_type === 'balance') {
            const el = document.getElementById('acc-balance');
            if (el) el.innerText = `$ ${data.balance.balance.toFixed(2)}`;
        }

        // --- CANAL 5: Confirmação de Compra ---
        if (data.msg_type === 'buy' && !data.error) {
            const contractId = data.buy.contract_id;
            this.activeContracts[contractId] = this._pendingPrefix;
            
            this.socket.send(JSON.stringify({
                proposal_open_contract: 1,
                contract_id: contractId,
                subscribe: 1
            }));
        }

        // --- CANAL 6: Monitoramento de Resultados (Ganho/Perda) ---
        if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c || !c.is_sold) return;

            const prefix = this.activeContracts[c.contract_id] || 'm';
            const profit = parseFloat(c.profit);
            
            // Atualiza o lucro no objeto de estado global
            if (window.app && typeof app.updateModuleProfit === 'function') {
                app.updateModuleProfit(profit, prefix);
            }

            // Remove do monitoramento ativo
            delete this.activeContracts[c.contract_id];
            
            // Notifica os componentes UI que o contrato acabou
            document.dispatchEvent(new CustomEvent('contract_finished', { 
                detail: { prefix, profit, contract: c } 
            }));
        }
    },

    log(msg) {
        console.log(`[DerivAPI] ${msg}`);
    }
};
