const AutoModule = {
    isRunning: false,
    isTrading: false,
    currentProfit: 0,
    stats: { wins: 0, losses: 0, total: 0 },
    _handler: null,

    render() {
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-purple-500 italic uppercase leading-none">Auto Scalper Pro</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">IA-Driven Engine</span>
                    </div>
                    <div id="a-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm"></div>
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

                <button id="btn-a-toggle" onclick="AutoModule.toggle()" class="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold uppercase shadow-lg transition-all active:scale-95 text-white">Iniciar Robô</button>
                
                <div id="a-status" class="bg-black p-3 rounded-xl h-40 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> [SISTEMA] Aguardando comando para o ativo ${app.currentAsset}...</p>
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
            btn.innerText = "DESATIVAR ROBÔ";
            btn.classList.replace('bg-purple-600', 'bg-red-600');
            indicator.classList.replace('bg-gray-600', 'bg-purple-500');
            indicator.classList.add('animate-pulse');
            this.log(`MODO AUTOMÁTICO ATIVADO EM ${app.currentAsset}`, "text-purple-400 font-bold");
            this.setupListener(); 
            this.runCycle();
        } else {
            btn.innerText = "INICIAR ROBÔ";
            btn.classList.replace('bg-red-600', 'bg-purple-600');
            indicator.classList.replace('bg-purple-500', 'bg-gray-600');
            indicator.classList.remove('animate-pulse');
            this.log("SISTEMA PAUSADO PELO USUÁRIO", "text-yellow-600");
            this.isTrading = false;
        }
    },

    setupListener() {
        // Remove listener antigo para evitar execuções duplicadas e vazamento de memória
        if (this._handler) document.removeEventListener('contract_finished', this._handler);
        this._handler = (e) => {
            if (e.detail.prefix === 'a') {
                this.handleContractResult(e.detail.profit);
            }
        };
        document.addEventListener('contract_finished', this._handler);
    },

    async runCycle() {
        // Bloqueia se já estiver operando ou se o robô estiver desligado
        if (!this.isRunning || this.isTrading) return;

        // Verifica limites de Stop Loss e Take Profit
        if (this.checkLimits()) return;

        const targetAsset = app.currentAsset;
        this.log(`ANALISANDO ${targetAsset} (Llama 3.3)...`, "text-blue-400");
        
        try {
            // Obtém veredito do Analista Geral (que já está sincronizado com o Ativo Global)
            const veredito = await app.analista.obterVereditoCompleto();
            
            if (!this.isRunning) return;

            // Filtro de Confiança Calibrado para Scalping (Mínimo 55%)
            if ((veredito.direcao === "CALL" || veredito.direcao === "PUT") && veredito.confianca >= 55) {
                
                const stake = document.getElementById('a-stake').value;
                this.log(`SINAL IA: ${veredito.direcao} (${veredito.confianca}%) NO ATIVO ${targetAsset}`, "text-green-500 font-bold");

                this.isTrading = true;
                
                // Realiza a compra via DerivAPI garantindo o prefixo 'a' para lucro automático
                DerivAPI.buy(veredito.direcao, stake, 'a', (res) => {
                    if (res.error) {
                        this.log(`ERRO NA COMPRA: ${res.error.message}`, "text-red-500");
                        this.isTrading = false;
                        setTimeout(() => this.runCycle(), 3000);
                    }
                });
            } else {
                this.log(`SINAL FRACO OU NEUTRO (${veredito.confianca}%). REAVALIANDO...`, "text-gray-600 italic");
                setTimeout(() => this.runCycle(), 3000);
            }

        } catch (e) {
            this.log("CONEXÃO IA INSTÁVEL - FALLBACK TÉCNICO", "text-orange-500");
            const local = app.analista.calcularIndicadoresLocais();
            
            let direcao = "WAIT";
            // Lógica técnica agressiva para fallback local
            if (local.isMartelo || (local.tendenciaDow === "ALTA" && local.rsi < 60)) direcao = "CALL";
            else if (local.rsi > 70) direcao = "PUT";

            if (direcao !== "WAIT" && this.isRunning) {
                this.isTrading = true;
                this.log(`ENTRADA TÉCNICA EM ${targetAsset}: ${direcao} (RSI: ${local.rsi})`, "text-orange-400");
                DerivAPI.buy(direcao, document.getElementById('a-stake').value, 'a', (res) => {
                    if (res.error) { 
                        this.isTrading = false; 
                        setTimeout(() => this.runCycle(), 3000); 
                    }
                });
            } else {
                setTimeout(() => this.runCycle(), 3000);
            }
        }
    },

    handleContractResult(profit) {
        this.isTrading = false;
        this.currentProfit += profit;
        
        this.stats.total++;
        profit > 0 ? this.stats.wins++ : this.stats.losses++;
        
        this.updateUI(profit);

        if (this.isRunning) {
            // Ciclo de alta frequência: 1.5s após o término para nova análise
            this.log(`ORDEM FINALIZADA EM ${app.currentAsset}: ${profit > 0 ? 'WIN' : 'LOSS'}`, "text-gray-500");
            setTimeout(() => this.runCycle(), 1500);
        }
    },

    checkLimits() {
        const tpInput = document.getElementById('a-tp');
        const slInput = document.getElementById('a-sl');
        if (!tpInput || !slInput) return false;

        const tp = parseFloat(tpInput.value);
        const sl = parseFloat(slInput.value);

        if (this.currentProfit >= tp) {
            this.log(`META DE LUCRO (${tp} USD) ATINGIDA!`, "text-green-500 font-black");
            this.toggle();
            return true;
        }
        if (this.currentProfit <= (sl * -1)) {
            this.log(`LIMITE DE PERDA (-${sl} USD) ATINGIDO!`, "text-red-500 font-black");
            this.toggle();
            return true;
        }
        return false;
    },

    updateUI(lastProfit) {
        const profitEl = document.getElementById('a-val-profit');
        if (profitEl) {
            profitEl.innerText = `${(this.currentProfit >= 0 ? '+' : '')}${this.currentProfit.toFixed(2)} USD`;
            profitEl.className = `text-xl font-black ${this.currentProfit >= 0 ? 'text-green-500' : 'text-red-500'}`;
        }

        const winStat = document.getElementById('a-stat-w');
        const lossStat = document.getElementById('a-stat-l');
        if (winStat) winStat.innerText = this.stats.wins;
        if (lossStat) lossStat.innerText = this.stats.losses;
    }
};
