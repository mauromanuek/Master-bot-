const DigitModule = {
    tickBuffer: [],
    maxTicks: 50,
    isAnalysisRunning: false,
    isTrading: false,
    currentProfit: 0,
    stats: { wins: 0, losses: 0 },
    _handler: null,

    render() {
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-yellow-500 italic uppercase leading-none">Digit Strategy</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Sincronizado: <span id="d-current-asset">${app.currentAsset}</span></span>
                    </div>
                    <div id="d-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>

                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Stake ($)</label>
                        <input id="d-stake" type="number" value="1.00" step="0.50" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-yellow-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-green-500 uppercase font-bold tracking-wider">T.Profit</label>
                        <input id="d-tp" type="number" value="5" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-red-500 uppercase font-bold tracking-wider">S.Loss</label>
                        <input id="d-sl" type="number" value="10" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-red-500 transition-colors">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div id="box-over" class="bg-gray-900 p-4 rounded-2xl border-2 border-transparent text-center transition-all duration-500">
                        <p class="text-[10px] text-gray-400 uppercase font-bold">Digit Over (5)</p>
                        <p id="perc-over" class="text-2xl font-black text-white">0%</p>
                    </div>
                    <div id="box-under" class="bg-gray-900 p-4 rounded-2xl border-2 border-transparent text-center transition-all duration-500">
                        <p class="text-[10px] text-gray-400 uppercase font-bold">Digit Under (5)</p>
                        <p id="perc-under" class="text-2xl font-black text-white">0%</p>
                    </div>
                </div>

                <button id="btn-d-toggle" onclick="DigitModule.analyze()" class="w-full py-4 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Analisar & Operar</button>
                
                <div id="d-status" class="bg-black p-3 rounded-xl h-24 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> [SISTEMA] Aguardando ticks de ${app.currentAsset}...</p>
                </div>

                <div class="bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow-xl">
                    <div>
                        <p class="text-[9px] text-gray-500 uppercase font-bold">Lucro Módulo</p>
                        <p id="d-val-profit" class="text-xl font-black text-gray-600">0.00 USD</p>
                    </div>
                    <div class="text-right text-[10px] font-bold font-mono space-y-1 bg-black/40 p-2 rounded-lg">
                        <p class="text-green-500">W: <span id="d-stat-w">0</span></p>
                        <p class="text-red-500">L: <span id="d-stat-l">0</span></p>
                    </div>
                </div>
            </div>`;
    },

    log(msg, color = "text-gray-400") {
        const status = document.getElementById('d-status');
        if (status) {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            status.innerHTML += `<p class="${color}">[${time}] ${msg}</p>`;
            status.scrollTop = status.scrollHeight;
        }
    },

    analyze() {
        this.isAnalysisRunning = !this.isAnalysisRunning;
        const btn = document.getElementById('btn-d-toggle');
        const indicator = document.getElementById('d-indicator');
        
        if (this.isAnalysisRunning) {
            btn.innerText = "PARAR OPERAÇÃO";
            btn.classList.replace('bg-yellow-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-yellow-500');
            indicator.classList.add('animate-pulse');
            
            this.tickBuffer = []; // Limpa buffer ao iniciar
            this.log(`ESTRATÉGIA DIGITS ATIVA EM ${app.currentAsset}`, "text-yellow-400 font-bold");
            
            this.setupListeners();
        } else {
            btn.innerText = "ANALISAR & OPERAR";
            btn.classList.replace('bg-red-600', 'bg-yellow-600');
            indicator.classList.replace('bg-yellow-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            
            this.isTrading = false;
            this.log("ESTRATÉGIA PAUSADA", "text-yellow-600");
        }
    },

    processTick(tickData) {
        // CORREÇÃO: Bloqueio rigoroso de ativo e estado
        if (!this.isAnalysisRunning) return;
        if (tickData.symbol !== app.currentAsset) {
            this.tickBuffer = []; // Reset se houver troca de ativo repentina
            const assetLabel = document.getElementById('d-current-asset');
            if (assetLabel) assetLabel.innerText = app.currentAsset;
            return;
        }

        // Extração robusta do último dígito (considerando strings e números)
        const quoteStr = tickData.quote.toString();
        const lastDigit = parseInt(quoteStr.charAt(quoteStr.length - 1));
        
        if (!isNaN(lastDigit)) {
            this.tickBuffer.push(lastDigit);
            if (this.tickBuffer.length > this.maxTicks) this.tickBuffer.shift();
            
            this.updateUI();
            this.checkStrategy();
        }
    },

    updateUI() {
        const total = this.tickBuffer.length;
        if (total === 0) return;

        const over5 = this.tickBuffer.filter(d => d > 5).length;
        const under5 = this.tickBuffer.filter(d => d < 5).length;
        
        const pOver = Math.round((over5 / total) * 100);
        const pUnder = Math.round((under5 / total) * 100);

        const overEl = document.getElementById('perc-over');
        const underEl = document.getElementById('perc-under');
        const boxOver = document.getElementById('box-over');
        const boxUnder = document.getElementById('box-under');
        
        if (overEl) overEl.innerText = pOver + "%";
        if (underEl) underEl.innerText = pUnder + "%";

        if (boxOver) {
            boxOver.className = `bg-gray-900 p-4 rounded-2xl border-2 text-center transition-all duration-300 ${pOver >= 65 ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'border-transparent'}`;
        }
        if (boxUnder) {
            boxUnder.className = `bg-gray-900 p-4 rounded-2xl border-2 text-center transition-all duration-300 ${pUnder >= 65 ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-transparent'}`;
        }
    },

    checkStrategy() {
        if (this.isTrading || !this.isAnalysisRunning || this.tickBuffer.length < 25) return;

        if (this.checkLimits()) return;

        const total = this.tickBuffer.length;
        const pOver = (this.tickBuffer.filter(d => d > 5).length / total) * 100;
        const pUnder = (this.tickBuffer.filter(d => d < 5).length / total) * 100;
        
        const stake = parseFloat(document.getElementById('d-stake')?.value || 1.00);

        // Gatilho de confiança em 70%
        if (pOver >= 70) {
            this.executeTrade('DIGITOVER', stake);
        } else if (pUnder >= 70) {
            this.executeTrade('DIGITUNDER', stake);
        }
    },

    executeTrade(type, stake) {
        this.isTrading = true;
        this.log(`PADRÃO DETECTADO: ${type} (Over 70%)`, "text-green-400 font-bold");

        // Parâmetros obrigatórios para Digits na Deriv
        const extraParams = { 
            barrier: "5", 
            duration: 1, 
            duration_unit: 't' 
        };

        DerivAPI.buy(type, stake, 'd', (res) => {
            if (res.error) {
                this.log(`ERRO NA COMPRA: ${res.error.message}`, "text-red-500");
                this.isTrading = false;
            }
        }, extraParams);
    },

    setupListeners() {
        if (this._handler) document.removeEventListener('contract_finished', this._handler);
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'd') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        if (profit > 0) this.stats.wins++;
        else this.stats.losses++;
        
        this.updateUI_Stats(profit);

        if (typeof app.updateModuleProfit === 'function') {
            app.updateModuleProfit(profit, 'd');
        }

        // Delay de segurança entre operações de dígitos para evitar sobreposição
        setTimeout(() => {
            this.isTrading = false;
            if (this.isAnalysisRunning) {
                this.log("RETOMANDO MONITORAMENTO DE TICKS...", "text-gray-500");
            }
        }, 2500);
    },

    checkLimits() {
        const tp = parseFloat(document.getElementById('d-tp')?.value || 0);
        const sl = parseFloat(document.getElementById('d-sl')?.value || 0);

        if (this.currentProfit >= tp && tp > 0) {
            this.log(`META ATINGIDA: +${this.currentProfit.toFixed(2)}`, "text-green-500 font-black");
            this.analyze();
            return true;
        }
        if (this.currentProfit <= (sl * -1) && sl > 0) {
            this.log(`STOP LOSS ATINGIDO: ${this.currentProfit.toFixed(2)}`, "text-red-500 font-black");
            this.analyze();
            return true;
        }
        return false;
    },

    updateUI_Stats(lastProfit) {
        const profitEl = document.getElementById('d-val-profit');
        if (profitEl) {
            const prefix = this.currentProfit >= 0 ? '+' : '';
            profitEl.innerText = `${prefix}${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        if (document.getElementById('d-stat-w')) document.getElementById('d-stat-w').innerText = this.stats.wins;
        if (document.getElementById('d-stat-l')) document.getElementById('d-stat-l').innerText = this.stats.losses;

        const color = lastProfit > 0 ? "text-green-500" : "text-red-500";
        this.log(`CONTRATO: ${lastProfit > 0 ? 'WIN' : 'LOSS'} (${lastProfit.toFixed(2)})`, color);
    }
};
