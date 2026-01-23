const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,
    _pendingPrefix: 'm',
    _isProcessingBuy: false, // TRAVA DE SEGURANÇA ADICIONADA

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
        
        this.socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=121512');

        this.socket.onopen = () => {
            this.log("Conectado ao Cluster. Autorizando...");
            this.socket.send(JSON.stringify({ authorize: token }));
        };

        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            
            // O req_id isola o Radar para não travar o fluxo principal
            if (data.req_id && data.msg_type !== 'proposal_open_contract' && data.msg_type !== 'buy') return; 

            if (data.error) {
                if (data.error.code === 'AlreadySubscribed') return; 
                this.log(`Erro API: ${data.error.message}`, "error");
                
                // Reset de travas em caso de erro na compra
                if(data.msg_type === 'buy') {
                    this._isProcessingBuy = false;
                    if (window.app) app.isTrading = false;
                }
                
                if (callback) callback(data);
                return;
            }

            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.log("Autorização de conta confirmada.");
                this.socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                // Assinatura global de contratos - fundamental para monitoramento em tempo real
                this.socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
                this.subscribeCandles(this.callbacks['candles']);
            }

            this.handleResponses(data);
            if (callback) callback(data);
        };
    },

    async getHistoryIsolated(symbol, count = 10) {
        return new Promise((resolve) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return resolve(null);
            const reqId = Math.floor(Math.random() * 100000);
            const tempHandler = (msg) => {
                const res = JSON.parse(msg.data);
                if (res.req_id === reqId) {
                    this.socket.removeEventListener('message', tempHandler);
                    resolve(res.error ? null : (res.candles || null));
                }
            };
            this.socket.addEventListener('message', tempHandler);
            this.socket.send(JSON.stringify({
                ticks_history: symbol, count: count, end: "latest", granularity: 60, style: "candles", req_id: reqId 
            }));
            setTimeout(() => { this.socket.removeEventListener('message', tempHandler); resolve(null); }, 5000);
        });
    },

    changeSymbol(newSymbol) {
        if (!newSymbol) return;
        const symbolFormatado = this.mapaSimbolos[newSymbol.toUpperCase()] || newSymbol;
        if (this.currentSymbol === symbolFormatado && this.candleSubscriptionId) return;
        
        this.log(`Trocando fluxo para: ${symbolFormatado}`);
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc", "ticks"] }));
        this.candleSubscriptionId = null;
        this.currentSymbol = symbolFormatado;
        
        if (window.app) {
            app.currentAsset = symbolFormatado; 
            if (app.analista) app.analista.limparHistorico();
        }

        setTimeout(() => {
            this.subscribeCandles(this.callbacks['candles']);
            this.socket.send(JSON.stringify({ ticks: this.currentSymbol, subscribe: 1 }));
            document.dispatchEvent(new CustomEvent('symbol_changed', { detail: symbolFormatado }));
        }, 300);
    },

    subscribeCandles(callback) {
        if (!this.isAuthorized || !this.currentSymbol) return;
        if (callback) this.callbacks['candles'] = callback;
        
        this.socket.send(JSON.stringify({
            ticks_history: this.currentSymbol, count: 10, end: "latest", granularity: 60, style: "candles", subscribe: 1
        }));
    },

    buy(type, stake, prefix, callback, extraParams = {}) {
        // CORREÇÃO: Impede múltiplas ordens simultâneas antes da resposta do servidor
        if (!this.isAuthorized || this._isProcessingBuy) return;
        
        if (window.app) app.isTrading = true;
        this._isProcessingBuy = true;

        this.callbacks['buy'] = callback;
        this._pendingPrefix = prefix || 'm';

        const isFastAsset = this.currentSymbol.includes('1Z') || this.currentSymbol.includes('1HZ');
        
        // CORREÇÃO: Gerar um req_id único para rastrear esta compra específica
        const buyReqId = Date.now();

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
            },
            passthrough: { prefix: this._pendingPrefix }, // Metadado seguro
            req_id: buyReqId
        };

        this.socket.send(JSON.stringify(request));
    },

    handleResponses(data) {
        if (data.msg_type === 'candles' && data.subscription) {
            this.candleSubscriptionId = data.subscription.id;
        }

        if (data.msg_type === 'candles' && data.candles) {
            if (window.app && app.analista) app.analista.adicionarDados(data.candles);
            if (this.callbacks['candles']) this.callbacks['candles'](data.candles);
        } 
        else if (data.msg_type === 'ohlc') {
            if (data.ohlc.symbol === this.currentSymbol) {
                const normalized = { e: data.ohlc.open_time, o: data.ohlc.open, h: data.ohlc.high, l: data.ohlc.low, c: data.ohlc.close };
                if (window.app && app.analista) app.analista.adicionarDados(normalized);
                if (this.callbacks['candles']) this.callbacks['candles'](normalized);
            }
        }
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

        // MONITORAMENTO DE CONTRATO (POC)
        if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c) return;

            // Busca o prefixo associado a este ID de contrato
            const prefix = this.activeContracts[c.contract_id];
            
            if (!c.is_sold && window.app) {
                const statusText = document.getElementById('status-text');
                if (statusText) statusText.innerText = `Contrato Ativo: Profit ${c.profit}`;
            }

            // CORREÇÃO: Verifica se o contrato foi fechado/vendido
            if (c.status !== 'open' || c.is_sold) {
                if (prefix) {
                    const profit = parseFloat(c.profit);
                    
                    // Remove do mapeamento antes de atualizar a UI para evitar duplicidade
                    delete this.activeContracts[c.contract_id];
                    
                    if (window.app) {
                        app.isTrading = false;
                        app.updateModuleProfit(profit, prefix);
                    }
                    
                    document.dispatchEvent(new CustomEvent('contract_finished', { 
                        detail: { prefix, profit, contract: c } 
                    }));
                    
                    this.socket.send(JSON.stringify({ balance: 1 }));
                    this.log(`Finalizado [${prefix}]. Payout: ${profit} | Status: ${c.status}`);
                }
            }
        }

        if (data.msg_type === 'buy' && !data.error) {
            // CORREÇÃO: Usa o passthrough ou o prefixo pendente de forma segura
            const safePrefix = (data.echo_req.passthrough && data.echo_req.passthrough.prefix) ? data.echo_req.passthrough.prefix : this._pendingPrefix;
            
            this.activeContracts[data.buy.contract_id] = safePrefix;
            this.log(`Ordem ID ${data.buy.contract_id} confirmada [${safePrefix}].`);
            
            // Libera a trava para a próxima compra, mas o app.isTrading continua true até o POC fechar
            this._isProcessingBuy = false;
        }
        
        if (data.msg_type === 'buy' && data.error) {
            this._isProcessingBuy = false;
            if (window.app) app.isTrading = false;
        }
    },

    log(msg, type = "info") {
        const color = type === "error" ? "color: #ff4444; font-weight: bold;" : "color: #00ff88;";
        console.log(`%c[DerivAPI] ${msg}`, color);
    }
};
