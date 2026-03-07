const APP_ID = 121512;
let ws;
let isConnected = false;
let activeCandleSub = null;
let chart, candleSeries, smaSeries;
let priceLines = []; 
let candleData =[]; 
let currentSignalContractType = '';

const assetSelect = document.getElementById('assetSelect');
const timeframeSelect = document.getElementById('timeframeSelect');
const stakeInput = document.getElementById('stakeInput');
const aiMessage = document.getElementById('aiMessage');
const btnStart = document.getElementById('btnStart');
const btnReset = document.getElementById('btnReset');
const btnExecute = document.getElementById('btnExecuteTrade');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        
        if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); 
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        } else if (type === 'alert') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
        }
    } catch (e) {
        console.warn("Áudio não suportado ou bloqueado no navegador.");
    }
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

function checkWeekendStatus() {
    const isWeekend = (new Date().getDay() === 0 || new Date().getDay() === 6);
    const isForex = assetSelect.value.startsWith('frx');
    const alertBox = document.getElementById('weekendAlert');
    
    if (isWeekend && isForex) {
        alertBox.classList.remove('hidden'); 
        alertBox.classList.add('flex');
        btnStart.disabled = true; 
        btnStart.classList.add('opacity-50', 'cursor-not-allowed');
        return true;
    } else {
        alertBox.classList.add('hidden'); 
        alertBox.classList.remove('flex');
        btnStart.disabled = false; 
        btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        return false;
    }
}

function initChart() {
    const container = document.getElementById('tvchart');
    if (chart) chart.remove();

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

    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ width: newRect.width, height: newRect.height });
    }).observe(container);
}

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

// LÓGICA DE CONEXÃO
function connectWS() {
    const token = document.getElementById('apiToken').value.trim();
    if(!token) return;

    document.getElementById('btnConnectText').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> CONECTANDO...';
    
    if (ws) ws.close();

    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({ authorize: token }));
    };

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);

        // 1. Tratamento de Erros
        if(data.error) {
            console.error("Erro API:", data.error.message);
            updateAI(`❌ Erro: ${data.error.message}`);
            if(data.msg_type === 'authorize') {
                document.getElementById('loginError').textContent = data.error.message;
                document.getElementById('loginError').classList.remove('hidden');
                document.getElementById('btnConnectText').textContent = 'TENTAR NOVAMENTE';
            }
            if(data.msg_type === 'buy') {
                btnExecute.innerHTML = '<i class="fa-solid fa-bolt mr-2"></i> EXECUTAR ORDEM REAL';
                btnExecute.disabled = false;
            }
            return;
        }

        // 2. Autorização
        if(data.msg_type === 'authorize') {
            isConnected = true;
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
            
            document.getElementById('accountBalance').textContent = `${data.authorize.balance} ${data.authorize.currency}`;
            const tEl = document.getElementById('accountType');
            tEl.textContent = data.authorize.is_virtual ? 'DEMO' : 'REAL';
            tEl.className = data.authorize.is_virtual ? 'text-[9px] font-bold text-accent bg-accent/20 px-1.5 rounded' : 'text-[9px] font-bold text-buy bg-buy/20 px-1.5 rounded';
            
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('dashboardView').classList.remove('hidden');
            document.getElementById('dashboardView').classList.add('flex');
            
            initChart();
            loadAssetStream(assetSelect.value);
        }

        // 3. Atualização de Saldo
        if(data.msg_type === 'balance') {
            document.getElementById('accountBalance').textContent = `${data.balance.balance} ${data.balance.currency}`;
        }

        // 4. Histórico de Velas
        if(data.msg_type === 'candles') {
            candleData = data.candles.map(c => ({ 
                time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close 
            }));
            candleSeries.setData(candleData);
            smaSeries.setData(calcSMA(candleData, 20)); 
            if(data.subscription) activeCandleSub = data.subscription.id;
        }

        // 5. Atualização da Vela Atual
        if(data.msg_type === 'ohlc') {
            const c = data.ohlc;
            const liveCandle = { 
                time: c.open_time, open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close) 
            };
            
            candleSeries.update(liveCandle);
            
            const lastSMA = calcSMA([...candleData.slice(-20), liveCandle], 20);
            if (lastSMA.length > 0) smaSeries.update(lastSMA[lastSMA.length - 1]);

            document.getElementById('chartPrice').textContent = liveCandle.close.toFixed(assetSelect.value.includes('JPY') ? 3 : 5);
        }

        // 6. Confirmação de Compra
        if(data.msg_type === 'buy') {
            const id = data.buy.transaction_id || data.buy.contract_id;
            updateAI(`✅ Ordem enviada! ID: ${id}`);
            startTradeTimer(60); 
        }
    };

    ws.onclose = () => {
        isConnected = false;
        console.log("Conexão encerrada. Tentando reconectar...");
    };
}

document.getElementById('btnConnect').addEventListener('click', connectWS);

function loadAssetStream(symbol) {
    if(!ws || ws.readyState !== WebSocket.OPEN) return;
    
    if(activeCandleSub) {
        ws.send(JSON.stringify({ forget: activeCandleSub }));
        activeCandleSub = null;
    }
    
    // Configura 15M (900s) ou 5M (300s)
    const gran = timeframeSelect.value === '5M' ? 300 : 900; 
    
    ws.send(JSON.stringify({ 
        ticks_history: symbol, style: 'candles', end: 'latest', count: 100, granularity: gran, subscribe: 1 
    }));
    
    document.getElementById('chartTitle').textContent = assetSelect.options[assetSelect.selectedIndex].text;
    resetAnalysis();
    checkWeekendStatus();
}

assetSelect.addEventListener('change', () => loadAssetStream(assetSelect.value));
timeframeSelect.addEventListener('change', () => loadAssetStream(assetSelect.value));

// LÓGICA DE ANÁLISE SMC
btnStart.addEventListener('click', async () => {
    if(checkWeekendStatus() || candleData.length < 50) return;
    
    btnStart.classList.add('hidden');
    assetSelect.disabled = true; 
    timeframeSelect.disabled = true;

    resetAnalysis();

    const highs = candleData.map(c => c.high);
    const lows = candleData.map(c => c.low);
    const currentPrice = candleData[candleData.length - 1].close;

    const maxPrice = Math.max(...highs.slice(-50));
    const minPrice = Math.min(...lows.slice(-50));

    updateAI("Desenhando Suportes e Resistências para capturar a liquidez (Teoria de Dow).");
    await sleep(2000);
    
    const resLine = candleSeries.createPriceLine({ price: maxPrice, color: '#EF4444', lineWidth: 2, lineStyle: 2, title: 'Resistência / Liquidez' });
    const supLine = candleSeries.createPriceLine({ price: minPrice, color: '#10B981', lineWidth: 2, lineStyle: 2, title: 'Suporte / Liquidez' });
    priceLines.push(resLine, supLine);
    playSound('alert');

    updateAI("Analisando Order Blocks (OB) e mapeando o Rompimento de Estrutura (BOS) nas velas recentes...");
    await sleep(2500);

    let markers =[];
    let obIndex = candleData.length - 20;
    const sliceHighs = highs.slice(-20, -5);
    const maxInSlice = Math.max(...sliceHighs);
    
    for(let i = candleData.length - 20; i < candleData.length - 5; i++) {
        if(candleData[i].high === maxInSlice) { obIndex = i; break; }
    }
    
    markers.push({ time: candleData[obIndex].time, position: 'aboveBar', color: '#F59E0B', shape: 'arrowDown', text: 'OB (Suprimento)' });
    
    const bosIndex = candleData.length - 5;
    markers.push({ time: candleData[bosIndex].time, position: 'belowBar', color: '#38BDF8', shape: 'arrowUp', text: 'BOS / CHoCH' });
    
    candleSeries.setMarkers(markers);
    playSound('alert');

    updateAI("Confluência detectada. Gerando o sinal com gestão de risco ativada.");
    await sleep(2000);

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

    const pip = assetSelect.value.startsWith('R_') ? 1.5 : (assetSelect.value.includes('JPY') ? 0.150 : 0.00150);
    let tp = type === 'CALL' ? price + (pip * 2) : price - (pip * 2);
    let sl = type === 'CALL' ? price - pip : price + pip;

    const dec = assetSelect.value.startsWith('R_') ? 2 : (assetSelect.value.includes('JPY') ? 3 : 5);
    document.getElementById('sigEntry').textContent = price.toFixed(dec);
    document.getElementById('sigTP').textContent = tp.toFixed(dec);
    document.getElementById('sigSL').textContent = sl.toFixed(dec);

    updateAI(`Operação montada: ${type === 'CALL' ? 'COMPRA' : 'VENDA'} confirmada. Clique em Executar para disparar na Deriv.`);
    btnReset.classList.remove('hidden'); 
}

btnExecute.addEventListener('click', () => {
    btnExecute.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> ENVIANDO...';
    btnExecute.disabled = true;
    btnReset.classList.add('hidden');
    
    const stake = parseFloat(document.getElementById('stakeInput').value) || 10;
    
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

let timerInterval;
function startTradeTimer(seconds) {
    document.getElementById('timerDisplay').classList.remove('hidden');
    let s = seconds;
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        s--;
        const ms = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        document.getElementById('timerValue').textContent = `${ms}:${ss}`;
        
        if (s <= 0) {
            clearInterval(timerInterval);
            playSound('alert');
            updateAI('Operação Finalizada. O resultado já foi liquidado no seu saldo.');
            
            btnExecute.innerHTML = '<i class="fa-solid fa-bolt mr-2"></i> EXECUTAR ORDEM';
            btnExecute.disabled = false;
            document.getElementById('timerDisplay').classList.add('hidden');
            btnReset.classList.remove('hidden');
        }
    }, 1000);
}

// FUNÇÃO FINALIZADA DE RESET
function resetAnalysis() {
    // Remove as linhas de Suporte e Resistência do gráfico
    if (priceLines.length > 0) {
        priceLines.forEach(pl => candleSeries.removePriceLine(pl));
        priceLines =[];
    }
    
    // Remove os marcadores de OB e BOS do gráfico
    if (candleSeries) {
        candleSeries.setMarkers([]); 
    }
    
    // Reseta as variáveis e a UI
    currentSignalContractType = '';
    
    // Esconde o painel de sinal e o timer
    const signalPanel = document.getElementById('signalPanel');
    if(signalPanel) signalPanel.classList.add('hidden');
    
    const timerDisplay = document.getElementById('timerDisplay');
    if(timerDisplay) timerDisplay.classList.add('hidden');
    
    clearInterval(timerInterval);
    
    // Mostra botão start, esconde botão reset
    btnReset.classList.add('hidden');
    btnStart.classList.remove('hidden');
    
    // Habilita as caixas de seleção novamente
    assetSelect.disabled = false;
    timeframeSelect.disabled = false;
    
    // Atualiza IA
    updateAI('Análise resetada. Selecione os parâmetros e clique em "INICIAR ANÁLISE" para mapear novas oportunidades.');
}

// EVENTO DO BOTÃO RESET (Estava faltando)
btnReset.addEventListener('click', resetAnalysis);
