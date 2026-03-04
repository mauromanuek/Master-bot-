// --- js/main.js ---
const App = {
    ws: null,
    appId: 121512,
    symbol: "WLDUSD", // USD Basket
    wakeLock: null,

    connect: () => {
        const token = document.getElementById('api-token').value.trim();
        if (!token) {
            UI.updateError("> Erro: Chave de API Ausente.");
            return;
        }

        UI.updateError("> A ligar aos servidores da Deriv...");
        
        App.ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${App.appId}`);
        
        App.ws.onopen = () => {
            App.ws.send(JSON.stringify({ authorize: token }));
        };

        App.ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            App.handleResponse(data);
        };

        App.ws.onerror = () => {
            UI.updateError("> Erro fatal de WebSocket.");
        };
    },

    handleResponse: (data) => {
        if (data.error) {
            console.error("API Error:", data.error.message);
            alert("API Error: " + data.error.message);
            return;
        }

        if (data.msg_type === 'authorize') {
            UI.showDashboard();
            App.enableWakeLock();
            App.startDataFeeds();
            
            // Ping Heartbeat a cada 30 segundos
            setInterval(() => {
                if(App.ws.readyState === WebSocket.OPEN) App.ws.send(JSON.stringify({ ping: 1 }));
            }, 30000);
        }

        // Histórico Inicial (req_id dita o timeframe)
        if (data.msg_type === 'candles') {
            let tf = App.getTfFromReqId(data.req_id);
            if (tf) Analysis.updateHistory(tf, data.candles);
        }

        // Streaming Tempo Real
        if (data.msg_type === 'ohlc') {
            let tf = App.getTfFromReqId(data.req_id);
            if (tf) {
                UI.toggleScanline(tf, true);
                Analysis.updateRealtime(tf, data.ohlc);
                setTimeout(() => UI.toggleScanline(tf, false), 500); // Efeito visual de scanner
            }
        }
    },

    startDataFeeds: () => {
        // Pedimos e subscrevemos aos 3 Timeframes usando o Req_ID para separar o feed
        
        // 1H (3600 seg) - Pede 1000 velas para calcular EMA1000
        App.ws.send(JSON.stringify({ ticks_history: App.symbol, end: "latest", count: 1000, style: "candles", granularity: 3600, subscribe: 1, req_id: 3600 }));
        
        // 15M (900 seg)
        App.ws.send(JSON.stringify({ ticks_history: App.symbol, end: "latest", count: 300, style: "candles", granularity: 900, subscribe: 1, req_id: 900 }));
        
        // 5M (300 seg)
        App.ws.send(JSON.stringify({ ticks_history: App.symbol, end: "latest", count: 100, style: "candles", granularity: 300, subscribe: 1, req_id: 300 }));
    },

    getTfFromReqId: (req_id) => {
        if (req_id === 3600) return '1H';
        if (req_id === 900) return '15M';
        if (req_id === 300) return '5M';
        return null;
    },

    // --- Trava de Ecrã (Wake Lock API) ---
    enableWakeLock: async () => {
        if ('wakeLock' in navigator) {
            try {
                App.wakeLock = await navigator.wakeLock.request('screen');
                App.wakeLock.addEventListener('release', () => {
                    document.getElementById('wake-status').innerHTML = '<i class="fas fa-eye-slash text-gray-500 mr-1"></i> Ecrã Livre';
                    document.getElementById('wake-status').className = "text-[10px] font-bold tracking-widest uppercase text-gray-500 font-mono";
                });
                
                document.getElementById('wake-status').innerHTML = '<i class="fas fa-eye text-green-400 mr-1"></i> Anti-Sleep Ativo';
                document.getElementById('wake-status').className = "text-[10px] font-bold tracking-widest uppercase text-green-400 font-mono shadow-green-500/50 drop-shadow-md";
            } catch (err) {
                console.error("Wake Lock Failed:", err);
            }
        } else {
            console.log('Wake Lock API not supported');
        }
    }
};

// Reconectar WakeLock se o user mudar de aba e voltar
document.addEventListener('visibilitychange', async () => {
    if (App.wakeLock !== null && document.visibilityState === 'visible') {
        await App.enableWakeLock();
    }
});
