const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,

    connect(token, callback) {
        if (this.socket) this.socket.close();
        
        // App_id oficial para manter consistência no Vercel
        this.socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=121512');

        this.socket.onopen = () => {
            this.socket.send(JSON.stringify({ authorize: token }));
        };

        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            
            if (data.error) {
                // Prevenção de loop em erros de subscrição duplicada
                if (data.error.code === 'AlreadySubscribed') return; 
                if (callback) callback(data);
                return;
            }

            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                // Subscrição global de saldo e contratos abertos
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
     * Sincroniza a troca de ativo garantindo a limpeza de subscrições anteriores
     * Resolve Problema 1 e 3
     */
    changeSymbol(newSymbol) {
        if (!newSymbol) return;
        
        // 1. Cancela subscrição de candles anterior se existir
        if (this.candleSubscriptionId) {
            this.socket.send(JSON.stringify({ forget: this.candleSubscriptionId }));
            this.candleSubscriptionId = null;
        }

        // 2. Comando global de limpeza para garantir que nenhum streaming antigo continue
        this.socket.send(JSON.stringify({ forget_all: "candles" }));
        this.socket.send(JSON.stringify({ forget_all: "ohlc" }));
        
        this.currentSymbol = newSymbol;
        
        // 3. Limpeza profunda do histórico no Analista e no State do App
        if (window.app) {
            if (app.analista) app.analista.limparHistorico();
            // Garante que o app saiba qual o ativo atual para IA e UI
            app.currentAsset = newSymbol; 
        }

        // 4. Reinicia subscrição para o novo ativo
        this.subscribeCandles(this.callbacks['candles']);
    },

    subscribeCandles(callback) {
        if (!this.isAuthorized || !this.currentSymbol) return;
        
        this.callbacks['candles'] = callback;
        
        // Solicita histórico + subscrição de streaming
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

    buy(type, stake, prefix, callback, extraParams = {}) {
        if (!this.isAuthorized) return;

        this.callbacks['buy'] = callback;
        this._pendingPrefix = prefix || 'm';

        // Identifica se é um ativo de 1 segundo (S) para ajustar duração
        const isFastAsset = this.currentSymbol.includes('1Z') || this.currentSymbol.includes('1HZ');
        
        const request = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: type,
                currency: 'USD',
                // Ativos (1s) operam em Ticks (5-10), Volatility padrão em Minutos (1)
                duration: isFastAsset ? 5 : 1,
                duration_unit: isFastAsset ? 't' : 'm', 
                symbol: this.currentSymbol,
                ...extraParams
            }
        };

        this.socket.send(JSON.stringify(request));
    },

    handleResponses(data) {
        // Armazena o ID da subscrição atual para cancelamentos futuros
        if (data.msg_type === 'candles' && data.subscription) {
            this.candleSubscriptionId = data.subscription.id;
        }

        // Processamento de Histórico (Array de velas)
        if (data.msg_type === 'candles') {
            // Filtro de segurança: Só aceita se for o ativo que estamos visualizando
            if (this.callbacks['candles'] && data.candles) {
                this.callbacks['candles'](data.candles);
            }
        } 
        // Processamento de streaming OHLC (Vela em formação)
        else if (data.msg_type === 'ohlc') {
            // SEGURANÇA MÁXIMA: Ignora ticks de ativos antigos (Problema 1)
            if (data.ohlc.symbol === this.currentSymbol && this.callbacks['candles']) {
                this.callbacks['candles'](data.ohlc);
            }
        }

        if (data.msg_type === 'balance') {
            const el = document.getElementById('acc-balance');
            if (el) el.innerText = `$ ${data.balance.balance.toFixed(2)}`;
        }

        if (data.msg_type === 'buy' && !data.error) {
            const contractId = data.buy.contract_id;
            this.activeContracts[contractId] = this._pendingPrefix;
            
            // Monitora o contrato específico
            this.socket.send(JSON.stringify({
                proposal_open_contract: 1,
                contract_id: contractId,
                subscribe: 1
            }));
        }

        if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c) return;

            // Notifica o encerramento do contrato e atualiza lucros
            if (c.is_sold) {
                const prefix = this.activeContracts[c.contract_id] || 'm';
                const profit = parseFloat(c.profit);
                
                if (window.app && typeof app.updateModuleProfit === 'function') {
                    app.updateModuleProfit(profit, prefix);
                }

                // Limpa registro do contrato ativo
                delete this.activeContracts[c.contract_id];
                
                // Dispara evento para módulos (Auto/Manual) reagirem
                document.dispatchEvent(new CustomEvent('contract_finished', { 
                    detail: { prefix, profit, contract: c } 
                }));
            }
        }
    }
};
