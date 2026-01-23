const DigitModule = {
    isActive: false,
    tickBuffer: [],
    currentProfit: 0,
    stats: { wins: 0, losses: 0 },

    render() {
        return `
            <div class="space-y-4 max-w-md mx-auto">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-yellow-500 italic uppercase">Digit Sniper Quant</h2>
                    <div id="d-indicator" class="w-3 h-3 rounded-full bg-gray-600 shadow-sm"></div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-gray-900 p-4 rounded-2xl border border-gray-800 text-center">
                        <p class="text-[10px] text-gray-500 uppercase font-bold">Probabilidade Over 5</p>
                        <p id="d-over-perc" class="text-2xl font-black text-white">0%</p>
                    </div>
                    <div class="bg-gray-900 p-4 rounded-2xl border border-gray-800 text-center">
                        <p class="text-[10px] text-gray-500 uppercase font-bold">Probabilidade Under 5</p>
                        <p id="d-under-perc" class="text-2xl font-black text-white">0%</p>
                    </div>
                </div>

                <button id="btn-d-toggle" onclick="DigitModule.toggle()" class="w-full py-4 bg-yellow-600 rounded-xl font-bold uppercase transition-all">Iniciar Digits Quant</button>
                
                <div id="d-status" class="bg-black p-3 rounded-xl h-24 overflow-y-auto text-[10px] font-mono text-gray-400 border border-gray-900">
                    <p class="text-gray-600 italic">> Aguardando fluxo de ticks...</p>
                </div>
            </div>`;
    },

    log(msg, color = "text-gray-400") {
        const s = document.getElementById('d-status');
        if (s) {
            s.innerHTML += `<p class="${color}">> ${msg}</p>`;
            s.scrollTop = s.scrollHeight;
        }
    },

    toggle() {
        this.isActive = !this.isActive;
        document.getElementById('btn-d-toggle').innerText = this.isActive ? "PARAR DIGITS" : "INICIAR DIGITS QUANT";
        document.getElementById('btn-d-toggle').classList.toggle('bg-red-600', this.isActive);
    },

    processTick(tick) {
        if (!this.isActive) return;

        const digit = parseInt(tick.quote.toString().slice(-1));
        this.tickBuffer.push(digit);
        if (this.tickBuffer.length > 15) this.tickBuffer.shift();

        this.updateUI();

        // Lógica Sniper: Somente atira com confluência estatística acima de 75%
        if (!app.isTrading && this.tickBuffer.length >= 10) {
            const over = this.tickBuffer.filter(d => d > 5).length;
            const under = this.tickBuffer.filter(d => d < 5).length;
            const total = this.tickBuffer.length;

            if ((over / total) >= 0.75) {
                this.execute('DIGITOVER');
            } else if ((under / total) >= 0.75) {
                this.execute('DIGITUNDER');
            }
        }
    },

    updateUI() {
        const total = this.tickBuffer.length;
        if (total === 0) return;
        const over = (this.tickBuffer.filter(d => d > 5).length / total) * 100;
        const under = (this.tickBuffer.filter(d => d < 5).length / total) * 100;
        
        document.getElementById('d-over-perc').innerText = Math.round(over) + "%";
        document.getElementById('d-under-perc').innerText = Math.round(under) + "%";
    },

    execute(type) {
        app.isTrading = true;
        this.log(`ESTATÍSTICA CONFIRMADA: ${type}`, "text-yellow-500 font-bold");
        DerivAPI.buy(type, 1.00, 'd', null, { barrier: "5", duration: 1, duration_unit: 't' });
    },

    handleContractResult(profit) {
        this.currentProfit += profit;
        this.tickBuffer = []; // Limpa o buffer para ler o novo fluxo
        this.log(`DÍGITO: ${profit > 0 ? 'WIN' : 'LOSS'} (+$${profit.toFixed(2)})`, profit > 0 ? "text-green-400" : "text-red-400");
    }
};
