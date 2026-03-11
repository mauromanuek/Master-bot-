import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, TrendingUp } from 'lucide-react';

function TradingBot() {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [accountBalance, setAccountBalance] = useState('$0.00');
  const [accountType, setAccountType] = useState('---');
  const [currentPrice, setCurrentPrice] = useState('0.00');
  const [chartTitle, setChartTitle] = useState('Volatility 10');
  const [asset, setAsset] = useState('R_10');
  const [timeframe, setTimeframe] = useState('15M');
  const [stake, setStake] = useState('10');
  
  // TP e SL Manuais
  const [manualTP, setManualTP] = useState('');
  const [manualSL, setManualSL] = useState('');

  const [candleData, setCandleData] = useState([]);
  const [signal, setSignal] = useState(null);
  const [aiMessage, setAiMessage] = useState('Gráfico ao vivo conectado. Pressione "Analisar Gráfico" para mapear a estrutura.');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWeekend, setIsWeekend] = useState(false);
  
  const [profitLoss, setProfitLoss] = useState(0);
  const [profitLossPercent, setProfitLossPercent] = useState(0);
  
  // Rastreio da Operação Ativa
  const [activeContractId, setActiveContractId] = useState(null);
  const [actualEntryPrice, setActualEntryPrice] = useState(null);

  const wsRef = useRef(null);
  const activeCandleSubRef = useRef(null);
  const priceLineRef = useRef([]);
  const isClosingRef = useRef(false); // Previne duplo clique no fechamento
  const APP_ID = 121512;

  // 1. Inicializar Gráfico
  useEffect(() => {
    if (!isConnected || !chartContainerRef.current) return;

    const initChart = async () => {
      try {
        let attempts = 0;
        let LightweightCharts = window.LightweightCharts;
        
        while (!LightweightCharts && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          LightweightCharts = window.LightweightCharts;
          attempts++;
        }
        if (!LightweightCharts) return;

        const rect = chartContainerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        if (chartRef.current) chartRef.current.remove();

        chartRef.current = LightweightCharts.createChart(chartContainerRef.current, {
          width: rect.width,
          height: rect.height,
          layout: { background: { type: 'solid', color: '#0f172a' }, textColor: '#cbd5e1' },
          grid: { vertLines: { color: 'rgba(71, 85, 105, 0.3)' }, horzLines: { color: 'rgba(71, 85, 105, 0.3)' } },
          crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
          timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#475569' },
          rightPriceScale: { borderColor: '#475569' },
        });

        candleSeriesRef.current = chartRef.current.addCandlestickSeries({
          upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
        });

        smaSeriesRef.current = chartRef.current.addLineSeries({ color: '#3b82f6', lineWidth: 2, crosshairMarkerVisible: false });

        const resizeObserver = new ResizeObserver(() => {
          if (chartRef.current && chartContainerRef.current) {
            const newRect = chartContainerRef.current.getBoundingClientRect();
            chartRef.current.applyOptions({ width: newRect.width, height: newRect.height });
          }
        });
        resizeObserver.observe(chartContainerRef.current);
      } catch (error) {
        console.error(error);
      }
    };
    setTimeout(() => initChart(), 100);
  }, [isConnected]);

  // 2. Conexão WebSocket Deriv e Callbacks
  const handleConnect = async () => {
    if (!apiToken.trim()) {
      setLoginError('Insira um token válido'); return;
    }
    setIsLoading(true); setLoginError('');

    try {
      wsRef.current = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
      wsRef.current.onopen = () => wsRef.current.send(JSON.stringify({ authorize: apiToken }));
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
          setLoginError(data.error.message); setIsLoading(false); return;
        }

        // Autorização
        if (data.msg_type === 'authorize') {
          setIsConnected(true); setIsLoading(false);
          setAccountBalance(`${data.authorize.balance} ${data.authorize.currency}`);
          setAccountType(data.authorize.is_virtual ? 'DEMO' : 'REAL');
          wsRef.current.send(JSON.stringify({ balance: 1, subscribe: 1 }));
          loadAssetStream(asset);
        }

        // Recebendo Saldo
        if (data.msg_type === 'balance') {
          setAccountBalance(`${data.balance.balance} ${data.balance.currency}`);
        }

        // Velas Históricas
        if (data.msg_type === 'candles') {
          const newCandleData = data.candles.map(c => ({
            time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close,
          }));
          setCandleData(newCandleData);
          if (candleSeriesRef.current) candleSeriesRef.current.setData(newCandleData);
          if (smaSeriesRef.current) smaSeriesRef.current.setData(calcSMA(newCandleData, 20));
          if (data.subscription) activeCandleSubRef.current = data.subscription.id;
        }

        // Preço em Tempo Real (Tick)
        if (data.msg_type === 'ohlc') {
          const c = data.ohlc;
          const liveCandle = { time: c.open_time, open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close) };
          if (candleData.length > 0 && candleSeriesRef.current) candleSeriesRef.current.update(liveCandle);
          setCurrentPrice(liveCandle.close.toFixed(asset.includes('JPY') ? 3 : 5));
        }

        // === COMPRA BEM SUCEDIDA ===
        if (data.msg_type === 'buy') {
          const id = data.buy.contract_id || data.buy.transaction_id;
          setActiveContractId(data.buy.contract_id);
          setActualEntryPrice(parseFloat(currentPrice)); // Salva a taxa real de entrada
          isClosingRef.current = false;
          setAiMessage(`✅ Ordem Aberta! Contrato: ${id}. Gerenciando operação...`);
        }

        // === VENDA BEM SUCEDIDA (BOT PARADO) ===
        if (data.msg_type === 'sell') {
          setActiveContractId(null);
          setActualEntryPrice(null);
          isClosingRef.current = false;
          setSignal(null);
          setAiMessage(`🛑 Operação fechada. Vendido por: $${data.sell.sold_for}`);
          
          // SOLICITA ATUALIZAÇÃO IMEDIATA DO SALDO APÓS FECHAR
          wsRef.current.send(JSON.stringify({ balance: 1 }));
        }
      };

      wsRef.current.onerror = () => { setLoginError('Erro de conexão com o servidor'); setIsLoading(false); };
      wsRef.current.onclose = () => setIsConnected(false);
    } catch (error) {
      setLoginError('Erro ao conectar'); setIsLoading(false);
    }
  };

  // 3. Monitoramento de PnL e Auto-Fechamento (TP/SL)
  useEffect(() => {
    // SÓ calcula e monitora se houver um contrato realmente aberto
    if (activeContractId && actualEntryPrice && signal) {
      const currentPriceNum = parseFloat(currentPrice);
      
      // Cálculo de Lucro/Perda
      const pl = signal.type === 'CALL' 
        ? (currentPriceNum - actualEntryPrice) * parseFloat(stake)
        : (actualEntryPrice - currentPriceNum) * parseFloat(stake);
        
      setProfitLoss(pl);
      setProfitLossPercent((pl / (actualEntryPrice * parseFloat(stake))) * 100);

      // Gatilhos de TP e SL Client-Side
      const targetTP = manualTP ? parseFloat(manualTP) : signal.tp;
      const targetSL = manualSL ? parseFloat(manualSL) : signal.sl;

      if (signal.type === 'CALL') {
         if (currentPriceNum >= targetTP) handleStopBot("Take Profit alcançado!");
         if (currentPriceNum <= targetSL) handleStopBot("Stop Loss alcançado!");
      } else { // PUT
         if (currentPriceNum <= targetTP) handleStopBot("Take Profit alcançado!");
         if (currentPriceNum >= targetSL) handleStopBot("Stop Loss alcançado!");
      }
    } else {
      // Zera o display se não tiver contrato
      setProfitLoss(0);
      setProfitLossPercent(0);
    }
  }, [currentPrice, activeContractId, actualEntryPrice, signal, stake, manualTP, manualSL]);

  // Utilitários 
  const calcSMA = (data, period) => {
    const sma = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j].close;
      sma.push({ time: data[i].time, value: sum / period });
    }
    return sma;
  };

  const loadAssetStream = (selectedAsset) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (activeCandleSubRef.current) {
      wsRef.current.send(JSON.stringify({ forget: activeCandleSubRef.current }));
      activeCandleSubRef.current = null;
    }
    wsRef.current.send(JSON.stringify({
      ticks_history: selectedAsset, style: 'candles', end: 'latest', count: 100,
      granularity: timeframe === '5M' ? 300 : 900, subscribe: 1,
    }));
    const assetNames = { R_10: 'Volatility 10', R_25: 'Volatility 25', frxEURUSD: 'EUR/USD' };
    setChartTitle(assetNames[selectedAsset] || selectedAsset);
    setIsWeekend((new Date().getDay() === 0 || new Date().getDay() === 6) && selectedAsset.startsWith('frx'));
  };

  const handleAnalyze = async () => {
    if (isWeekend || candleData.length < 50) {
      setAiMessage('❌ Mercado fechado ou dados insuficientes.'); return;
    }
    setIsAnalyzing(true); setAiMessage('Analisando estrutura SMC do preço...');

    try {
      const highs = candleData.map(c => c.high);
      const lows = candleData.map(c => c.low);
      const currentPriceNum = candleData[candleData.length - 1].close;

      const maxPrice = Math.max(...highs.slice(-50));
      const minPrice = Math.min(...lows.slice(-50));

      await new Promise(r => setTimeout(r, 1000));

      if (candleSeriesRef.current) {
        priceLineRef.current.forEach(line => candleSeriesRef.current?.removePriceLine(line));
        const resLine = candleSeriesRef.current.createPriceLine({ price: maxPrice, color: '#EF4444', lineWidth: 2, lineStyle: 2, title: 'Resistência' });
        const supLine = candleSeriesRef.current.createPriceLine({ price: minPrice, color: '#10B981', lineWidth: 2, lineStyle: 2, title: 'Suporte' });
        priceLineRef.current = [resLine, supLine];
      }

      const midPoint = (maxPrice + minPrice) / 2;
      const isCall = currentPriceNum < midPoint;
      const pip = asset.startsWith('R_') ? 1.5 : asset.includes('JPY') ? 0.15 : 0.0015;

      setSignal({
        type: isCall ? 'CALL' : 'PUT',
        entry: currentPriceNum,
        tp: isCall ? currentPriceNum + pip * 2 : currentPriceNum - pip * 2,
        sl: isCall ? currentPriceNum - pip : currentPriceNum + pip,
      });

      setAiMessage(`✅ Sinal gerado para ${isCall ? 'CALL' : 'PUT'}. Configure os limites ou apenas execute.`);
    } catch (error) {
      setAiMessage('❌ Erro ao analisar. Tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecuteTrade = () => {
    if (!signal || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      buy: 1, price: parseFloat(stake),
      parameters: { amount: parseFloat(stake), basis: 'stake', contract_type: signal.type, currency: 'USD', duration: 1, duration_unit: 'm', symbol: asset }
    }));
  };

  // Vender (Parar) Operação
  const handleStopBot = (reason = '') => {
    if (activeContractId && wsRef.current && !isClosingRef.current) {
      isClosingRef.current = true; // Impede cliques duplicados
      setAiMessage(`🛑 ${reason} Encerrando operação na corretora...`);
      wsRef.current.send(JSON.stringify({ sell: activeContractId, price: 0 }));
    } else if (!activeContractId) {
      setSignal(null);
      setAiMessage('🛑 Bot resetado. Nenhuma operação estava aberta.');
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
              <TrendingUp className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">SMC <span className="text-blue-400">BOT</span></h1>
          </div>
          <div className="space-y-5">
            <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="Cole aqui seu Token API Deriv" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
            {loginError && <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded flex items-center gap-2"><AlertCircle size={16}/> {loginError}</p>}
            <button onClick={handleConnect} disabled={isLoading} className="w-full py-4 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 transition">
              {isLoading ? 'CONECTANDO...' : 'CONECTAR A DERIV'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans">
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex justify-between items-center text-white">
        <div className="flex items-center gap-2"><TrendingUp className="text-blue-400 w-5 h-5"/> <b className="tracking-wide">SMC AI BOT</b></div>
        <div className="text-sm border border-slate-700 px-3 py-1 rounded bg-slate-900 flex items-center gap-2">
          <span className="text-blue-400 font-bold bg-blue-500/20 px-2 rounded">{accountType}</span> 
          <span className="text-green-400 font-mono font-bold">{accountBalance}</span>
        </div>
      </header>

      {/* Painel de Controles */}
      <div className="bg-slate-800/50 border-b border-slate-700 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col"><label className="text-[10px] text-slate-400 mb-1 uppercase">Ativo</label>
        <select value={asset} onChange={(e) => { setAsset(e.target.value); loadAssetStream(e.target.value); }} className="bg-slate-900 border border-slate-600 text-white p-2 rounded text-sm focus:border-blue-500 outline-none">
          <option value="R_10">Volatility 10</option>
          <option value="R_25">Volatility 25</option>
          <option value="frxEURUSD">EUR/USD</option>
        </select></div>
        
        <div className="flex flex-col"><label className="text-[10px] text-slate-400 mb-1 uppercase">Tempo</label>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="bg-slate-900 border border-slate-600 text-white p-2 rounded text-sm focus:border-blue-500 outline-none">
          <option value="5M">5 Min</option><option value="15M">15 Min</option>
        </select></div>

        <div className="flex flex-col"><label className="text-[10px] text-slate-400 mb-1 uppercase">Stake ($)</label>
        <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} className="w-20 bg-slate-900 border border-slate-600 text-white p-2 rounded text-center text-sm focus:border-blue-500 outline-none" /></div>

        <div className="flex flex-col"><label className="text-[10px] text-green-400 mb-1 uppercase font-bold">TP Preço (Opcional)</label>
        <input type="number" step="0.00001" placeholder="Auto" value={manualTP} onChange={(e) => setManualTP(e.target.value)} className="w-24 bg-slate-900 border border-slate-600 text-green-300 p-2 rounded text-center text-sm focus:border-green-500 outline-none" /></div>

        <div className="flex flex-col"><label className="text-[10px] text-red-400 mb-1 uppercase font-bold">SL Preço (Opcional)</label>
        <input type="number" step="0.00001" placeholder="Auto" value={manualSL} onChange={(e) => setManualSL(e.target.value)} className="w-24 bg-slate-900 border border-slate-600 text-red-300 p-2 rounded text-center text-sm focus:border-red-500 outline-none" /></div>

        <button onClick={handleAnalyze} disabled={isAnalyzing || isWeekend || activeContractId !== null} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-sm font-bold text-white transition disabled:opacity-50">
          {isAnalyzing ? 'ANALISANDO...' : '📊 ANALISAR GRÁFICO'}
        </button>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Gráfico */}
        <section className="lg:col-span-3 bg-slate-800/50 border border-slate-700 rounded-xl relative shadow-xl">
          <div className="absolute top-4 left-4 z-10 bg-slate-900/80 px-3 py-1 rounded text-white text-xs font-mono border border-slate-700">
            {chartTitle} - <span className="text-cyan-400">{currentPrice}</span>
          </div>
          <div ref={chartContainerRef} className="w-full h-[400px] lg:h-[600px] rounded-xl overflow-hidden" />
        </section>

        {/* Sidebar Status e Controle */}
        <section className="flex flex-col gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 shadow-xl">
            <h2 className="text-xs text-slate-400 mb-2 uppercase font-bold flex items-center gap-2">🧠 Analista IA</h2>
            <div className="bg-slate-900/50 border border-slate-700 p-3 rounded font-mono text-sm h-28 overflow-auto text-slate-300 leading-relaxed">{aiMessage}</div>
          </div>

          {signal && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-xl flex-1 flex flex-col">
              <h2 className="text-center text-4xl font-black mb-4 tracking-wider" style={{color: signal.type==='CALL'?'#4ade80':'#f87171'}}>
                {signal.type === 'CALL' ? 'CALL ↗' : 'PUT ↘'}
              </h2>
              
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm font-mono space-y-3 mb-6">
                <div className="flex justify-between pb-2 border-b border-slate-700">
                  <span className="text-slate-400">Entry:</span>
                  <span className="font-bold">{actualEntryPrice ? actualEntryPrice.toFixed(5) : signal.entry.toFixed(5)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-700">
                  <span className="text-green-400">TP:</span>
                  <span className="text-green-400 font-bold">{manualTP ? parseFloat(manualTP).toFixed(5) : signal.tp.toFixed(5)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-700">
                  <span className="text-red-400">SL:</span>
                  <span className="text-red-400 font-bold">{manualSL ? parseFloat(manualSL).toFixed(5) : signal.sl.toFixed(5)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">P&L (Live):</span>
                  {activeContractId ? (
                    <span className={`font-bold ${profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${profitLoss.toFixed(2)} ({profitLossPercent.toFixed(2)}%)
                    </span>
                  ) : (
                    <span className="text-slate-600 italic">Aguardando...</span>
                  )}
                </div>
              </div>

              <div className="mt-auto space-y-3">
                {!activeContractId && (
                  <button onClick={handleExecuteTrade} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition text-lg">
                    ⚡ EXECUTAR ORDEM
                  </button>
                )}
                
                <button onClick={() => handleStopBot('Manual')} className={`w-full text-white font-bold py-4 rounded-lg transition text-sm ${activeContractId ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-600 hover:bg-slate-500'}`}>
                  {activeContractId ? '🛑 FECHAR OPERAÇÃO' : '🗑️ LIMPAR ANÁLISE'}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<TradingBot />);
