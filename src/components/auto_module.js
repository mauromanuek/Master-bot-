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
            btn.classList.replace('bg-purple-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-purple-500');
            indicator.classList.add('animate-pulse');
            
            this.currentProfit = 0;
            this.stats = { wins: 0, losses: 0, total: 0 };
            
            this.log(`MODO SNIPER ATIVADO EM ${app.currentAsset}`, "text-purple-400 font-bold underline");
            this.setupListener(); 
            this.runCycle();
        } else {
            if (this._cycleTimeout) clearTimeout(this._cycleTimeout);
            btn.innerText = "INICIAR OPERAÇÃO SNIPER";
            btn.classList.replace('bg-red-600', 'bg-purple-600');
            indicator.classList.replace('bg-purple-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            this.log("SISTEMA DESLIGADO PELO USUÁRIO", "text-yellow-600 font-bold");
            app.isTrading = false;
        }
    },

    setupListener() {
        // Remove ouvintes antigos para evitar duplicação de logs e processamento
        if (this._handler) document.removeEventListener('contract_finished', this._handler);
        
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'a') {
                // O evento 'contract_finished' disparado pela DerivAPI garante o fim do lag
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    async runCycle() {
        if (!this.isRunning || app.isTrading) return;
        if (this.checkLimits()) return;

        try {
            // Analista processa as últimas 8-10 velas enviadas pela DerivAPI
            const veredito = await app.analista.obterVereditoCompleto();
            
            if (!this.isRunning || app.isTrading) return;

            // Filtro Sniper: 70% de confiança para sinais de alta frequência
            if (veredito && veredito.confianca >= 70 && (veredito.direcao === "CALL" || veredito.direcao === "PUT")) {
                const stake = document.getElementById('a-stake')?.value || 1;
                
                this.log(`ALVO DETECTADO: ${veredito.direcao} (${veredito.confianca}%)`, "text-green-500 font-bold");
                this.log(`> Motivo: ${veredito.motivo}`, "text-gray-500 text-[8px]");
                
                app.isTrading = true; 
                
                DerivAPI.buy(veredito.direcao, stake, 'a', (res) => {
                    if (res.error) {
                        this.log(`ERRO DE EXECUÇÃO: ${res.error.message}`, "text-red-500");
                        app.isTrading = false;
                        this.scheduleNext(1500); 
                    } else {
                        this.log("ORDEM EM MERCADO. Monitorando ticks...", "text-blue-400 animate-pulse");
                    }
                });
            } else {
                // Varredura ultra-rápida (500ms) para não perder a janela do candle de 1min
                this.scheduleNext(500); 
            }

        } catch (e) {
            console.error("Erro no Ciclo Auto:", e);
            this.scheduleNext(2000);
        }
    },

    scheduleNext(ms) {
        if (this._cycleTimeout) clearTimeout(this._cycleTimeout);
        if (this.isRunning && !app.isTrading) {
            this._cycleTimeout = setTimeout(() => this.runCycle(), ms);
        }
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        
        if (profit > 0) this.stats.wins++;
        else this.stats.losses++;
        this.stats.total++;
        
        this.updateUI(profit);
        
        if (this.isRunning) {
            // Pausa curta de 1.5s após fechar para o saldo atualizar e o mercado respirar
            this.scheduleNext(1500);
        }
    },

    checkLimits() {
        const tp = parseFloat(document.getElementById('a-tp')?.value || 0);
        const sl = parseFloat(document.getElementById('a-sl')?.value || 0);

        if (tp > 0 && this.currentProfit >= tp) {
            this.log(`META ATINGIDA: +$${this.currentProfit.toFixed(2)}`, "text-green-500 font-black text-xs");
            this.toggle();
            return true;
        }
        if (sl > 0 && this.currentProfit <= (sl * -1)) {
            this.log(`STOP LOSS ATINGIDO: -$${Math.abs(this.currentProfit).toFixed(2)}`, "text-red-500 font-black text-xs");
            this.toggle();
            return true;
        }
        return false;
    },

    updateUI(lastProfit) {
        const profitEl = document.getElementById('a-val-profit');
        if (profitEl) {
            profitEl.innerText = `${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        document.getElementById('a-stat-w').innerText = this.stats.wins;
        document.getElementById('a-stat-l').innerText = this.stats.losses;

        const color = lastProfit > 0 ? "text-green-400" : "text-red-400";
        const icon = lastProfit > 0 ? "✅" : "❌";
        this.log(`${icon} RESULTADO: ${lastProfit > 0 ? 'VITÓRIA' : 'DERROTA'} ($${lastProfit.toFixed(2)})`, `${color} font-bold`);
        
        // Sincroniza o status global no rodapé imediatamente
        const footerStatus = document.getElementById('status-text');
        if (footerStatus) footerStatus.innerText = `Sniper: ${lastProfit > 0 ? 'WIN' : 'LOSS'} ($${lastProfit.toFixed(2)})`;
    }
};
