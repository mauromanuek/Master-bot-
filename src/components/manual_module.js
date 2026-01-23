const ManualModule = {
    isActive: false, 
    currentProfit: 0,
    stats: { wins: 0, losses: 0 },
    _handler: null,

    render() {
        const asset = (window.app) ? app.currentAsset : "---";
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-blue-500 italic uppercase leading-none">Manual Sniper Pro</h2>
                        <span class="text-[8px] text-gray-500 font-mono uppercase tracking-widest">Sincronizado: <span class="text-blue-400">${asset}</span></span>
                    </div>
                    <div id="m-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm transition-colors"></div>
                </div>
                
                <div class="grid grid-cols-3 gap-2 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
                    <input id="m-stake" type="number" value="1.00" class="bg-black p-2 rounded text-xs text-white border border-gray-800">
                    <input id="m-tp" type="number" value="5.00" class="bg-black p-2 rounded text-xs text-white border border-green-900">
                    <input id="m-sl" type="number" value="10.00" class="bg-black p-2 rounded text-xs text-white border border-red-900">
                </div>

                <button id="btn-m-start" onclick="ManualModule.toggle()" class="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold uppercase transition-all">Iniciar Monitoramento</button>
                
                <div class="grid grid-cols-2 gap-4">
                    <button id="btn-call" onclick="ManualModule.trade('CALL')" class="py-6 bg-green-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 disabled:cursor-not-allowed border-b-4 border-green-800" disabled>CALL</button>
                    <button id="btn-put" onclick="ManualModule.trade('PUT')" class="py-6 bg-red-600 rounded-2xl font-black text-2xl shadow-lg opacity-20 disabled:cursor-not-allowed border-b-4 border-red-800" disabled>PUT</button>
                </div>

                <div id="m-status" class="bg-black p-3 rounded-xl h-32 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900 shadow-inner">
                    <p class="text-gray-600 italic">> Aguardando ativação...</p>
                </div>
            </div>`;
    },

    log(msg, color = "text-gray-400") {
        const status = document.getElementById('m-status');
        if (status) {
            status.innerHTML += `<p class="${color}">> ${msg}</p>`;
            status.scrollTop = status.scrollHeight;
        }
    },

    toggle() {
        this.isActive = !this.isActive;
        const btn = document.getElementById('btn-m-start');
        btn.innerText = this.isActive ? "PARAR MONITORAMENTO" : "INICIAR MONITORAMENTO";
        btn.classList.toggle('bg-red-600', this.isActive);
        if (this.isActive) {
            this.log("SISTEMA QUANTITATIVO ATIVO. Aguardando confluência...", "text-blue-400");
            this.run();
        } else {
            this.resetButtons();
            app.isTrading = false;
        }
    },

    async run() {
        if (!this.isActive || app.isTrading) return;
        const v = await app.analista.obterVereditoCompleto();
        
        if (v.direcao === "CALL" || v.direcao === "PUT") {
            this.activateButton(v.direcao.toLowerCase(), v.confianca);
        } else {
            this.resetButtons();
        }
        setTimeout(() => this.run(), 1000);
    },

    activateButton(side, conf) {
        this.resetButtons();
        const btn = document.getElementById('btn-' + side);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.classList.add('animate-pulse');
            btn.innerHTML = `${side.toUpperCase()}<br><span class="text-[10px]">${conf}%</span>`;
        }
    },

    resetButtons() {
        ['call', 'put'].forEach(s => {
            const b = document.getElementById('btn-' + s);
            if(b) {
                b.disabled = true;
                b.style.opacity = "0.2";
                b.classList.remove('animate-pulse');
                b.innerText = s.toUpperCase();
            }
        });
    },

    trade(side) {
        if (app.isTrading) return;
        this.log(`TIRO MANUAL EXECUTADO: ${side}`, "text-white bg-blue-900 px-1");
        DerivAPI.buy(side, document.getElementById('m-stake').value, 'm');
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        const color = profit > 0 ? "text-green-400" : "text-red-400";
        this.log(`RESULTADO: ${profit > 0 ? 'WIN' : 'LOSS'} (+$${profit.toFixed(2)})`, color);
    }
};
