// --- js/ui.js ---
const UI = {
    showDashboard: () => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('flex');
    },

    updateError: (msg) => {
        document.getElementById('login-msg').innerText = msg;
    },

    updateEngineStatus: (msg, colorClass = "text-cyan-400") => {
        const el = document.getElementById('engine-status');
        el.innerText = msg;
        el.className = `text-xs font-bold uppercase tracking-widest font-mono ${colorClass}`;
    },

    toggleScanline: (tf, show) => {
        const el = document.getElementById(`scan-${tf}`);
        if(el) {
            if(show) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    },

    updateIndicator: (tf, type, value, direction = null) => {
        const el = document.getElementById(`tf-${tf.toLowerCase()}-${type}`);
        if (!el) return;

        let color = "text-gray-300";
        let icon = "";

        if (type === 'ema' && direction) {
            color = direction === 'UP' ? 'text-green-400' : 'text-red-400';
            icon = direction === 'UP' ? '<i class="fas fa-caret-up mr-1"></i>' : '<i class="fas fa-caret-down mr-1"></i>';
        } else if (type === 'rsi') {
            if (value < 30) color = "text-blue-400"; // Sobrevendido
            else if (value > 70) color = "text-orange-400"; // Sobrecomprado
        } else if (type === 'atr') {
            if (value < 0.05) color = "text-red-500"; // Consolidado (Morto)
            else color = "text-cyan-400"; // Volatilidade boa
        }

        el.innerHTML = `${icon}${value.toFixed(type === 'atr' ? 3 : 2)}`;
        el.className = `font-bold ${color}`;
    },

    addSignal: (asset, direction, price, confidence) => {
        const list = document.getElementById('signals-list');
        const empty = document.getElementById('empty-state');
        if (empty) empty.remove();

        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        
        const isCall = direction === 'CALL';
        const colorClass = isCall ? 'text-green-400' : 'text-red-400';
        const bgClass = isCall ? 'signal-call' : 'signal-put';
        const icon = isCall ? 'fa-arrow-up' : 'fa-arrow-down';

        const row = document.createElement('div');
        row.className = `signal-row ${bgClass}`;
        
        // Formato para ler depois ao copiar
        row.setAttribute('data-text', `✅ NOVO SINAL VIP\n📍 Ativo: ${asset}\n⏱ Hora: ${timeStr}\n🎯 Ação: ${direction}\n📊 Referência: ${price.toFixed(3)}\n🔥 Confiança: ${confidence}%`);

        row.innerHTML = `
            <span class="text-gray-400">${timeStr}</span>
            <span class="font-bold text-white">${asset}</span>
            <span class="font-bold ${colorClass}"><i class="fas ${icon} mr-1"></i>${direction}</span>
            <span class="text-gray-300">${price.toFixed(3)}</span>
            <span class="text-right text-yellow-400 font-bold">${confidence}%</span>
        `;

        list.prepend(row);

        // Tocar som
        const audio = document.getElementById('alert-sound');
        if(audio) audio.play().catch(e => console.log("Áudio auto-play bloqueado"));

        // Manter apenas últimos 12 sinais
        if (list.children.length > 12) {
            list.removeChild(list.lastChild);
        }
    },

    copyToTelegram: () => {
        const list = document.getElementById('signals-list');
        if(list.children.length === 0 || list.children[0].id === 'empty-state') {
            alert("Nenhum sinal gerado ainda para copiar.");
            return;
        }

        let textToCopy = "🚀 *SINAIS USD BASKET - APEX QUANT* 🚀\n\n";
        
        Array.from(list.children).forEach(row => {
            const dataText = row.getAttribute('data-text');
            if(dataText) textToCopy += dataText + "\n----------------------\n";
        });

        navigator.clipboard.writeText(textToCopy).then(() => {
            alert("Sinais copiados com sucesso! Cole no seu grupo do Telegram.");
        });
    }
};
