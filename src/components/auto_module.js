const AutoModule = {
    isRunning: false,
    currentProfit: 0,
    stats: { wins: 0, losses: 0 },
    _minConf: 70,

    render() {
        return `<div class="p-4 bg-gray-900 rounded-xl">
            <h2 class="text-purple-500 font-bold mb-4 uppercase">Auto Sniper Quant</h2>
            <div class="grid grid-cols-3 gap-2 mb-4">
                <input id="a-stake" type="number" value="1.00" class="bg-black p-2 rounded text-xs">
                <input id="a-tp" type="number" value="5.00" class="bg-black p-2 rounded text-xs border border-green-900">
                <input id="a-sl" type="number" value="10.00" class="bg-black p-2 rounded text-xs border border-red-900">
            </div>
            <button id="btn-a-toggle" onclick="AutoModule.toggle()" class="w-full py-4 bg-purple-600 rounded-xl font-bold">INICIAR AUTO SNIPER</button>
            <div id="a-status" class="mt-4 h-32 overflow-y-auto text-[10px] font-mono bg-black p-2 rounded text-gray-500"></div>
        </div>`;
    },

    log(m, c = "text-gray-500") {
        const el = document.getElementById('a-status');
        if (el) {
            el.innerHTML += `<p class="${c}">> ${m}</p>`;
            el.scrollTop = el.scrollHeight;
        }
    },

    toggle() {
        this.isRunning = !this.isRunning;
        document.getElementById('btn-a-toggle').innerText = this.isRunning ? "PARAR AUTO" : "INICIAR AUTO SNIPER";
        if (this.isRunning) this.run();
    },

    async run() {
        if (!this.isRunning || app.isTrading) return;
        const v = await app.analista.obterVereditoCompleto();
        if (this.isRunning && v.confianca >= this._minConf && (v.direcao === "CALL" || v.direcao === "PUT")) {
            this.log(`ALVO DETECTADO: ${v.direcao} (${v.confianca}%)`, "text-green-500");
            DerivAPI.buy(v.direcao, document.getElementById('a-stake').value, 'a');
        }
        setTimeout(() => this.run(), 1000);
    },

    handleContractResult(p) {
        this.currentProfit += p;
        if (p > 0) {
            this.stats.wins++;
            this._minConf = 70;
            this.log(`WIN: +$${p.toFixed(2)}`, "text-green-400 font-bold");
        } else {
            this.stats.losses++;
            this._minConf = 85; 
            this.log(`LOSS: $${p.toFixed(2)}. Aumentando rigor para 85%.`, "text-red-400");
        }
    }
};
