const ManualModule = {
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
                        <h2 class="text-xl font-bold text-blue-500 italic uppercase leading-none">Manual Sniper Pro</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Sincronizado: <span id="m-current-asset" class="text-blue-400">${app.currentAsset || '---'}</span></span>
                    </div>
                    <div id="m-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Stake ($)</label>
                        <input id="m-stake" type="number" value="1.00" step="0.50" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-blue-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-green-500 uppercase font-bold tracking-wider">T.Profit</label>
                        <input id="m-tp" type="number" value="5.00" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-red-500 uppercase font-bold tracking-wider">S.Loss</label>
                        <input id="m-sl" type="number" value="10.00" step="1.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-red-500 transition-colors">
                    </div>
                </div>

                <button id="btn-m-start" onclick="ManualModule.toggle()" class="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Iniciar Monitoramento</button>
                
                <div class="grid grid-cols-2 gap-4">
                    <button id="btn-call" onclick="ManualModule.trade('CALL')" class="py-6 bg-green-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 transition-all transform active:scale-95 disabled:cursor-not-allowed border-b-4 border-green-800 flex flex-col items-center justify-center" disabled>
                        <span>CALL</span>
                        <span id="call-conf" class="text-[10px] opacity-60 font-mono">--%</span>
                    </button>
                    <button id="btn-put" onclick="ManualModule.trade('PUT')" class="py-6 bg-red-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 transition-all transform active:scale-95 disabled:cursor-not-allowed border-b-4 border-red-800 flex flex-col items-center justify-center" disabled>
                        <span>PUT</span>
                        <span id="put-conf" class="text-[10px] opacity-60 font-mono">--%</span>
                    </button>
                </div>

                <div id="m-status" class="bg-black p-3 rounded-xl h-32 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> Aguardando ativação...</p>
                </div>
                
                <div class="bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow-xl">
                    <div>
                        <p class="text-[9px] text-gray-500 uppercase font-bold">Saldo Sessão</p>
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
        const assetText = document.getElementById('m-current-asset');
        
        if (this.isActive) {
            btn.innerText = "PARAR MONITORAMENTO";
            btn.classList.replace('bg-blue-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-green-500');
            indicator.classList.add('animate-pulse');
            if(assetText) assetText.innerText = app.currentAsset;
            
            this.log("MODO SNIPER PRO ATIVO", "text-blue-400 font-bold");
            this.setupListener(); 
            this.runCycle();
        } else {
            if (this._analysisTimeout) clearTimeout(this._analysisTimeout);
            this.resetButtons();
            btn.innerText = "INICIAR MONITORAMENTO";
            btn.classList.replace('bg-red-600', 'bg-blue-600');
            indicator.classList.replace('bg-green-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            this.log("SISTEMA STANDBY", "text-yellow-600");
            app.isTrading = false;
        }
    },

    setupListener() {
        if (this._handler) document.removeEventListener('contract_finished', this._handler);
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'm') {
                // Sincronia instantânea com DerivAPI
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    async runCycle() {
        if (!this.isActive || app.isTrading) {
            this._analysisTimeout = setTimeout(() => this.runCycle(), 600);
            return;
        }
        if (this.checkLimits()) return;

        try {
            const veredito = await app.analista.obterVereditoCompleto();
            
            if (!this.isActive || app.isTrading) return;

            // Ativa os botões com 60% de confiança para dar tempo de reação ao humano
            if (veredito && veredito.confianca >= 60) {
                this.activateButtons(veredito.direcao.toLowerCase(), veredito.confianca);
                
                // O sinal manual dura 4 segundos ou até mudar a análise
                if (this._analysisTimeout) clearTimeout(this._analysisTimeout);
                this._analysisTimeout = setTimeout(() => {
                    if(!app.isTrading) {
                        this.resetButtons();
                        this.runCycle();
                    }
                }, 4000);
            } else {
                this.resetButtons();
                this._analysisTimeout = setTimeout(() => this.runCycle(), 600); 
            }
        } catch (e) {
            this._analysisTimeout = setTimeout(() => this.runCycle(), 1500);
        }
    },

    trade(side) {
        if (app.isTrading) return;
        const stake = document.getElementById('m-stake')?.value || 1;
        
        app.isTrading = true;
        this.resetButtons();
        this.log(`TIRO MANUAL: ${side}`, "text-white font-bold bg-blue-900 px-1");

        DerivAPI.buy(side, stake, 'm', (res) => {
            if (res.error) {
                this.log(`REJEITADO: ${res.error.message}`, "text-red-500");
                app.isTrading = false;
                this.runCycle();
            } else {
                this.log("ORDEM EM CURSO. Acompanhando...", "text-blue-300 animate-pulse");
            }
        });
    },

    activateButtons(side, confidence) {
        this.resetButtons();
        const btn = document.getElementById('btn-' + side);
        const confText = document.getElementById(side + '-conf');
        
        if (btn && !app.isTrading) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.classList.add('animate-pulse', 'border-white');
            if(confText) confText.innerText = confidence + "%";
        }
    },

    resetButtons() {
        ['btn-call', 'btn-put'].forEach(id => {
            const b = document.getElementById(id);
            const side = id.split('-')[1];
            const confText = document.getElementById(side + '-conf');
            
            if(b) {
                b.disabled = true;
                b.style.opacity = "0.2";
                b.classList.remove('animate-pulse', 'border-white');
                if(confText) confText.innerText = "--%";
            }
        });
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        if (profit > 0) this.stats.wins++;
        else this.stats.losses++;
        this.stats.total++;
        
        this.updateUI(profit);
        
        // Libera o estado de trading e volta a monitorar
        app.isTrading = false;
        if (this.isActive) {
            setTimeout(() => this.runCycle(), 1000);
        }
    },

    checkLimits() {
        const tp = parseFloat(document.getElementById('m-tp')?.value || 0);
        const sl = parseFloat(document.getElementById('m-sl')?.value || 0);
        if (tp > 0 && this.currentProfit >= tp) {
            this.log("ALVO ATINGIDO: SESSÃO ENCERRADA", "text-green-500 font-black");
            this.toggle(); return true;
        }
        if (sl > 0 && this.currentProfit <= (sl * -1)) {
            this.log("STOP ATINGIDO: PROTEÇÃO ATIVA", "text-red-500 font-black");
            this.toggle(); return true;
        }
        return false;
    },

    updateUI(lastProfit) {
        const profitEl = document.getElementById('m-val-profit');
        if (profitEl) {
            profitEl.innerText = `${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }
        document.getElementById('m-stat-w').innerText = this.stats.wins;
        document.getElementById('m-stat-l').innerText = this.stats.losses;
        
        const cor = lastProfit > 0 ? "text-green-400" : "text-red-400";
        this.log(`${lastProfit > 0 ? '✅ WIN' : '❌ LOSS'}: $${lastProfit.toFixed(2)}`, `${cor} font-bold`);
        
        // Atualiza saldo global no objeto principal
        if (window.app) app.updateModuleProfit(lastProfit, 'm');
    }
};
