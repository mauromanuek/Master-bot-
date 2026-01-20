const DerivAPI = {
    socket: null,
    isAuthorized: false,
    callbacks: {},
    activeContracts: {}, 
    currentSymbol: "R_100", 
    candleSubscriptionId: null,
    isSubscribing: false,
    _pendingPrefix: 'm', // Prefixo padrão

    // MAPA DE TRADUÇÃO TÉCNICA (Essencial para resolver "Símbolo Inválido")
    mapaSimbolos: {
        "VOLATILITY 10 INDEX": "R_10",
        "VOLATILITY 25 INDEX": "R_25",
        "VOLATILITY 50 INDEX": "R_50",
        "VOLATILITY 75 INDEX": "R_75",
        "VOLATILITY 100 INDEX": "R_100",
        "BOOM 300 INDEX": "B_300",
        "CRASH 300 INDEX": "C_300",
        "BOOM 500 INDEX": "B_500",
        "CRASH 500 INDEX": "C_500",
        "STEP INDEX": "STPINDEX"
    },

    /**
     * Inicializa a conexão e configura os listeners globais
     */
    connect(token, callback) {
        if (this.socket) {
            try { this.socket.close(); } catch(e) {}
        }
        
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
                // Erro de subscrição duplicada é comum e não deve travar o app
                if (data.error.code === 'AlreadySubscribed') return; 
                this.log(`Erro API: ${data.error.message}`, "error");
                if (callback) callback(data);
                return;
            }

            // Sucesso na Autorização: Inicia fluxos de saldo e contratos
            if (data.msg_type === 'authorize') {
                this.isAuthorized = true;
                this.log("Autorizado com sucesso.");
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
            this.log("Erro de conexão com servidor", "error");
            if (callback) callback({ error: { message: "Erro de conexão com servidor" } });
        };
    },

    /**
     * Gerencia a troca de ativo limpando subscrições anteriores
     */
    changeSymbol(newSymbol) {
        if (!newSymbol) return;
        
        // Traduz o símbolo antes de aplicar (Resolve o erro visual do gráfico)
        const symbolFormatado = this.mapaSimbolos[newSymbol.toUpperCase()] || newSymbol;
        
        if (this.currentSymbol === symbolFormatado) return;
        
        this.log(`Trocando ativo: ${this.currentSymbol} -> ${symbolFormatado}`);
        
        // 1. Limpa todas as subscrições ativas para evitar overlap de dados
        this.socket.send(JSON.stringify({ forget_all: ["candles", "ohlc", "ticks"] }));
        this.candleSubscriptionId = null;

        // 2. Atualiza estado global
        this.currentSymbol = symbolFormatado;
        
        if (window.app) {
            if (app.analista) app.analista.limparHistorico();
            app.currentAsset = symbolFormatado; 
        }

        // 3. Pequeno delay para garantir que o servidor processou o 'forget_all'
        setTimeout(() => {
            // Reinicia subscrições para o novo ativo
            this.subscribeCandles(this.callbacks['candles']);
            
            // Se o módulo de dígitos estiver ativo ou se o app precisar de ticks, subscreve
            this.socket.send(JSON.stringify({ ticks: this.currentSymbol, subscribe: 1 }));
            
            // DISPARA EVENTO PARA O GRÁFICO ATUALIZAR (Resolve o erro "Símbolo Inválido")
            document.dispatchEvent(new CustomEvent('symbol_changed', { detail: symbolFormatado }));
        }, 500);
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
        if (!this.isAuthorized) {
            this.log("Erro: Tentativa de compra sem autorização.", "error");
            return;
        }

        this.callbacks['buy'] = callback;
        this._pendingPrefix = prefix || 'm';

        // Lógica de tempo de expiração baseada no tipo de ativo
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
            
            // Alimenta o analista com os dados iniciais de vela
            if (window.app && app.analista) {
                app.analista.adicionarDados(data.candles);
            }
        } 
        
        // --- CANAL 2: Vela em Formação (OHLC) - Normalização de Dados ---
        else if (data.msg_type === 'ohlc') {
            if (data.ohlc.symbol === this.currentSymbol && this.callbacks['candles']) {
                const normalizedCandle = {
                    epoch: data.ohlc.open_time,
                    open: data.ohlc.open,
                    high: data.ohlc.high,
                    low: data.ohlc.low,
                    close: data.ohlc.close
                };
                
                this.callbacks['candles'](normalizedCandle);
                
                if (window.app && app.analista) {
                    app.analista.adicionarDados(normalizedCandle);
                }
            }
        }

        // --- CANAL 3: Ticks em tempo real ---
        else if (data.msg_type === 'tick') {
            if (data.tick.symbol === this.currentSymbol) {
                // Notifica analista de IA
                if (window.app && app.analista) {
                    app.analista.adicionarDados(null, data.tick.quote);
                }

                // Notifica Módulo de Dígitos (se existir)
                if (window.DigitModule) {
                    DigitModule.processTick(data.tick);
                }

                // Evento global para o deriv_app
                document.dispatchEvent(new CustomEvent('tick_update', { detail: data.tick }));
            }
        }

        // --- CANAL 4: Atualização de Saldo ---
        if (data.msg_type === 'balance') {
            const balanceValue = data.balance.balance;
            // Atualiza UI principal
            const el = document.getElementById('acc-balance');
            if (el) el.innerText = `$ ${balanceValue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            
            // Atualiza objeto global app
            if (window.app) {
                app.balance = balanceValue;
                if (typeof app.updateBalanceUI === 'function') app.updateBalanceUI();
            }
        }

        // --- CANAL 5: Confirmação de Compra ---
        if (data.msg_type === 'buy') {
            if (this.callbacks['last_buy_action']) {
                this.callbacks['last_buy_action'](data);
                delete this.callbacks['last_buy_action'];
            }
            if (!data.error) {
                const contractId = data.buy.contract_id;
                this.activeContracts[contractId] = this._pendingPrefix;
            }
        }

        // --- CANAL 6: Monitoramento de Resultados ---
        if (data.msg_type === 'proposal_open_contract') {
            const c = data.proposal_open_contract;
            if (!c || !c.is_sold) return;

            const prefix = this.activeContracts[c.contract_id] || 'm';
            const profit = parseFloat(c.profit);
            
            delete this.activeContracts[c.contract_id];
            
            // Dispara evento para os módulos computarem o lucro
            document.dispatchEvent(new CustomEvent('contract_finished', { 
                detail: { prefix, profit, contract: c } 
            }));
            
            this.log(`Contrato [${prefix}] Finalizado: ${profit > 0 ? 'Win' : 'Loss'} (${profit})`);
            
            // Solicita atualização de saldo após fechamento de contrato
            this.socket.send(JSON.stringify({ balance: 1 }));
        }
    },

    /**
     * Helper para obter informações da conta de forma assíncrona
     */
    getAccountInfo() {
        if (!this.isAuthorized) return null;
        return new Promise((resolve) => {
            const tempListener = (msg) => {
                const data = JSON.parse(msg.data);
                if (data.msg_type === 'authorize') {
                    this.socket.removeEventListener('message', tempListener);
                    resolve(data.authorize);
                }
            };
            this.socket.addEventListener('message', tempListener);
            this.socket.send(JSON.stringify({ authorize: localStorage.getItem('deriv_token') || "" }));
        });
    },

    /**
     * Helper para subscrever ticks de qualquer ativo
     */
    subscribeTicks(symbol) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            // Garante tradução antes de subscrever ticks avulsos
            const sym = this.mapaSimbolos[symbol.toUpperCase()] || symbol;
            this.socket.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
        }
    },

    log(msg, type = "info") {
        const color = type === "error" ? "color: #ff4444" : "color: #00ff88";
        console.log(`%c[DerivAPI] ${msg}`, color);
    }
};
