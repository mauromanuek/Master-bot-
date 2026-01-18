const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,
    _pendingPrefix: 'm', // Prefixo padrão

    /**
     * Inicializa a conexão e configura os listeners globais
     */
    connect(token, callback) {
        if (this.socket) {
            try { this.socket.close(); } catch(e) {}
        }
        
        this.socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=121512');

        this.socket.onopen = () => {
            this.log("Conectado ao servidor Deriv. Autorizando...");
            this.socket.send(JSON.stringify({ authorize: token }));
        };

        this.socket.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            
            if (data.error) {
                // Erro de subscrição duplicada é comum e não deve travar o app
                if (data.error.code === 'AlreadySubscribed') return; 
                this.log(`Erro API: ${data.error.message}`, "error");
                if (callback) callback(data);
                return;
            }

            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.log("Autorizado com sucesso.");
                // Subscreve ao saldo e ao fluxo de contratos abertos globalmente
                this.socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                this.socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
            }

            this.handleResponses(data);
            if (callback) callback(data);
        };

        this.socket.onerror = (err) => {
            this.log("Erro de conexão com servidor", "error");
            if (callback) callback({ error: { message: "Erro de conexão com servidor" } });
        };
    },

    /**
     * Gerencia a troca de ativo (Resolvendo conflitos de ticks e OHLC)
     */
    changeSymbol(newSymbol) {
        if (!newSymbol || this.currentSymbol === newSymbol) return;
        
        this.log(`Trocando ativo: ${this.currentSymbol} -> ${newSymbol}`);
        
        // 1. Limpa todas as subscrições ativas no servidor para evitar lixo de dados
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc", "ticks"] }));
        this.candleSubscriptionId = null;

        // 2. Atualiza estado global
        this.currentSymbol = newSymbol;
        
        if (window.app) {
            if (app.analista) app.analista.limparHistorico();
            app.currentAsset = newSymbol; 
        }

        // 3. Reinicia subscrição de velas para o novo ativo
        this.subscribeCandles(this.callbacks['candles']);
        
        // 4. Se o módulo de dígitos estiver ativo, reinicia a subscrição de ticks específica
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
     * Executa ordens de compra
     */
    buy(type, stake, prefix, callback, extraParams = {}) {
        if (!this.isAuthorized) {
            this.log("Erro: Tentativa de compra sem autorização.", "error");
            return;
        }

        // Armazena o prefixo para saber qual módulo receberá o lucro depois
        this._pendingPrefix = prefix || 'm';

        // Determina duração: Tick para sintéticos rápidos, Minutos para moedas/lentos
        const isTickAsset = this.currentSymbol.includes('1Z') || this.currentSymbol.includes('1HZ') || this.currentSymbol.startsWith('R_');
        
        const request = {
            buy: 1,
            price: parseFloat(stake),
            parameters: {
                amount: parseFloat(stake),
                basis: 'stake',
                contract_type: type,
                currency: 'USD',
                duration: extraParams.duration || (isTickAsset ? 5 : 1),
                duration_unit: extraParams.duration_unit || (isTickAsset ? 't' : 'm'), 
                symbol: this.currentSymbol,
                ...extraParams
            }
        };

        this.socket.send(JSON.stringify(request));
        
        // Callback temporário para a resposta imediata do "buy"
        if (callback) this.callbacks['last_buy_action'] = callback;
    },

    /**
     * Distribuidor central de mensagens (Hub de Dados)
     */
    handleResponses(data) {
        // --- CANAL: Velas e OHLC ---
        if (data.msg_type === 'candles') {
            if (data.subscription) this.candleSubscriptionId = data.subscription.id;
            if (this.callbacks['candles']) this.callbacks['candles'](data.candles);
        } 
        else if (data.msg_type === 'ohlc') {
            if (data.ohlc.symbol === this.currentSymbol && this.callbacks['candles']) {
                this.callbacks['candles'](data.ohlc);
            }
        }

        // --- CANAL: Ticks (Dígitos) ---
        else if (data.msg_type === 'tick') {
            if (data.tick.symbol === this.currentSymbol && window.DigitModule) {
                DigitModule.processTick(data.tick);
            }
        }

        // --- CANAL: Saldo ---
        else if (data.msg_type === 'balance') {
            const el = document.getElementById('acc-balance');
            if (el) el.innerText = `$ ${data.balance.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        // --- CANAL: Confirmação de Execução ---
        else if (data.msg_type === 'buy') {
            if (this.callbacks['last_buy_action']) {
                this.callbacks['last_buy_action'](data);
                delete this.callbacks['last_buy_action'];
            }
            if (!data.error) {
                // Mapeia o ID do contrato ao prefixo do módulo que o abriu
                this.activeContracts[data.buy.contract_id] = this._pendingPrefix;
            }
        }

        // --- CANAL: Finalização de Contrato (Lucro/Perda) ---
        else if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c || !c.is_sold) return;

            const prefix = this.activeContracts[c.contract_id] || 'm';
            const profit = parseFloat(c.profit);
            
            // 1. Limpa do registro ativo
            delete this.activeContracts[c.contract_id];
            
            // 2. Dispara evento global para a UI (Modulos ouvem isso)
            document.dispatchEvent(new CustomEvent('contract_finished', { 
                detail: { prefix, profit, contract: c } 
            }));
            
            this.log(`Contrato [${prefix}] Finalizado: ${profit > 0 ? 'Win' : 'Loss'} (${profit})`);
        }
    },

    log(msg, type = "info") {
        const color = type === "error" ? "color: #ff4444" : "color: #00ff88";
        console.log(`%c[DerivAPI] ${msg}`, color);
    }
};
