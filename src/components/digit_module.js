const DigitModule = {
    tickBuffer: [],
    maxTicks: 20, // Reduzido para focar na micro-volatilidade recente
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
                    <p class="text-gray-600 italic">> Aguardando stream de ticks...</p>
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
        const assetText = document.getElementById('d-current-asset');
        
        if (this.isActive) {
            btn.innerText = "PARAR OPERAÇÃO";
            btn.classList.replace('bg-yellow-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-yellow-500');
            indicator.classList.add('animate-pulse');
            if(assetText) assetText.innerText = app.currentAsset;
            
            this.tickBuffer = [];
            this.setupListener();
            this.log(`ANALISANDO TICKS: ${app.currentAsset}`, "text-yellow-400 font-bold");
            
            // Subscrição via Maestro API
            DerivAPI.subscribeTicks((tick) => this.processTick(tick));
        } else {
            btn.innerText = "Iniciar Operação Digits";
            btn.classList.replace('bg-red-600', 'bg-yellow-600');
            indicator.classList.replace('bg-yellow-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            DerivAPI.unsubscribeTicks();
            this.log("SISTEMA PAUSADO", "text-gray-500");
        }
    },

    setupListener() {
        if (this._handler) document.removeEventListener('contract_finished', this._handler);
        this._handler = (e) => {
            if (e.detail && e.detail.prefix === 'd') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    processTick(tick) {
        if (!this.isActive || app.isTrading) return;

        // Pega o último dígito do quote
        const lastDigit = parseInt(tick.quote.toString().slice(-1));
        this.tickBuffer.push(lastDigit);
        
        // Mantém apenas o histórico necessário para scalping rápido
        if (this.tickBuffer.length > this.maxTicks) this.tickBuffer.shift();
        
        this.updateUI();
        this.checkEntry();
    },

    updateUI() {
        const total = this.tickBuffer.length;
        if (total < 5) return;

        // Cálculo estatístico
        const over5 = this.tickBuffer.filter(d => d > 5).length;
        const under5 = this.tickBuffer.filter(d => d < 5).length;
        
        const pOver = Math.round((over5 / total) * 100);
        const pUnder = Math.round((under5 / total) * 100);

        const elOver = document.getElementById('perc-over');
        const elUnder = document.getElementById('perc-under');
        if(elOver) elOver.innerText = pOver + "%";
        if(elUnder) elUnder.innerText = pUnder + "%";
        
        const bOver = document.getElementById('bar-over');
        const bUnder = document.getElementById('bar-under');
        if(bOver) bOver.style.width = pOver + "%";
        if(bUnder) bUnder.style.width = pUnder + "%";

        const boxOver = document.getElementById('box-over');
        const boxUnder = document.getElementById('box-under');
        
        // Feedback visual de zona de tiro (70%+)
        if(boxOver) boxOver.style.borderColor = pOver >= 70 ? '#eab308' : 'transparent';
        if(boxUnder) boxUnder.style.borderColor = pUnder >= 70 ? '#3b82f6' : 'transparent';
    },

    checkEntry() {
        // Amostragem mínima de 12 ticks para agressividade segura
        if (this.tickBuffer.length < 12 || app.isTrading) return;

        const total = this.tickBuffer.length;
        const pOver = (this.tickBuffer.filter(d => d > 5).length / total) * 100;
        const pUnder = (this.tickBuffer.filter(d => d < 5).length / total) * 100;
        
        const stake = document.getElementById('d-stake')?.value || 1;

        // GATILHO AGRESSIVO: 70% de dominância
        if (pOver >= 70) {
            this.execute('DIGITOVER', stake);
        } else if (pUnder >= 70) {
            this.execute('DIGITUNDER', stake);
        }
    },

    execute(type, stake) {
        if (app.isTrading) return;
        
        app.isTrading = true;
        this.log(`TIRO CONFIRMADO: ${type}`, "text-yellow-500 font-bold");

        // Configuração para 1 Tick (Máxima velocidade)
        const params = { 
            barrier: "5", 
            duration: 1, 
            duration_unit: 't' 
        };
        
        DerivAPI.buy(type, stake, 'd', (res) => {
            if (res.error) {
                this.log(`API REJEITOU: ${res.error.message}`, "text-red-500");
                app.isTrading = false;
            }
        }, params);
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        
        const color = profit > 0 ? "text-green-400" : "text-red-400";
        this.log(`WIN: +$${profit.toFixed(2)}`, color);
        
        // Flush do buffer para ler o novo padrão do mercado após o contrato
        this.tickBuffer = [];
        
        // Liberação rápida para nova análise
        setTimeout(() => {
            if (this.isActive) this.log("RESET DE BUFFER - LENDO NOVOS TICKS", "text-gray-600");
        }, 1000);
    }
};
