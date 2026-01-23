const DerivAPI = {
    socket: null,
    isAuthorized: false,
    activeContracts: {}, 
    _isProcessingBuy: false,

    connect(token, callback) {
        this.socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=121512');
        this.socket.onopen = () => this.socket.send(JSON.stringify({ authorize: token }));
        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                this.socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
            }
            if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
                const c = data.proposal_open_contract;
                const prefix = this.activeContracts[c.contract_id];
                if (prefix) {
                    delete this.activeContracts[c.contract_id];
                    if (window.app) app.updateModuleProfit(parseFloat(c.profit), prefix);
                }
            }
            if (data.msg_type === 'buy' && !data.error) {
                this.activeContracts[data.buy.contract_id] = data.echo_req.passthrough.prefix;
                this._isProcessingBuy = false;
            }
            if (callback) callback(data);
        };
    },

    buy(type, stake, prefix, callback, params = {}) {
        if (!this.isAuthorized || this._isProcessingBuy) return;
        this._isProcessingBuy = true;
        if (window.app) app.isTrading = true;
        const req = {
            buy: 1, price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake), basis: 'stake', contract_type: type,
                currency: 'USD', duration: params.duration || 1, 
                duration_unit: params.duration_unit || 'm', symbol: app.currentAsset, ...params
            },
            passthrough: { prefix: prefix }
        };
        this.socket.send(JSON.stringify(req));
    },

    changeSymbol(s) {
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc", "ticks"] }));
        setTimeout(() => this.subscribeCandles(), 500);
    },

    subscribeCandles() {
        this.socket.send(JSON.stringify({
            ticks_history: app.currentAsset, count: 30, end: "latest", granularity: 60, style: "candles", subscribe: 1
        }));
    }
};
