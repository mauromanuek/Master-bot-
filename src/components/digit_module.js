const DigitModule = {
    tickBuffer: [],
    maxTicks: 15, // SNIPER: Reduzido de 20 para 15 para focar na explosão imediata
    isActive: false,
    currentProfit: 0,
    stats: { wins: 0, losses: 0 },
    _handler: null,

    render() {
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-yellow-500 italic uppercase leading-none">Digit Sniper</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">
                            Ativo: <span id="d-current-asset" class="text-yellow-600">${app.currentAsset || '---'}</span>
                        </span>
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
                        <input id="d-tp" type="number" value="5.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
                    </div>
                    <div>
                        <label class="text-[9px] text-red-500 uppercase font-bold tracking-wider">S.Loss</label>
                        <input id="d-sl" type="number" value="10.00" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-red-500 transition-colors">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div id="box-over" class="bg-gray-900 p-4 rounded-2xl border-2 border-transparent text-center transition-all duration-300">
                        <p class="text-[10px] text-gray-400 uppercase font-bold">Over 5</p>
                        <p id="perc-over" class="text-2xl font-black text-white">0%</p>
                        <div class="w-full bg-gray-800 h-1.5 mt-2 rounded-full overflow-hidden">
                            <div id="bar-over" class="bg-yellow-500 h-full transition-all duration-500" style="width: 0%"></div>
                        </div>
                    </div>
                    <div id="box-under" class="bg-gray-900 p-4 rounded-2xl border-2 border-transparent text-center transition-all duration-300">
                        <p class="text-[10px] text-gray-400 uppercase font-bold">Under 5</p>
                        <p id="perc-under" class="text-2xl font-black text-white">0%</p>
                        <div class="w-full bg-gray-800 h-1.5 mt-2 rounded-full overflow-hidden">
                            <div id="bar-under" class="bg-blue-500 h-full transition-all duration-500" style="width: 0%"></div>
                        </div>
                    </div>
                </div>

                <button id="btn-d-toggle" onclick="DigitModule.toggle()" class="w-full py-4 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Iniciar Operação Digits</button>
                
                <div id="d-status" class="bg-black p-3 rounded-xl h-24 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> Aguardando ticks da DerivAPI...</p>
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

    toggle() {
        this.isActive = !this.isActive;
        const btn = document.getElementById('btn-d-toggle');
        const indicator = document.getElementById('d-indicator');
        
        if (this.isActive) {
            btn.innerText = "PARAR OPERAÇÃO";
            btn.classList.replace('bg-yellow-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-yellow-500');
            indicator.classList.add('animate-pulse');
            
            this.tickBuffer = [];
            this.setupListener();
            this.log(`MODO DIGIT SNIPER ATIVADO`, "text-yellow-400 font-bold");
        } else {
            btn.innerText = "Iniciar Operação Digits";
            btn.classList.replace('bg-red-600', 'bg-yellow-600');
            indicator.classList.replace('bg-yellow-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            this.log("SISTEMA PAUSADO", "text-gray-500");
            app.isTrading = false;
        }
    },

    setupListener() {
        if (this._handler) document.removeEventListener('contract_finished', this._handler);
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'd') {
                // A DerivAPI dispara esse evento no milissegundo do fechamento
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    processTick(tick) {
        if (!this.isActive) return;

        const lastDigit = parseInt(tick.quote.toString().slice(-1));
        this.tickBuffer.push(lastDigit);
        
        if (this.tickBuffer.length > this.maxTicks) this.tickBuffer.shift();
        
        this.updateUI();

        // Só tenta entrar se o bot não estiver em uma operação aberta
        if (!app.isTrading) {
            this.checkEntry();
        }
    },

    updateUI() {
        const total = this.tickBuffer.length;
        if (total < 5) return;

        const over5 = this.tickBuffer.filter(d => d > 5).length;
        const under5 = this.tickBuffer.filter(d => d < 5).length;
        
        const pOver = Math.round((over5 / total) * 100);
        const pUnder = Math.round((under5 / total) * 100);

        document.getElementById('perc-over').innerText = pOver + "%";
        document.getElementById('perc-under').innerText = pUnder + "%";
        
        document.getElementById('bar-over').style.width = pOver + "%";
        document.getElementById('bar-under').style.width = pUnder + "%";

        const boxOver = document.getElementById('box-over');
        const boxUnder = document.getElementById('box-under');
        
        // Alerta visual de gatilho (70%+)
        boxOver.style.borderColor = pOver >= 70 ? '#eab308' : 'transparent';
        boxUnder.style.borderColor = pUnder >= 70 ? '#3b82f6' : 'transparent';
    },

    checkEntry() {
        // Reduzido para 10 ticks: sniper de alta frequência
        if (this.tickBuffer.length < 10 || app.isTrading) return;

        const total = this.tickBuffer.length;
        const pOver = (this.tickBuffer.filter(d => d > 5).length / total) * 100;
        const pUnder = (this.tickBuffer.filter(d => d < 5).length / total) * 100;
        
        const stake = document.getElementById('d-stake')?.value || 1;

        if (pOver >= 70) {
            this.execute('DIGITOVER', stake);
        } else if (pUnder >= 70) {
            this.execute('DIGITUNDER', stake);
        }
    },

    execute(type, stake) {
        if (app.isTrading) return;
        
        app.isTrading = true;
        this.log(`TIRO EXECUTADO: ${type}`, "text-yellow-500 font-bold");

        const params = { 
            barrier: "5", 
            duration: 1, 
            duration_unit: 't' 
        };
        
        DerivAPI.buy(type, stake, 'd', (res) => {
            if (res.error) {
                this.log(`API BUSY: ${res.error.message}`, "text-red-500");
                app.isTrading = false;
            } else {
                this.log("AGUARDANDO RESULTADO TICK...", "text-blue-400 animate-pulse");
            }
        }, params);
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        
        if (profit > 0) this.stats.wins++;
        else this.stats.losses++;

        const color = profit > 0 ? "text-green-400" : "text-red-400";
        const icon = profit > 0 ? "✅" : "❌";
        this.log(`${icon} RESULTADO: $${profit.toFixed(2)}`, `${color} font-bold`);
        
        // Limpa o buffer para ler o novo fluxo de mercado (Fuga de manipulação)
        this.tickBuffer = [];
        
        // Liberação instantânea para ler o próximo padrão
        app.isTrading = false;
        
        // Atualiza UI Global
        if (window.app) app.updateModuleProfit(profit, 'd');
    }
};
