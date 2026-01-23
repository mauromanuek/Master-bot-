const DigitModule = {
    tickBuffer: [],
    maxTicks: 15, 
    isActive: false,
    currentProfit: 0,
    stats: { wins: 0, losses: 0 },
    _handler: null,

    render() {
        // Garantimos que o ativo atual seja exibido corretamente na abertura da aba
        const assetName = (window.app && app.currentAsset) ? app.currentAsset : "---";
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-yellow-500 italic uppercase leading-none">Digit Sniper</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">
                            Ativo: <span id="d-current-asset" class="text-yellow-600">${assetName}</span>
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
            btn.classList.remove('bg-yellow-600');
            btn.classList.add('bg-red-600');
            
            indicator.classList.remove('bg-gray-600');
            indicator.classList.add('bg-yellow-500', 'animate-pulse');
            
            this.tickBuffer = [];
            this.setupListener();
            this.log(`MODO DIGIT SNIPER ATIVADO EM ${app.currentAsset}`, "text-yellow-400 font-bold");
            
            // Atualiza o label do ativo caso tenha sido trocado
            const label = document.getElementById('d-current-asset');
            if(label) label.innerText = app.currentAsset;

        } else {
            btn.innerText = "Iniciar Operação Digits";
            btn.classList.remove('bg-red-600');
            btn.classList.add('bg-yellow-600');
            
            indicator.classList.remove('bg-yellow-500', 'animate-pulse');
            indicator.classList.add('bg-gray-600');
            
            this.log("SISTEMA PAUSADO", "text-gray-500");
            app.isTrading = false;
        }
    },

    setupListener() {
        // CORREÇÃO: Limpeza rigorosa do ouvinte de eventos
        if (this._handler) {
            document.removeEventListener('contract_finished', this._handler);
        }
        
        this._handler = (e) => {
            if (this.isActive && e.detail && e.detail.prefix === 'd') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    processTick(tick) {
        if (!this.isActive || !tick || !tick.quote) return;

        // Extrai o último dígito do preço
        const quoteStr = tick.quote.toString();
        const lastDigit = parseInt(quoteStr.charAt(quoteStr.length - 1));
        
        if (isNaN(lastDigit)) return;

        this.tickBuffer.push(lastDigit);
        
        // Mantém o buffer no tamanho sniper
        if (this.tickBuffer.length > this.maxTicks) {
            this.tickBuffer.shift();
        }
        
        this.updateUI();

        // Só verifica entrada se não houver operação em curso
        if (window.app && !app.isTrading) {
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

        const elOver = document.getElementById('perc-over');
        const elUnder = document.getElementById('perc-under');
        const barOver = document.getElementById('bar-over');
        const barUnder = document.getElementById('bar-under');

        if (elOver) elOver.innerText = pOver + "%";
        if (elUnder) elUnder.innerText = pUnder + "%";
        if (barOver) barOver.style.width = pOver + "%";
        if (barUnder) barUnder.style.width = pUnder + "%";

        const boxOver = document.getElementById('box-over');
        const boxUnder = document.getElementById('box-under');
        
        if (boxOver) boxOver.style.borderColor = pOver >= 70 ? '#eab308' : 'transparent';
        if (boxUnder) boxUnder.style.borderColor = pUnder >= 70 ? '#3b82f6' : 'transparent';
    },

    checkEntry() {
        if (this.tickBuffer.length < 10 || (window.app && app.isTrading)) return;

        const total = this.tickBuffer.length;
        const over5Count = this.tickBuffer.filter(d => d > 5).length;
        const under5Count = this.tickBuffer.filter(d => d < 5).length;
        
        const pOver = (over5Count / total) * 100;
        const pUnder = (under5Count / total) * 100;
        
        const stakeEl = document.getElementById('d-stake');
        const stake = stakeEl ? parseFloat(stakeEl.value) : 1.00;

        // Lógica de Gatilho Sniper: Prioridade para a maior probabilidade
        if (pOver >= 75) {
            this.execute('DIGITOVER', stake);
        } else if (pUnder >= 75) {
            this.execute('DIGITUNDER', stake);
        }
    },

    execute(type, stake) {
        if (window.app && app.isTrading) return;
        
        app.isTrading = true;
        this.log(`TIRO EXECUTADO: ${type}`, "text-yellow-500 font-bold");

        const params = { 
            barrier: "5", 
            duration: 1, 
            duration_unit: 't' 
        };
        
        DerivAPI.buy(type, stake, 'd', (res) => {
            if (res.error) {
                this.log(`FALHA: ${res.error.message}`, "text-red-500");
                app.isTrading = false;
            } else {
                this.log("EM MERCADO... AGUARDANDO TICK", "text-blue-400 animate-pulse");
            }
        }, params);
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        
        if (profit > 0) this.stats.wins++;
        else if (profit < 0) this.stats.losses++;

        const color = profit > 0 ? "text-green-400" : "text-red-400";
        const status = profit > 0 ? "WIN" : "LOSS";
        this.log(`RESULTADO: ${status} ($${profit.toFixed(2)})`, `${color} font-bold`);
        
        // CORREÇÃO: Limpa o buffer para evitar reentrada imediata no mesmo sinal (Anti-manipulação)
        this.tickBuffer = [];
        
        // Sincroniza com o App Principal
        if (window.app) {
            app.updateModuleProfit(profit, 'd');
            // O app.updateModuleProfit já seta app.isTrading = false
        }
    }
};
