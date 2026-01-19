const ManualModule = {
    isTrading: false,
    isActive: false, 
    currentProfit: 0,
    stats: { wins: 0, losses: 0, total: 0 },
    _handler: null,
    _analysisTimeout: null,

    render() {
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-green-500 italic uppercase leading-none">Manual Pro</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Sincronizado: ${app.currentAsset}</span>
                    </div>
                    <div id="m-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Stake ($)</label>
                        <input id="m-stake" type="number" value="10.00" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-green-500 uppercase font-bold tracking-wider">T.Profit</label>
                        <input id="m-tp" type="number" value="5" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-red-500 uppercase font-bold tracking-wider">S.Loss</label>
                        <input id="m-sl" type="number" value="10" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-red-500 transition-colors">
                    </div>
                </div>

                <button id="btn-m-start" onclick="ManualModule.toggle()" class="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Iniciar Monitoramento</button>
                
                <div class="grid grid-cols-2 gap-4">
                    <button id="btn-call" onclick="ManualModule.trade('CALL')" class="py-6 bg-green-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 transition-all transform active:scale-95 disabled:cursor-not-allowed" disabled>CALL</button>
                    <button id="btn-put" onclick="ManualModule.trade('PUT')" class="py-6 bg-red-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 transition-all transform active:scale-95 disabled:cursor-not-allowed" disabled>PUT</button>
                </div>

                <div id="m-status" class="bg-black p-3 rounded-xl h-32 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> [SISTEMA] Modo Manual aguardando início...</p>
                </div>
                
                <div class="bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow-xl">
                    <div>
                        <p class="text-[9px] text-gray-500 uppercase font-bold">Lucro Acumulado</p>
                        <p id="m-val-profit" class="text-xl font-black text-gray-600">0.00 USD</p>
                    </div>
                    <div class="text-right text-[10px] font-bold font-mono space-y-1 bg-black/40 p-2 rounded-lg">
                        <p class="text-green-500">W: <span id="m-stat-w">0</span></p>
                        <p class="text-red-500">L: <span id="m-stat-l">0</span></p>
                    </div>
                </div>
            </div>`;
    },

    log(msg, color = "text-gray-400") {
        const status = document.getElementById('m-status');
        if (status) {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            status.innerHTML += `<p class="${color}">[${time}] ${msg}</p>`;
            status.scrollTop = status.scrollHeight;
        }
    },

    toggle() {
        this.isActive = !this.isActive;
        const btn = document.getElementById('btn-m-start');
        const indicator = document.getElementById('m-indicator');

        if (this.isActive) {
            btn.innerText = "Parar Monitoramento";
            btn.classList.replace('bg-blue-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-green-500');
            indicator.classList.add('animate-pulse');
            this.log(`MONITORANDO ATIVO: ${app.currentAsset}`, "text-blue-400 font-bold");
            this.setupListener();
            this.runCycle();
        } else {
            if (this._analysisTimeout) clearTimeout(this._analysisTimeout);
            btn.innerText = "Iniciar Monitoramento";
            btn.classList.replace('bg-red-600', 'bg-blue-600');
            indicator.classList.replace('bg-green-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            this.log("SISTEMA MANUAL EM STANDBY", "text-yellow-600");
            this.resetButtons();
            this.isTrading = false;
        }
    },

    setupListener() {
        if (this._handler) {
            document.removeEventListener('contract_finished', this._handler);
        }
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'm') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    async runCycle() {
        if (!this.isActive || this.isTrading) return;
        if (this.checkLimits()) return;

        this.log(`IA ANALISANDO ${app.currentAsset}...`, "text-gray-500");
        this.resetButtons();

        try {
            const veredito = await app.analista.obterVereditoCompleto(app.currentAsset);
            
            if (!this.isActive || this.isTrading) return;

            if (veredito && (veredito.direcao === "CALL" || veredito.direcao === "PUT") && veredito.confianca >= 55) {
                const side = veredito.direcao.toLowerCase();
                const target = document.getElementById('btn-' + side);
                
                if(target) {
                    target.disabled = false;
                    target.style.opacity = "1";
                    target.classList.add('animate-pulse');
                    this.log(`IA LIBEROU ${veredito.direcao} (${veredito.confianca}%)`, "text-green-500 font-bold");
                    
                    // Validade do sinal: 15 segundos
                    if (this._analysisTimeout) clearTimeout(this._analysisTimeout);
                    this._analysisTimeout = setTimeout(() => {
                        if(!this.isTrading && this.isActive) {
                            this.log("SINAL EXPIRADO. REANALISANDO...", "text-gray-500");
                            this.runCycle();
                        }
                    }, 15000);
                }
            } else {
                this.log(`MERCADO INCERTO (${veredito?.confianca || 0}%). REAVALIANDO...`, "text-gray-600");
                this._analysisTimeout = setTimeout(() => this.runCycle(), 5000);
            }
        } catch (e) {
            this.log("ERRO NA CONEXÃO IA.", "text-red-400");
            this._analysisTimeout = setTimeout(() => this.runCycle(), 7000);
        }
    },

    trade(type) {
        if (this.isTrading || !this.isActive) return;

        this.isTrading = true;
        const stake = document.getElementById('m-stake')?.value || 10;

        this.log(`MANUAL: EXECUTANDO ${type}...`, "text-yellow-400 font-bold");
        this.resetButtons();

        DerivAPI.buy(type, stake, 'm', (res) => {
            if (res.error) {
                this.log(`ERRO: ${res.error.message}`, "text-red-500");
                this.isTrading = false;
                this._analysisTimeout = setTimeout(() => this.runCycle(), 3000);
            }
        });
    },

    handleContractResult(profit) {
        this.isTrading = false;
        this.currentProfit += profit;
        
        this.stats.total++;
        if (profit > 0) this.stats.wins++;
        else this.stats.losses++;
        
        this.updateUI(profit);

        // SINCRONIZAÇÃO COM FOOTER E GLOBAL
        if (typeof app.updateModuleProfit === 'function') {
            app.updateModuleProfit(profit, 'm');
        }

        if (this.isActive) {
            this.log("CICLO CONCLUÍDO. REANALISANDO EM 2s...", "text-blue-400");
            this._analysisTimeout = setTimeout(() => this.runCycle(), 2000);
        }
    },

    checkLimits() {
        const tp = parseFloat(document.getElementById('m-tp')?.value || 0);
        const sl = parseFloat(document.getElementById('m-sl')?.value || 0);

        if (this.currentProfit >= tp && tp > 0) {
            this.log(`META ALCANÇADA: +${this.currentProfit.toFixed(2)}`, "text-green-500 font-black");
            this.toggle();
            return true;
        }
        if (this.currentProfit <= (sl * -1) && sl > 0) {
            this.log(`STOP LOSS ATINGIDO: ${this.currentProfit.toFixed(2)}`, "text-red-500 font-black");
            this.toggle();
            return true;
        }
        return false;
    },

    updateUI(lastProfit) {
        const profitEl = document.getElementById('m-val-profit');
        if (profitEl) {
            const prefix = this.currentProfit >= 0 ? '+' : '';
            profitEl.innerText = `${prefix}${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        if(document.getElementById('m-stat-w')) document.getElementById('m-stat-w').innerText = this.stats.wins;
        if(document.getElementById('m-stat-l')) document.getElementById('m-stat-l').innerText = this.stats.losses;

        const color = lastProfit > 0 ? 'text-green-500' : 'text-red-500';
        this.log(`RESULTADO: ${lastProfit > 0 ? 'WIN' : 'LOSS'} (${lastProfit.toFixed(2)} USD)`, color);
    },

    resetButtons() {
        ['btn-call', 'btn-put'].forEach(id => {
            const b = document.getElementById(id);
            if(b) {
                b.disabled = true;
                b.style.opacity = "0.2";
                b.classList.remove('animate-pulse');
            }
        });
    }
};
