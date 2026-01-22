const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,
    _pendingPrefix: 'm',

    mapaSimbolos: {
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
    },

    connect(token, callback) {
        if (this.socket) { try { this.socket.close(); } catch(e) {} }
        
        // Conexão oficial via WebSocket da Deriv
        this.socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=121512');

        this.socket.onopen = () => {
            this.log("Conectado ao Cluster. Autorizando...");
            this.socket.send(JSON.stringify({ authorize: token }));
        };

        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            
            // FILTRO DE ISOLAMENTO: O req_id separa as consultas do RADAR do fluxo principal.
            if (data.req_id) return; 

            if (data.error) {
                if (data.error.code === 'AlreadySubscribed') return; 
                this.log(`Erro API: ${data.error.message}`, "error");
                if (callback) callback(data);
                return;
            }

            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.log("Autorização de conta confirmada.");
                // Assina atualizações de saldo e contratos abertos
                this.socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                this.socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
                
                // SNIPER: Inicia a assinatura do gráfico com o buffer otimizado
                this.subscribeCandles(this.callbacks['candles']);
            }

            this.handleResponses(data);
            if (callback) callback(data);
        };
    },

    /**
     * SNIPER RADAR: Busca histórico de forma isolada e ultra-leve.
     * Reduzido de 30 para 10 candles para evitar erro 100/10.
     */
    async getHistoryIsolated(symbol, count = 10) {
        return new Promise((resolve) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return resolve(null);

            const reqId = Math.floor(Math.random() * 100000);
            
            const tempHandler = (msg) => {
                const res = JSON.parse(msg.data);
                if (res.req_id === reqId) {
                    this.socket.removeEventListener('message', tempHandler);
                    if (res.error) {
                        resolve(null);
                    } else {
                        resolve(res.candles || null);
                    }
                }
            };

            this.socket.addEventListener('message', tempHandler);
            
            this.socket.send(JSON.stringify({
                ticks_history: symbol,
                adjust_start_time: 1,
                count: count, // Apenas 10 velas para o radar sniper
                end: "latest",
                granularity: 60,
                style: "candles",
                req_id: reqId 
            }));

            // Timeout de segurança
            setTimeout(() => {
                this.socket.removeEventListener('message', tempHandler);
                resolve(null);
            }, 5000);
        });
    },

    changeSymbol(newSymbol) {
        if (!newSymbol) return;
        const symbolFormatado = this.mapaSimbolos[newSymbol.toUpperCase()] || newSymbol;
        
        if (this.currentSymbol === symbolFormatado && this.candleSubscriptionId) return;
        
        this.log(`Trocando fluxo para: ${symbolFormatado}`);
        
        // Limpa todas as assinaturas anteriores para economizar banda e evitar conflito
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc", "ticks"] }));
        this.candleSubscriptionId = null;
        this.currentSymbol = symbolFormatado;
        
        if (window.app) {
            app.currentAsset = symbolFormatado; 
            if (app.analista) app.analista.limparHistorico();
        }

        // Delay para garantir que o 'forget_all' foi processado pela Deriv
        setTimeout(() => {
            this.subscribeCandles(this.callbacks['candles']);
            this.socket.send(JSON.stringify({ ticks: this.currentSymbol, subscribe: 1 }));
            document.dispatchEvent(new CustomEvent('symbol_changed', { detail: symbolFormatado }));
        }, 300);
    },

    /**
     * SNIPER: Assina o fluxo de candles.
     * Modificado para pedir apenas 10 velas iniciais em vez de 100.
     */
    subscribeCandles(callback) {
        if (!this.isAuthorized || !this.currentSymbol) return;
        if (callback) this.callbacks['candles'] = callback;
        
        this.socket.send(JSON.stringify({
            ticks_history: this.currentSymbol,
            adjust_start_time: 1,
            count: 10, // REDUZIDO: Pede apenas 10 candles para disparo imediato do sniper
            end: "latest",
            granularity: 60,
            style: "candles",
            subscribe: 1
        }));
    },

    buy(type, stake, prefix, callback, extraParams = {}) {
        if (!this.isAuthorized) return;
        if (window.app) app.isTrading = true;

        this.callbacks['buy'] = callback;
        this._pendingPrefix = prefix || 'm';

        const isFastAsset = this.currentSymbol.includes('1Z') || this.currentSymbol.includes('1HZ');
        
        const request = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: type,
                currency: 'USD',
                duration: extraParams.duration || (isFastAsset ? 5 : 1),
                duration_unit: extraParams.duration_unit || (isFastAsset ? 't' : 'm'), 
                symbol: this.currentSymbol,
                ...extraParams
            }
        };

        this.socket.send(JSON.stringify(request));
    },

    handleResponses(data) {
        if (data.msg_type === 'candles' && data.subscription) {
            this.candleSubscriptionId = data.subscription.id;
        }

        // Tratamento de Candles Históricos e do Primeiro Stream
        if (data.msg_type === 'candles' && data.candles) {
            if (window.app && app.analista) app.analista.adicionarDados(data.candles);
            if (this.callbacks['candles']) this.callbacks['candles'](data.candles);
        } 
        // Tratamento de Candles em tempo real (OHLC)
        else if (data.msg_type === 'ohlc') {
            if (data.ohlc.symbol === this.currentSymbol) {
                const normalized = {
                    e: data.ohlc.open_time,
                    o: data.ohlc.open,
                    h: data.ohlc.high,
                    l: data.ohlc.low,
                    c: data.ohlc.close
                };
                if (window.app && app.analista) app.analista.adicionarDados(normalized);
                if (this.callbacks['candles']) this.callbacks['candles'](normalized);
            }
        }
        // Tratamento de Ticks Individuais (Análise de Micro-Momentum)
        else if (data.msg_type === 'tick') {
            if (data.tick.symbol === this.currentSymbol) {
                if (window.app && app.analista) app.analista.adicionarDados(null, data.tick.quote);
                if (window.DigitModule) DigitModule.processTick(data.tick);
                if (this.callbacks['tick']) this.callbacks['tick'](data.tick);
                document.dispatchEvent(new CustomEvent('tick_update', { detail: data.tick }));
            }
        }

        if (data.msg_type === 'balance') {
            const val = data.balance.balance;
            const el = document.getElementById('acc-balance');
            if (el) el.innerText = `$ ${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            if (window.app) app.balance = val;
        }

        if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c || !c.is_sold) return;

            const prefix = this.activeContracts[c.contract_id] || 'm';
            const profit = parseFloat(c.profit);
            
            delete this.activeContracts[c.contract_id];
            
            if (window.app) {
                app.isTrading = false;
                app.updateModuleProfit(profit, prefix);
            }
            
            document.dispatchEvent(new CustomEvent('contract_finished', { 
                detail: { prefix, profit, contract: c } 
            }));
            
            this.socket.send(JSON.stringify({ balance: 1 }));
            this.log(`Operação Finalizada [${prefix}]. Payout: ${profit}`);
        }

        if (data.msg_type === 'buy' && !data.error) {
            this.activeContracts[data.buy.contract_id] = this._pendingPrefix;
        }
        
        if (data.msg_type === 'buy' && data.error) {
            if (window.app) app.isTrading = false;
        }
    },

    log(msg, type = "info") {
        const color = type === "error" ? "color: #ff4444; font-weight: bold;" : "color: #00ff88;";
        console.log(`%c[DerivAPI] ${msg}`, color);
    }
};
