const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,
    _pendingPrefix: 'm',

    // ATUALIZADO: Incluindo índices de 1s para evitar erro de "Símbolo Inválido"
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
            this.log("Conectado. Autorizando...");
            this.socket.send(JSON.stringify({ authorize: token }));
        };

        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.error) {
                if (data.error.code === 'AlreadySubscribed') return; 
                this.log(`Erro API: ${data.error.message}`, "error");
                if (callback) callback(data);
                return;
            }

            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.log("Autorizado.");
                this.socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                this.socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
            }

            this.handleResponses(data);
            if (callback) callback(data);
        };
    },

    changeSymbol(newSymbol) {
        if (!newSymbol) return;
        const symbolFormatado = this.mapaSimbolos[newSymbol.toUpperCase()] || newSymbol;
        
        if (this.currentSymbol === symbolFormatado && this.candleSubscriptionId) return;
        
        this.log(`Ativo: ${symbolFormatado}`);
        
        // Limpa apenas o necessário para não bugar o Radar
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc"] }));
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
            ticks_history: this.currentSymbol,
            adjust_start_time: 1,
            count: 100, // Mantido 100 para o histórico do Python
            end: "latest",
            granularity: 60,
            style: "candles",
            subscribe: 1
        }));
    },

    /**
     * AJUSTE SNIPER: Otimização de tempo de expiração
     */
    buy(type, stake, prefix, callback, extraParams = {}) {
        if (!this.isAuthorized) return;

        this.callbacks['buy'] = callback;
        this._pendingPrefix = prefix || 'm';

        // Sniper Mode: Se for ativo de volatilidade comum, usa 1 minuto. Se for (1s), usa 5 ticks.
        const isFastAsset = this.currentSymbol.includes('1Z') || this.currentSymbol.includes('1HZ');
        
        const request = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: type,
                currency: 'USD',
                // Dinâmico: Ticks para rápidos, Minutos para estáveis
                duration: extraParams.duration || (isFastAsset ? 5 : 1),
                duration_unit: extraParams.duration_unit || (isFastAsset ? 't' : 'm'), 
                symbol: this.currentSymbol,
                ...extraParams
            }
        };

        this.socket.send(JSON.stringify(request));
        if (callback) this.callbacks['last_buy_action'] = callback;
    },

    handleResponses(data) {
        if (data.msg_type === 'candles' && data.subscription) {
            this.candleSubscriptionId = data.subscription.id;
        }

        // Histórico inicial (Array)
        if (data.msg_type === 'candles' && data.candles) {
            if (window.app && app.analista) app.analista.adicionarDados(data.candles);
            if (this.callbacks['candles']) this.callbacks['candles'](data.candles);
        } 
        
        // Vela em tempo real (OHLC)
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

        // Ticks
        else if (data.msg_type === 'tick') {
            if (data.tick.symbol === this.currentSymbol) {
                if (window.app && app.analista) app.analista.adicionarDados(null, data.tick.quote);
                if (window.DigitModule) DigitModule.processTick(data.tick);
                document.dispatchEvent(new CustomEvent('tick_update', { detail: data.tick }));
            }
        }

        // Saldo
        if (data.msg_type === 'balance') {
            const val = data.balance.balance;
            const el = document.getElementById('acc-balance');
            if (el) el.innerText = `$ ${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            if (window.app) app.balance = val;
        }

        // Resultado do Contrato
        if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c || !c.is_sold) return;

            const prefix = this.activeContracts[c.contract_id] || 'm';
            const profit = parseFloat(c.profit);
            
            delete this.activeContracts[c.contract_id];
            
            // ESSENCIAL: Notifica a interface do resultado para atualizar W/L
            if (window.app) app.updateModuleProfit(profit, prefix);
            
            document.dispatchEvent(new CustomEvent('contract_finished', { 
                detail: { prefix, profit, contract: c } 
            }));
            
            this.socket.send(JSON.stringify({ balance: 1 }));
        }

        if (data.msg_type === 'buy' && !data.error) {
            this.activeContracts[data.buy.contract_id] = this._pendingPrefix;
        }
    },

    log(msg, type = "info") {
        const color = type === "error" ? "color: #ff4444" : "color: #00ff88";
        console.log(`%c[DerivAPI] ${msg}`, color);
    }
};
