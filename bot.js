// ============ CONFIGURAÇÃO GLOBAL ============
const APP_ID = 121512;
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';

let ws = null;
let isConnected = false;
let currentAsset = 'R_10';
let openPositions = [];
let chartsMap = new Map();
let candlesMap = new Map();
let accountBalance = 0;
let accountCurrency = 'USD';
let accountType = 'DEMO';

// ============ INICIALIZAÇÃO ============
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Bot carregado');
    updateAssetTabs();
});

// ============ CONEXÃO ============
async function handleConnect() {
    const token = document.getElementById('apiToken').value.trim();
    if (!token) {
        showError('Por favor, insira um token válido');
        return;
    }

    const btn = document.getElementById('connectBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Conectando...';

    try {
        ws = new WebSocket(`${DERIV_WS_URL}?app_id=${APP_ID}`);

        ws.onopen = () => {
            console.log('✅ WebSocket conectado');
            ws.send(JSON.stringify({ authorize: token }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleMessage(data);
        };

        ws.onerror = (error) => {
            console.error('❌ Erro WebSocket:', error);
            showError('Erro de conexão');
            btn.disabled = false;
            btn.innerHTML = 'Conectar';
        };

        ws.onclose = () => {
            console.log('⚠️ WebSocket desconectado');
            isConnected = false;
            updateUI();
        };
    } catch (error) {
        console.error('❌ Erro:', error);
        showError('Erro ao conectar');
        btn.disabled = false;
        btn.innerHTML = 'Conectar';
    }
}

function handleMessage(data) {
    // Autorização
    if (data.authorize) {
        console.log('✅ Autorização bem-sucedida');
        isConnected = true;
        accountBalance = data.authorize.balance;
        accountCurrency = data.authorize.currency;
        accountType = data.authorize.is_virtual ? 'DEMO' : 'REAL';
        
        document.getElementById('apiToken').value = '';
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('connectBtn').innerHTML = 'Conectar';
        
        updateUI();
        loadAssetStream(currentAsset);
        
        // Solicitar saldo
        ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    }

    // Atualizar saldo
    if (data.balance) {
        accountBalance = data.balance.balance;
        updateUI();
    }

    // Histórico de velas
    if (data.candles) {
        const candles = data.candles.map(c => ({
            time: c.epoch,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));
        
        candlesMap.set(data.msg_type === 'candles' ? currentAsset : currentAsset, candles);
        
        const chart = chartsMap.get(currentAsset);
        if (chart && chart.candleSeries) {
            chart.candleSeries.setData(candles);
            console.log(`✅ ${candles.length} velas carregadas para ${currentAsset}`);
        }
    }

    // Atualizar vela em tempo real
    if (data.ohlc) {
        const c = data.ohlc;
        const candle = {
            time: c.open_time,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        };

        const chart = chartsMap.get(currentAsset);
        if (chart && chart.candleSeries && candlesMap.get(currentAsset)?.length > 0) {
            try {
                chart.candleSeries.update(candle);
            } catch (e) {
                console.warn('Aviso ao atualizar vela:', e.message);
            }
        }

        // Atualizar preço
        const decimals = currentAsset.includes('JPY') ? 3 : 5;
        document.getElementById('currentPrice').textContent = candle.close.toFixed(decimals);

        // Atualizar P&L das posições
        updatePositionsPL(candle.close);
    }

    // Erro
    if (data.error) {
        console.error('❌ Erro API:', data.error.message);
        showError(data.error.message);
    }
}

function loadAssetStream(asset) {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 86400; // Últimas 24 horas

    ws.send(JSON.stringify({
        ticks_history: asset,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        start,
        style: 'candles',
        granularity: 900, // 15 minutos
        subscribe: 1
    }));
}

// ============ GRÁFICOS ============
function initChart(container, asset) {
    if (!window.LightweightCharts) {
        console.error('❌ LightweightCharts não carregado');
        return null;
    }

    const rect = container.getBoundingClientRect();
    const chart = window.LightweightCharts.createChart(container, {
        width: rect.width,
        height: rect.height,
        layout: {
            background: { type: 'solid', color: '#0f172a' },
            textColor: '#cbd5e1'
        },
        grid: {
            vertLines: { color: 'rgba(71, 85, 105, 0.3)' },
            horzLines: { color: 'rgba(71, 85, 105, 0.3)' }
        },
        crosshair: { mode: 0 },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#475569' },
        rightPriceScale: { borderColor: '#475569' }
    });

    const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444'
    });

    chart.timeScale().fitContent();

    // ResizeObserver
    const observer = new ResizeObserver(() => {
        const newRect = container.getBoundingClientRect();
        if (newRect.width > 0 && newRect.height > 0) {
            chart.applyOptions({
                width: newRect.width,
                height: newRect.height
            });
        }
    });
    observer.observe(container);

    return { chart, candleSeries, observer };
}

function changeAsset() {
    const newAsset = document.getElementById('assetSelect').value;
    if (newAsset !== currentAsset) {
        currentAsset = newAsset;
        
        // Limpar gráfico anterior
        const mainChart = document.getElementById('mainChart');
        mainChart.innerHTML = '';
        
        // Criar novo gráfico
        const chartObj = initChart(mainChart, newAsset);
        if (chartObj) {
            chartsMap.set(newAsset, chartObj);
            loadAssetStream(newAsset);
        }
        
        updateAssetTabs();
    }
}

function addAsset() {
    const select = document.getElementById('newAssetSelect');
    const asset = select.value;
    
    if (!asset) return;
    if (chartsMap.has(asset)) {
        alert('Este ativo já está sendo monitorado');
        return;
    }

    chartsMap.set(asset, null);
    updateAssetTabs();
    createMiniChart(asset);
    loadAssetStream(asset);
    select.value = '';
}

function removeAsset(asset) {
    if (asset === currentAsset) {
        alert('Não é possível remover o ativo principal');
        return;
    }
    
    chartsMap.delete(asset);
    candlesMap.delete(asset);
    updateAssetTabs();
    
    const miniCharts = document.getElementById('miniCharts');
    const chart = miniCharts.querySelector(`[data-asset="${asset}"]`);
    if (chart) chart.remove();
}

function createMiniChart(asset) {
    const miniCharts = document.getElementById('miniCharts');
    const container = document.createElement('div');
    container.className = 'mini-chart';
    container.setAttribute('data-asset', asset);
    container.innerHTML = `<div class="mini-chart-title">${asset}</div>`;
    
    miniCharts.appendChild(container);
    
    const chartObj = initChart(container, asset);
    if (chartObj) {
        chartsMap.set(asset, chartObj);
    }
}

function updateAssetTabs() {
    const tabs = document.getElementById('assetTabs');
    tabs.innerHTML = '';
    
    chartsMap.forEach((_, asset) => {
        const tab = document.createElement('div');
        tab.className = `asset-tab ${asset === currentAsset ? 'active' : ''}`;
        tab.onclick = () => {
            currentAsset = asset;
            changeAsset();
        };
        
        const label = document.createElement('span');
        label.textContent = asset;
        label.style.flex = '1';
        tab.appendChild(label);
        
        if (asset !== currentAsset) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'asset-tab close-btn';
            closeBtn.textContent = '×';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                removeAsset(asset);
            };
            tab.appendChild(closeBtn);
        }
        
        tabs.appendChild(tab);
    });
}

// ============ ANÁLISE TÉCNICA ============
function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateMACD(candles) {
    const ema12 = calculateEMA(candles, 12);
    const ema26 = calculateEMA(candles, 26);
    const macd = ema12 - ema26;
    
    return {
        value: macd,
        signal: 0,
        histogram: 0
    };
}

function calculateEMA(candles, period) {
    if (candles.length < period) return candles[candles.length - 1].close;
    
    const sma = candles.slice(-period).reduce((sum, c) => sum + c.close, 0) / period;
    const multiplier = 2 / (period + 1);
    
    let ema = sma;
    for (let i = candles.length - period; i < candles.length; i++) {
        ema = candles[i].close * multiplier + ema * (1 - multiplier);
    }
    
    return ema;
}

function calculateBollingerBands(candles, period = 20) {
    const sma = candles.slice(-period).reduce((sum, c) => sum + c.close, 0) / period;
    const closes = candles.slice(-period).map(c => c.close);
    
    const variance = closes.reduce((sum, close) => sum + Math.pow(close - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    return {
        upper: sma + 2 * std,
        middle: sma,
        lower: sma - 2 * std
    };
}

function calculateATR(candles, period = 14) {
    if (candles.length < period) return 0;
    
    let trSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        const current = candles[i];
        const previous = candles[i - 1];
        
        const tr1 = current.high - current.low;
        const tr2 = Math.abs(current.high - previous.close);
        const tr3 = Math.abs(current.low - previous.close);
        
        trSum += Math.max(tr1, tr2, tr3);
    }
    
    return trSum / period;
}

function analyzeChart() {
    const candles = candlesMap.get(currentAsset);
    if (!candles || candles.length < 200) {
        return {
            signal: 'NEUTRAL',
            confidence: 0,
            reasons: ['Dados insuficientes (mínimo 200 velas)']
        };
    }

    const rsi = calculateRSI(candles);
    const macd = calculateMACD(candles);
    const bb = calculateBollingerBands(candles);
    const atr = calculateATR(candles);
    const currentPrice = candles[candles.length - 1].close;

    let buySignals = 0, sellSignals = 0;
    const reasons = [];

    // RSI
    if (rsi < 30) {
        buySignals += 2;
        reasons.push(`RSI em sobrevenda (${rsi.toFixed(2)})`);
    } else if (rsi > 70) {
        sellSignals += 2;
        reasons.push(`RSI em sobrecompra (${rsi.toFixed(2)})`);
    }

    // Bollinger Bands
    if (currentPrice < bb.lower) {
        buySignals += 2;
        reasons.push('Preço abaixo da banda inferior');
    } else if (currentPrice > bb.upper) {
        sellSignals += 2;
        reasons.push('Preço acima da banda superior');
    }

    // MACD
    if (macd.value > 0) {
        buySignals += 1;
        reasons.push('MACD positivo');
    } else {
        sellSignals += 1;
        reasons.push('MACD negativo');
    }

    const signal = buySignals > sellSignals ? 'BUY' : sellSignals > buySignals ? 'SELL' : 'NEUTRAL';
    const confidence = Math.max(buySignals, sellSignals) / (buySignals + sellSignals || 1);

    const stopLoss = signal === 'BUY' ? currentPrice - atr * 1.5 : currentPrice + atr * 1.5;
    const takeProfit = signal === 'BUY' ? currentPrice + atr * 3 : currentPrice - atr * 3;

    return {
        signal,
        confidence: Math.round(confidence * 100),
        rsi: rsi.toFixed(2),
        currentPrice: currentPrice.toFixed(5),
        stopLoss: stopLoss.toFixed(5),
        takeProfit: takeProfit.toFixed(5),
        atr: atr.toFixed(5),
        reasons
    };
}

// ============ TRADING ============
function handleAnalyze() {
    const btn = document.getElementById('analyzeBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Analisando...';

    setTimeout(() => {
        const analysis = analyzeChart();
        
        const message = `
🎯 ANÁLISE PROFISSIONAL - ${currentAsset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sinal: ${analysis.signal} (${analysis.confidence}%)
Preço Atual: ${analysis.currentPrice}

📊 INDICADORES:
• RSI: ${analysis.rsi}
• ATR: ${analysis.atr}

💰 GERENCIAMENTO:
• Stop Loss: ${analysis.stopLoss}
• Take Profit: ${analysis.takeProfit}

📝 RAZÕES:
${analysis.reasons.map(r => `• ${r}`).join('\n')}
        `;

        document.getElementById('aiMessage').textContent = message;

        if (analysis.signal !== 'NEUTRAL') {
            document.getElementById('executeBtn').classList.remove('hidden');
            window.lastAnalysis = analysis;
        }

        btn.disabled = false;
        btn.innerHTML = 'Analisar Gráfico';
    }, 500);
}

function handleExecuteTrade() {
    if (!window.lastAnalysis) return;

    const analysis = window.lastAnalysis;
    const stake = parseFloat(document.getElementById('stake').value);
    
    const position = {
        id: `POS_${Date.now()}`,
        asset: currentAsset,
        type: analysis.signal === 'BUY' ? 'CALL' : 'PUT',
        entryPrice: parseFloat(analysis.currentPrice),
        currentPrice: parseFloat(analysis.currentPrice),
        quantity: stake,
        entryTime: Date.now(),
        stopLoss: parseFloat(analysis.stopLoss),
        takeProfit: parseFloat(analysis.takeProfit),
        profitLoss: 0,
        profitLossPercent: 0
    };

    openPositions.push(position);
    updateUI();
    
    document.getElementById('aiMessage').textContent += `\n\n✅ Posição ${position.type} aberta!\nID: ${position.id}`;
}

function updatePositionsPL(currentPrice) {
    let totalPL = 0;
    
    openPositions.forEach(pos => {
        if (pos.asset === currentAsset) {
            pos.currentPrice = currentPrice;
            
            if (pos.type === 'CALL') {
                pos.profitLoss = (currentPrice - pos.entryPrice) * pos.quantity;
            } else {
                pos.profitLoss = (pos.entryPrice - currentPrice) * pos.quantity;
            }
            
            pos.profitLossPercent = ((pos.profitLoss) / (pos.entryPrice * pos.quantity)) * 100;

            // Verificar SL/TP
            if (pos.type === 'CALL' && currentPrice >= pos.takeProfit) {
                closePosition(pos.id, 'TP');
            } else if (pos.type === 'CALL' && currentPrice <= pos.stopLoss) {
                closePosition(pos.id, 'SL');
            } else if (pos.type === 'PUT' && currentPrice <= pos.takeProfit) {
                closePosition(pos.id, 'TP');
            } else if (pos.type === 'PUT' && currentPrice >= pos.stopLoss) {
                closePosition(pos.id, 'SL');
            }
        }
        
        totalPL += pos.profitLoss;
    });

    document.getElementById('totalPL').textContent = totalPL >= 0 ? `+$${totalPL.toFixed(2)}` : `-$${Math.abs(totalPL).toFixed(2)}`;
    document.getElementById('totalPL').style.color = totalPL >= 0 ? '#22c55e' : '#ef4444';
}

function closePosition(posId, reason) {
    const index = openPositions.findIndex(p => p.id === posId);
    if (index !== -1) {
        const pos = openPositions[index];
        console.log(`✅ Posição ${pos.type} fechada por ${reason}`);
        openPositions.splice(index, 1);
        updateUI();
    }
}

// ============ UI ============
function updateUI() {
    if (!isConnected) {
        document.getElementById('connectedPanel').classList.add('hidden');
        document.getElementById('loginError').classList.add('hidden');
    } else {
        document.getElementById('connectedPanel').classList.remove('hidden');
        document.getElementById('totalBalance').textContent = `$${accountBalance.toFixed(2)}`;
        document.getElementById('accountType').textContent = accountType;
        document.getElementById('openCount').textContent = openPositions.length;
        
        // Calcular taxa de ganho
        const wins = openPositions.filter(p => p.profitLoss > 0).length;
        const total = openPositions.length || 1;
        document.getElementById('winRate').textContent = `${Math.round((wins / total) * 100)}%`;
        
        // Atualizar posições abertas
        const posDiv = document.getElementById('openPositions');
        posDiv.innerHTML = openPositions.map(pos => `
            <div class="position-item">
                <div class="position-header">
                    <span class="position-type ${pos.type.toLowerCase()}">${pos.type}</span>
                    <span class="position-pl ${pos.profitLoss >= 0 ? 'positive' : 'negative'}">
                        ${pos.profitLoss >= 0 ? '+' : ''}$${pos.profitLoss.toFixed(2)}
                    </span>
                </div>
                <div>Entrada: ${pos.entryPrice.toFixed(5)} | Atual: ${pos.currentPrice.toFixed(5)}</div>
                <div style="font-size: 11px; color: #94a3b8;">Ativo: ${pos.asset}</div>
            </div>
        `).join('');
    }
}

function handleDisconnect() {
    if (ws) ws.close();
    isConnected = false;
    openPositions = [];
    chartsMap.clear();
    candlesMap.clear();
    document.getElementById('mainChart').innerHTML = '';
    document.getElementById('miniCharts').innerHTML = '';
    updateUI();
}

function showError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

// Atualizar UI a cada segundo
setInterval(updateUI, 1000);
