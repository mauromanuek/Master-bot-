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
                        <h2 class="text-xl font-bold text-green-500 italic uppercase leading-none">Manual Sniper Pro</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Sincronizado: ${app.currentAsset}</span>
                    </div>
                    <div id="m-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Stake ($)</label>
                        <input id="m-stake" type="number" value="1.00" step="0.50" class="w-full bg-black p-2 rounded text-xs text-white border border-gray-800 outline-none focus:border-green-500 transition-colors">
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
                    <button id="btn-call" onclick="ManualModule.trade('CALL')" class="py-6 bg-green-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 transition-all transform active:scale-95 disabled:cursor-not-allowed border-b-4 border-green-800" disabled>CALL</button>
                    <button id="btn-put" onclick="ManualModule.trade('PUT')" class="py-6 bg-red-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 transition-all transform active:scale-95 disabled:cursor-not-allowed border-b-4 border-red-800" disabled>PUT</button>
                </div>

                <div id="m-status" class="bg-black p-3 rounded-xl h-32 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner custom-scrollbar">
                    <p class="text-gray-600 italic">> [SISTEMA] Modo Manual aguardando comando...</p>
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

    // ... (Mantém log, toggle, setupListener conforme seu código)

    async runCycle() {
        if (!this.isActive || this.isTrading) return;
        if (this.checkLimits()) return;

        try {
            const veredito = await app.analista.obterVereditoCompleto();
            
            if (!this.isActive || this.isTrading) return;

            // No manual, 65% já é um bom sinal para alertar o trader
            if (veredito && veredito.confianca >= 65 && (veredito.direcao === "CALL" || veredito.direcao === "PUT")) {
                this.activateButtons(veredito.direcao.toLowerCase());
                this.log(`ALERTA: Oportunidade de ${veredito.direcao} (${veredito.confianca}%)`, "text-green-400");
                
                // O sinal fica ativo por 10s, depois reinicia a análise
                if (this._analysisTimeout) clearTimeout(this._analysisTimeout);
                this._analysisTimeout = setTimeout(() => {
                    if(!this.isTrading) {
                        this.resetButtons();
                        this.runCycle();
                    }
                }, 10000);
            } else {
                this.resetButtons();
                this._analysisTimeout = setTimeout(() => this.runCycle(), 1500); 
            }
        } catch (e) {
            this._analysisTimeout = setTimeout(() => this.runCycle(), 3000);
        }
    },

    activateButtons(side) {
        this.resetButtons();
        const btn = document.getElementById('btn-' + side);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.classList.add('animate-pulse', 'ring-4', 'ring-white/20');
        }
    },

    resetButtons() {
        ['btn-call', 'btn-put'].forEach(id => {
            const b = document.getElementById(id);
            if(b) {
                b.disabled = true;
                b.style.opacity = "0.2";
                b.classList.remove('animate-pulse', 'ring-4', 'ring-white/20');
            }
        });
    },

    // ... (Mantém trade, handleContractResult, checkLimits e updateUI)
};
