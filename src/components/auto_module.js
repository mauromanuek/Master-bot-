const AutoModule = {
    isRunning: false,
    currentProfit: 0,
    stats: { wins: 0, losses: 0, total: 0 },
    _handler: null,
    _cycleTimeout: null,

    render() {
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-purple-500 italic uppercase leading-none">Auto Scalper Sniper</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Agressive Engine V2.5</span>
                    </div>
                    <div id="a-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <div>
                        <label class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Stake ($)</label>
                        <input id="a-stake" type="number" value="1.00" step="0.50" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-purple-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-green-500 font-bold uppercase tracking-wider">Take Profit</label>
                        <input id="a-tp" type="number" value="5.00" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-red-500 font-bold uppercase tracking-wider">Stop Loss</label>
                        <input id="a-sl" type="number" value="10.00" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-red-500 transition-colors">
                    </div>
                </div>

                <button id="btn-a-toggle" onclick="AutoModule.toggle()" class="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Iniciar Operação Sniper</button>
                
                <div id="a-status" class="bg-black p-3 rounded-xl h-40 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> [SISTEMA] Aguardando ativação...</p>
                </div>
                
                <div class="bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow-xl">
                    <div>
                        <p class="text-[9px] text-gray-500 uppercase font-bold">Sessão Scalping</p>
                        <p id="a-val-profit" class="text-xl font-black text-gray-600">0.00 USD</p>
                    </div>
                    <div class="text-right text-[10px] font-bold font-mono space-y-1 bg-black/40 p-2 rounded-lg">
                        <p class="text-green-500">WINS: <span id="a-stat-w">0</span></p>
                        <p class="text-red-500">LOSSES: <span id="a-stat-l">0</span></p>
                    </div>
                </div>
            </div>`;
    },

    log(msg, color = "text-gray-400") {
        const status = document.getElementById('a-status');
        if (status) {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            status.innerHTML += `<p class="${color}">[${time}] ${msg}</p>`;
            status.scrollTop = status.scrollHeight;
        }
    },

    toggle() {
        this.isRunning = !this.isRunning;
        const btn = document.getElementById('btn-a-toggle');
        const indicator = document.getElementById('a-indicator');
        
        if (this.isRunning) {
            btn.innerText = "PARAR OPERAÇÃO";
            btn.classList.remove('bg-purple-600');
            btn.classList.add('bg-red-600');
            
            indicator.classList.remove('bg-gray-600');
            indicator.classList.add('bg-purple-500', 'animate-pulse');
            
            this.currentProfit = 0;
            this.stats = { wins: 0, losses: 0, total: 0 };
            
            this.log(`MODO SNIPER ATIVADO EM ${app.currentAsset}`, "text-purple-400 font-bold underline");
            this.setupListener(); 
            this.runCycle();
        } else {
            if (this._cycleTimeout) clearTimeout(this._cycleTimeout);
            btn.innerText = "INICIAR OPERAÇÃO SNIPER";
            btn.classList.remove('bg-red-600');
            btn.classList.add('bg-purple-600');
            
            indicator.classList.remove('bg-purple-500', 'animate-pulse');
            indicator.classList.add('bg-gray-600');
            
            this.log("SISTEMA DESLIGADO PELO USUÁRIO", "text-yellow-600 font-bold");
            app.isTrading = false;
        }
    },

    setupListener() {
        // CORREÇÃO: Remove o listener anterior de forma segura usando a referência salva
        if (this._handler) {
            document.removeEventListener('contract_finished', this._handler);
        }
        
        this._handler = (e) => {
            if (this.isRunning && e.detail && e.detail.prefix === 'a') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    async runCycle() {
        // CORREÇÃO: Adicionado verificador de existência do analista para evitar crash
        if (!this.isRunning || !app.analista) return;
        
        // Se já estiver em trade, não inicia nova análise, apenas aguarda
        if (app.isTrading) {
            this.scheduleNext(1000);
            return;
        }

        if (this.checkLimits()) return;

        try {
            const veredito = await app.analista.obterVereditoCompleto();
            
            if (!this.isRunning || app.isTrading) return;

            // Filtro Sniper: Confiança mínima de 70% para entrar no trade
            if (veredito && veredito.confianca >= 70 && (veredito.direcao === "CALL" || veredito.direcao === "PUT")) {
                const stakeInput = document.getElementById('a-stake');
                const stake = stakeInput ? parseFloat(stakeInput.value) : 1.00;
                
                this.log(`ALVO DETECTADO: ${veredito.direcao} (${veredito.confianca}%)`, "text-green-500 font-bold");
                this.log(`> ${veredito.motivo}`, "text-gray-500 text-[9px] italic");
                
                app.isTrading = true; 
                
                // CORREÇÃO: Passando o prefixo 'a' explicitamente para o DerivAPI.buy
                DerivAPI.buy(veredito.direcao, stake, 'a', (res) => {
                    if (res.error) {
                        this.log(`ERRO API: ${res.error.message}`, "text-red-500");
                        app.isTrading = false;
                        this.scheduleNext(2000); 
                    } else {
                        this.log("CONTRATO ABERTO. Monitorando...", "text-blue-400");
                    }
                });
            } else {
                // Ciclo de varredura: 500ms para alta frequência
                this.scheduleNext(500); 
            }

        } catch (e) {
            console.error("Erro no Ciclo Auto:", e);
            this.scheduleNext(2000);
        }
    },

    scheduleNext(ms) {
        if (this._cycleTimeout) clearTimeout(this._cycleTimeout);
        if (this.isRunning) {
            this._cycleTimeout = setTimeout(() => this.runCycle(), ms);
        }
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        
        if (profit > 0) this.stats.wins++;
        else if (profit < 0) this.stats.losses++;
        this.stats.total++;
        
        this.updateUI(profit);
        
        if (this.isRunning) {
            // Pausa de segurança após o trade para estabilização do saldo
            this.scheduleNext(1500);
        }
    },

    checkLimits() {
        const tpInput = document.getElementById('a-tp');
        const slInput = document.getElementById('a-sl');
        
        const tp = tpInput ? parseFloat(tpInput.value) : 0;
        const sl = slInput ? parseFloat(slInput.value) : 0;

        if (tp > 0 && this.currentProfit >= tp) {
            this.log(`META ATINGIDA: +$${this.currentProfit.toFixed(2)}`, "text-green-500 font-black text-sm");
            this.toggle();
            return true;
        }
        if (sl > 0 && this.currentProfit <= (sl * -1)) {
            this.log(`STOP LOSS ATINGIDO: -$${Math.abs(this.currentProfit).toFixed(2)}`, "text-red-500 font-black text-sm");
            this.toggle();
            return true;
        }
        return false;
    },

    updateUI(lastProfit) {
        const profitEl = document.getElementById('a-val-profit');
        const winEl = document.getElementById('a-stat-w');
        const lossEl = document.getElementById('a-stat-l');

        if (profitEl) {
            profitEl.innerText = `${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        if (winEl) winEl.innerText = this.stats.wins;
        if (lossEl) lossEl.innerText = this.stats.losses;

        const color = lastProfit > 0 ? "text-green-400" : "text-red-400";
        const status = lastProfit > 0 ? "VITÓRIA" : "DERROTA";
        this.log(`RESULTADO: ${status} ($${lastProfit.toFixed(2)})`, `${color} font-bold`);
    }
};
