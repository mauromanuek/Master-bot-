const AutoModule = {
    isRunning: false,
    isTrading: false,
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
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Quantitative Engine V1</span>
                    </div>
                    <div id="a-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <div>
                        <label class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Stake ($)</label>
                        <input id="a-stake" type="number" value="10.00" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-purple-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-green-500 font-bold uppercase tracking-wider">Take Profit</label>
                        <input id="a-tp" type="number" value="5" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-red-500 font-bold uppercase tracking-wider">Stop Loss</label>
                        <input id="a-sl" type="number" value="10" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-red-500 transition-colors">
                    </div>
                </div>

                <button id="btn-a-toggle" onclick="AutoModule.toggle()" class="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Iniciar Operação Sniper</button>
                
                <div id="a-status" class="bg-black p-3 rounded-xl h-40 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> [SISTEMA] Aguardando gatilho técnico para ${app.currentAsset}...</p>
                </div>
                
                <div class="bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow-xl">
                    <div>
                        <p class="text-[9px] text-gray-500 uppercase font-bold">Resultado da Sessão</p>
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
            this.log(`MODO SNIPER ATIVADO EM ${app.currentAsset}`, "text-purple-400 font-bold");
            this.setupListener(); 
            this.runCycle();
        } else {
            if (this._cycleTimeout) clearTimeout(this._cycleTimeout);
            btn.innerText = "INICIAR OPERAÇÃO SNIPER";
            btn.classList.replace('bg-red-600', 'bg-purple-600');
            indicator.classList.replace('bg-purple-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            this.log("ROBÔ DESATIVADO", "text-yellow-600");
            this.isTrading = false;
        }
    },

    setupListener() {
        if (this._handler) {
            document.removeEventListener('contract_finished', this._handler);
        }
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'a') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    async runCycle() {
        if (!this.isRunning || this.isTrading) return;
        if (this.checkLimits()) return;

        const assetAtStart = app.currentAsset;
        
        try {
            // A engine agora é ultra-rápida, então removemos logs de "Analisando..." para não poluir
            const veredito = await app.analista.obterVereditoCompleto();
            
            if (!this.isRunning || this.isTrading || !veredito) {
                this.scheduleNext(1000); // Tenta novamente em 1s
                return;
            }

            // Gatilho Sniper: Confiança mínima para o automático é 70%
            if ((veredito.direcao === "CALL" || veredito.direcao === "PUT") && veredito.confianca >= 70) {
                const stake = document.getElementById('a-stake')?.value || 10;
                
                this.log(`ALVO DETECTADO: ${veredito.direcao} (${veredito.confianca}%)`, "text-green-500 font-bold");
                this.log(`MOTIVO: ${veredito.motivo}`, "text-gray-500 text-[9px]");
                
                this.isTrading = true;
                
                DerivAPI.buy(veredito.direcao, stake, 'a', (res) => {
                    if (res.error) {
                        this.log(`ERRO DE EXECUÇÃO: ${res.error.message}`, "text-red-500");
                        this.isTrading = false;
                        this.scheduleNext(2000);
                    }
                });
            } else {
                // Em modo automático, não logamos "sinal insuficiente" para economizar memória e performance
                this.scheduleNext(1000); 
            }

        } catch (e) {
            this.log(`FALHA NA ENGINE: ${e.message}`, "text-orange-500");
            this.isTrading = false;
            this.scheduleNext(3000);
        }
    },

    scheduleNext(ms) {
        if (this._cycleTimeout) clearTimeout(this._cycleTimeout);
        if (this.isRunning && !this.isTrading) {
            this._cycleTimeout = setTimeout(() => this.runCycle(), ms);
        }
    },

    handleContractResult(profit) {
        this.isTrading = false;
        this.currentProfit += profit;
        
        this.stats.total++;
        if (profit > 0) this.stats.wins++;
        else this.stats.losses++;
        
        this.updateUI(profit);

        if (this.isRunning) {
            // Reduzido tempo de espera pós-operação para aproveitar sequências (Trends)
            this.scheduleNext(1500);
        }
    },

    checkLimits() {
        const tp = parseFloat(document.getElementById('a-tp')?.value || 0);
        const sl = parseFloat(document.getElementById('a-sl')?.value || 0);

        if (this.currentProfit >= tp && tp > 0) {
            this.log(`TAKE PROFIT ATINGIDO: +$${this.currentProfit.toFixed(2)}`, "text-green-500 font-black");
            this.toggle();
            return true;
        }
        if (this.currentProfit <= (sl * -1) && sl > 0) {
            this.log(`STOP LOSS ATINGIDO: -$${Math.abs(this.currentProfit).toFixed(2)}`, "text-red-500 font-black");
            this.toggle();
            return true;
        }
        return false;
    },

    updateUI(lastProfit) {
        const profitEl = document.getElementById('a-val-profit');
        if (profitEl) {
            const prefix = this.currentProfit >= 0 ? '+' : '';
            profitEl.innerText = `${prefix}${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        if (document.getElementById('a-stat-w')) document.getElementById('a-stat-w').innerText = this.stats.wins;
        if (document.getElementById('a-stat-l')) document.getElementById('a-stat-l').innerText = this.stats.losses;

        const color = lastProfit > 0 ? "text-green-500" : "text-red-500";
        this.log(`RESULTADO: ${lastProfit > 0 ? 'PROFIT' : 'LOSS'} (${lastProfit.toFixed(2)} USD)`, color);
        
        // Sincroniza com o rodapé global do app
        if (typeof app.updateModuleProfit === 'function') {
            app.stats.wins = this.stats.wins; // Sincroniza estatísticas globais
            app.stats.losses = this.stats.losses;
        }
    }
};
