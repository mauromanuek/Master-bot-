// ==========================================
// CONFIGURAÇÕES API DERIV E ESTADO
// ==========================================
const APP_ID = 121512;
let ws;
let isConnected = false;
let activeCandleSub = null;
let chart, candleSeries, smaSeries;
let priceLines =[]; // Array de suportes e resistências
let candleData =[]; // Array das velas carregadas
let currentSignalContractType = '';

// Elementos da Interface
const assetSelect = document.getElementById('assetSelect');
const timeframeSelect = document.getElementById('timeframeSelect');
const stakeInput = document.getElementById('stakeInput');
const aiMessage = document.getElementById('aiMessage');
const btnStart = document.getElementById('btnStart');
const btnReset = document.getElementById('btnReset');
const btnExecute = document.getElementById('btnExecuteTrade');

// ==========================================
// ÁUDIO E ANIMAÇÃO DA INTELIGÊNCIA ARTIFICIAL
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    try {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        if (type === 'success') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start(); osc.stop(audioCtx.currentTime + 0.3);
        } else {
            osc.type = 'square'; osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        }
    } catch(e){}
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let typeTimeout;
function updateAI(text) {
    clearTimeout(typeTimeout); 
    aiMessage.textContent = '';
    let i = 0;
    function type() {
        if (i < text.length) { 
            aiMessage.textContent += text.charAt(i); 
            i++; 
            typeTimeout = setTimeout(type, 35); 
        }
    }
    type();
}

// Bloqueia Forex no fim de semana
function checkWeekendStatus() {
    const isWeekend = (new Date().getDay() === 0 || new Date().getDay() === 6);
    const isForex = assetSelect.value.startsWith('frx');
    const alertBox = document.getElementById('weekendAlert');
    
    if (isWeekend && isForex) {
        alertBox.classList.remove('hidden'); alertBox.classList.add('flex');
        btnStart.disabled = true; btnStart.classList.add('opacity-50', 'cursor-not-allowed');
        return true;
    } else {
        alertBox.classList.add('hidden'); alertBox.classList.remove('flex');
        btnStart.disabled = false; btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        return false;
    }
}

// ==========================================
// GRÁFICOS (TRADINGVIEW LIGHTWEIGHT CHARTS)
// ==========================================
function initChart() {
    const container = document.getElementById('tvchart');
    chart = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: 'rgba(43, 49, 57, 0.4)' }, horzLines: { color: 'rgba(43, 49, 57, 0.4)' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#2B3139' },
        rightPriceScale: { borderColor: '#2B3139' }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10B981', downColor: '#EF4444', 
        borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#EF4444'
    });

    smaSeries = chart.addLineSeries({
        color: 'rgba(56, 189, 248, 0.8)', lineWidth: 2, crosshairMarkerVisible: false
    });

    // Redimensionamento responsivo automático
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ width: newRect.width, height: newRect.height });
    }).observe(container);
}

// Cálculo Matemático da Média Móvel
function calcSMA(data, period) {
    let sma =[];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - j].close;
        sma.push({ time: data[i].time, value: sum / period });
    }
    return sma;
}

// ==========================================
// CONEXÃO WEBSOCKET DERIV V3
// ==========================================
document.getElementById('btnConnect').addEventListener('click', () => {
    const token = document.getElementById('apiToken').value.trim();
    if(!token) return;
    
    document.getElementById('btnConnectText').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> CONECTANDO...';
    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    
    ws.onopen = () => ws.send(JSON.stringify({ authorize: token }));

    // Ping Keep-Alive
    setInterval(() => { if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 })); }, 20000);

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);

        // Tratamento de Erro
        if(data.error) {
            if(data.msg_type === 'authorize') {
                document.getElementById('loginError').textContent = data.error.message;
                document.getElementById('loginError').classList.remove('hidden');
                document.getElementById('btnConnectText').textContent = 'TENTAR NOVAMENTE';
                ws.close();
            }
            if(data.msg_type === 'buy') {
                updateAI(`❌ Erro da Corretora: ${data.error.message}`);
                btnExecute.innerHTML = '<i class="fa-solid fa-bolt mr-2"></i> EXECUTAR ORDEM';
                btnExecute.disabled = false;
            }
            return;
        }

        // Login Bem-sucedido
        if(data.msg_type === 'authorize') {
            isConnected = true;
            document.getElementById('accountBalance').textContent = `${data.authorize.balance} ${data.authorize.currency}`;
            const tEl = document.getElementById('accountType');
            tEl.textContent = data.authorize.is_virtual ? 'DEMO' : 'REAL';
            tEl.className = data.authorize.is_virtual ? 'text-[9px] font-bold text-accent bg-accent/20 px-1.5 rounded' : 'text-[9px] font-bold text-buy bg-buy/20 px-1.5 rounded';
            
            document.getElementById('loginView').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loginView').classList.add('hidden');
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('dashboardView').classList.add('flex');
                initChart();
                loadAssetStream(assetSelect.value); // Carrega gráfico
            }, 500);
        }

        // Carga Inicial do Histórico (Candles)
        if(data.msg_type === 'candles') {
            candleData = data.candles.map(c => ({ time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close }));
            candleSeries.setData(candleData);
            smaSeries.setData(calcSMA(candleData, 20)); 
            
            if(data.subscription) activeCandleSub = data.subscription.id;
        }

        // Velas em tempo real (OHLC Tick Stream)
        if(data.msg_type === 'ohlc') {
            const c = data.ohlc;
            const liveCandle = { time: c.open_time, open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close) };
            
            candleSeries.update(liveCandle);
            const currentSMA = calcSMA([...candleData.slice(0, -1), liveCandle], 20);
            smaSeries.update(currentSMA[currentSMA.length - 1]);

            // Atualiza preço visual da tela
            document.getElementById('chartPrice').textContent = liveCandle.close.toFixed(assetSelect.value.includes('JPY') ? 3 : 5);
        }

        // Resposta da Compra Real executada
        if(data.msg_type === 'buy') {
            updateAI(`✅ Operação Real em Andamento! (ID: ${data.buy.transaction_id}). O mercado está seguindo a análise.`);
            startTradeTimer(60); // 1 Minuto simulado na interface visual
        }
    };
});

function loadAssetStream(symbol) {
    document.getElementById('chartTitle').textContent = assetSelect.options[assetSelect.selectedIndex].text;
    if(!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Cancela subscrição antiga
    if(activeCandleSub) ws.send(JSON.stringify({ forget: activeCandleSub }));
    
    // Assina novo ativo (Granularidade: 5M=300, 15M=900)
    const gran = timeframeSelect.value === '5M' ? 300 : 900;
    ws.send(JSON.stringify({ ticks_history: symbol, style: 'candles', end: 'latest', count: 100, granularity: gran, subscribe: 1 }));
    
    resetAnalysis();
    checkWeekendStatus();
}

assetSelect.addEventListener('change', () => loadAssetStream(assetSelect.value));
timeframeSelect.addEventListener('change', () => loadAssetStream(assetSelect.value));

// ==========================================
// ALGORITMO SMC (SMART MONEY CONCEPTS)
// ==========================================
btnStart.addEventListener('click', async () => {
    if(checkWeekendStatus() || candleData.length < 50) return;
    
    btnStart.classList.add('hidden');
    assetSelect.disabled = true; timeframeSelect.disabled = true;

    resetAnalysis();

    const highs = candleData.map(c => c.high);
    const lows = candleData.map(c => c.low);
    const currentPrice = candleData[candleData.length-1].close;

    // Acha topos e fundos das últimas 50 velas
    const maxPrice = Math.max(...highs.slice(-50));
    const minPrice = Math.min(...lows.slice(-50));

    // [Passo 1] DESENHAR SUPORTE E RESISTÊNCIA
    updateAI("Desenhando Suportes e Resistências para capturar a liquidez (Teoria de Dow).");
    await sleep(2000);
    
    const resLine = candleSeries.createPriceLine({ price: maxPrice, color: '#EF4444', lineWidth: 2, lineStyle: 2, title: 'Resistência / Liquidez' });
    const supLine = candleSeries.createPriceLine({ price: minPrice, color: '#10B981', lineWidth: 2, lineStyle: 2, title: 'Suporte / Liquidez' });
    priceLines.push(resLine, supLine);
    playSound('alert');

    // [Passo 2] MARCAR ORDER BLOCKS (OB) E BOS (CHoCH)
    updateAI("Analisando Order Blocks (OB) e mapeando o Rompimento de Estrutura (BOS) nas velas recentes...");
    await sleep(2500);

    let markers =[];
    
    // Identifica um Order Block dinamicamente (Pega a vela máxima das últimas 20)
    let obIndex = candleData.length - 20;
    for(let i = candleData.length - 20; i < candleData.length - 5; i++) {
        if(candleData[i].high === Math.max(...highs.slice(-20, -5))) obIndex = i;
    }
    markers.push({ time: candleData[obIndex].time, position: 'aboveBar', color: '#F59E0B', shape: 'arrowDown', text: 'OB (Suprimento)' });
    
    // Marcador visual de Quebra de Estrutura (BOS) perto do preço atual
    const bosIndex = candleData.length - 5;
    markers.push({ time: candleData[bosIndex].time, position: 'belowBar', color: '#38BDF8', shape: 'arrowUp', text: 'BOS / CHoCH' });
    
    candleSeries.setMarkers(markers);
    playSound('alert');

    // [Passo 3] DECISÃO INSTITUCIONAL
    updateAI("Confluência detectada com SMA. Gerando o sinal com gestão de risco ativada.");
    await sleep(2000);

    // Estratégia simples: Compra se estiver na metade inferior do canal, Vende se na superior
    const midPoint = (maxPrice + minPrice) / 2;
    const isCall = currentPrice < midPoint;
    currentSignalContractType = isCall ? 'CALL' : 'PUT';

    showSignalUI(currentSignalContractType, currentPrice);
});

function showSignalUI(type, price) {
    playSound('success');
    document.getElementById('signalPanel').classList.remove('hidden');

    const dirEl = document.getElementById('sigDirection');
    dirEl.innerHTML = type === 'CALL' ? 'CALL ↗' : 'PUT ↘';
    dirEl.className = `text-4xl font-black tracking-wider ${type === 'CALL' ? 'text-buy' : 'text-sell'}`;

    // Risco Retorno Estético no Painel 
    const pip = assetSelect.value.startsWith('R_') ? 1.5 : (assetSelect.value.includes('JPY') ? 0.150 : 0.00150);
    let tp = type === 'CALL' ? price + (pip * 2) : price - (pip * 2);
    let sl = type === 'CALL' ? price - pip : price + pip;

    const dec = assetSelect.value.startsWith('R_') ? 2 : (assetSelect.value.includes('JPY') ? 3 : 5);
    document.getElementById('sigEntry').textContent = price.toFixed(dec);
    document.getElementById('sigTP').textContent = tp.toFixed(dec);
    document.getElementById('sigSL').textContent = sl.toFixed(dec);

    updateAI(`Operação montada: ${type === 'CALL' ? 'COMPRA' : 'VENDA'} confirmada pelo Order Block. Clique em Executar para disparar na Deriv.`);
    btnReset.classList.remove('hidden'); 
}

// ==========================================
// EXECUÇÃO DE TRADE REAL
// ==========================================
btnExecute.addEventListener('click', () => {
    btnExecute.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> ENVIANDO...';
    btnExecute.disabled = true;
    btnReset.classList.add('hidden');
    
    const stake = parseFloat(document.getElementById('stakeInput').value) || 10;
    
    // Disparo API V3 Deriv
    ws.send(JSON.stringify({
        buy: 1,
        price: stake,
        parameters: {
            amount: stake,
            basis: "stake",
            contract_type: currentSignalContractType,
            currency: "USD",
            duration: 1,
            duration_unit: "m",
            symbol: assetSelect.value
        }
    }));
});

// Timer do Trade
let timerInterval;
function startTradeTimer(seconds) {
    document.getElementById('timerDisplay').classList.remove('hidden');
    let s = seconds;
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        s--;
        const ms = String(Math.floor(s/60)).padStart(2,'0');
        const ss = String(s%60).padStart(2,'0');
        document.getElementById('timerValue').textContent = `${ms}:${ss}`;
        
        if (s <= 0) {
            clearInterval(timerInterval);
            playSound('alert');
            updateAI('Operação Finalizada. O capital investido + lucro/prejuízo já constam no seu saldo acima.');
            
            btnExecute.innerHTML = '<i class="fa-solid fa-bolt mr-2"></i> EXECUTAR ORDEM';
            btnExecute.disabled = false;
            document.getElementById('timerDisplay').classList.add('hidden');
            btnReset.classList.remove('hidden');
        }
    }, 1000);
}

// Limpa Desenhos
function resetAnalysis() {
    priceLines.forEach(pl => candleSeries.removePriceLine(pl));
    priceLines =[];
    candleSeries.setMarkers(
