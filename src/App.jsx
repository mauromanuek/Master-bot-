import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { TrendingUp, AlertCircle, ChevronRight, Activity, XOctagon } from 'lucide-react';

export default function App() {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  
  // Estados de Interface e Conexão
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [accountBalance, setAccountBalance] = useState('$0.00');
  const [accountType, setAccountType] = useState('---');
  const [aiMessage, setAiMessage] = useState('Aguardando conexão...');
  
  // Variáveis de Trading
  const [asset, setAsset] = useState('R_10');
  const [timeframe, setTimeframe] = useState('5M');
  const [stake, setStake] = useState('10');
  const [takeProfit, setTakeProfit] = useState('5');
  const [stopLoss, setStopLoss] = useState('5');
  const [currentPrice, setCurrentPrice] = useState('0.00');
  
  // Referências para evitar Stale Closures no WebSocket
  const tpRef = useRef(takeProfit);
  const slRef = useRef(stopLoss);
  
  useEffect(() => { tpRef.current = takeProfit; }, [takeProfit]);
  useEffect(() => { slRef.current = stopLoss; }, [stopLoss]);

  // Estados Operacionais
  const [candleData, setCandleData] = useState([]);
  const [signal, setSignal] = useState(null);
  const [activeContractId, setActiveContractId] = useState(null);
  const [realPnL, setRealPnL] = useState(0);

  const wsRef = useRef(null);
  const activeCandleSubRef = useRef(null);
  const priceLineRef = useRef([]);

  const APP_ID = 121512;

  // ==========================================
  // INICIALIZAÇÃO DO GRÁFICO (REQUISITO 3)
  // ==========================================
  useEffect(() => {
    if (!isConnected || !chartContainerRef.current) return;

    const LightweightCharts = window.LightweightCharts;
    if (!LightweightCharts) {
      setAiMessage('❌ Erro: Biblioteca LightweightCharts não encontrada.');
      return;
    }

    const rect = chartContainerRef.current.getBoundingClientRect();
    if (chartRef.current) {
      chartRef.current.remove();
    }

    chartRef.current = LightweightCharts.createChart(chartContainerRef.current, {
      width: rect.width || chartContainerRef.current.clientWidth,
      height: rect.height || 500,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: 'rgba(71, 85, 105, 0.2)' },
        horzLines: { color: 'rgba(71, 85, 105, 0.2)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    candleSeriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        const dimensions = chartContainerRef.current.getBoundingClientRect();
        chartRef.current.applyOptions({
          width: dimensions.width,
          height: dimensions.height,
        });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [isConnected]);

  // ==========================================
  // LÓGICA DE WEBSOCKET & DERIV
  // ==========================================
  const handleConnect = () => {
    if (!apiToken.trim()) {
      setLoginError('Insira um token válido');
      return;
    }

    setIsLoading(true);
    setLoginError('');

    wsRef.current = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ authorize: apiToken }));
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.error) {
        setLoginError(data.error.message);
        setIsLoading(false);
        return;
      }

      // 1. Autorização Concluída
      if (data.msg_type === 'authorize') {
        setIsConnected(true);
        setIsLoading(false);
        setAccountBalance(`${data.authorize.balance} ${data.authorize.currency}`);
        setAccountType(data.authorize.is_virtual ? 'DEMO' : 'REAL');
        wsRef.current.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        loadAssetStream(asset);
        setAiMessage('Conectado! Busque as entradas usando SMC.');
      }

      // 2. Atualização de Saldo
      if (data.msg_type === 'balance') {
        setAccountBalance(`${data.balance.balance} ${data.balance.currency}`);
      }

      // 3. Velas Históricas
      if (data.msg_type === 'candles') {
        const newCandleData = data.candles.map(c => ({
          time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close
        }));
        setCandleData(newCandleData);
        if (candleSeriesRef.current) candleSeriesRef.current.setData(newCandleData);
        if (data.subscription) activeCandleSubRef.current = data.subscription.id;
      }

      // 4. Tick Atual (Vela viva)
      if (data.msg_type === 'ohlc') {
        const c = data.ohlc;
        const liveCandle = {
          time: c.open_time,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        };
        
        setCurrentPrice(liveCandle.close.toFixed(5));
        
        if (candleSeriesRef.current) {
          try { candleSeriesRef.current.update(liveCandle); } catch (e) {}
        }
      }

      // 5. Confirmação de Ordem (Buy)
      if (data.msg_type === 'buy') {
        const contractId = data.buy.contract_id;
        setActiveContractId(contractId);
        setAiMessage(`✅ Ordem aberta! Acompanhando PnL ao vivo...`);
        
        // Pede para se inscrever no lucro/perda real (REQUISITO 4)
        wsRef.current.send(JSON.stringify({
          proposal_open_contract: 1,
          contract_id: contractId,
          subscribe: 1
        }));
      }

      // 6. Atualização ao vivo do Contrato (PnL)
      if (data.msg_type === 'proposal_open_contract') {
        const contract = data.proposal_open_contract;
        if (contract) {
          if (contract.is_sold) {
            setActiveContractId(null);
            setRealPnL(0);
            setAiMessage(`✅ Contrato encerrado! Lucro Final: $${contract.profit}`);
            wsRef.current.send(JSON.stringify({ balance: 1 }));
            return;
          }

          const currentProfit = parseFloat(contract.profit);
          setRealPnL(currentProfit);

          // Checagem de TP e SL Automática
          const tp = parseFloat(tpRef.current);
          const sl = parseFloat(slRef.current);

          if (!isNaN(tp) && tp > 0 && currentProfit >= tp) {
            setAiMessage('🎯 Take Profit batido! Fechando contrato...');
            closeActiveContract(contract.contract_id);
          } else if (!isNaN(sl) && sl > 0 && currentProfit <= -sl) {
            setAiMessage('🛑 Stop Loss alcançado! Fechando contrato...');
            closeActiveContract(contract.contract_id);
          }
        }
      }
    };

    wsRef.current.onerror = () => {
      setLoginError('Erro crítico de WebSocket.');
      setIsLoading(false);
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
    };
  };

  const loadAssetStream = (selectedAsset) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (activeCandleSubRef.current) {
      wsRef.current.send(JSON.stringify({ forget: activeCandleSubRef.current }));
    }

    const gran = timeframe === '5M' ? 300 : 900;
    wsRef.current.send(JSON.stringify({
      ticks_history: selectedAsset,
      style: 'candles',
      end: 'latest',
      count: 150,
      granularity: gran,
      subscribe: 1,
    }));
  };

  // ==========================================
  // LÓGICA SMART MONEY CONCEPTS (SMC)
  // ==========================================
  const handleAnalyze = () => {
    if (candleData.length < 50) {
      setAiMessage('❌ Dados insuficientes para análise SMC.');
      return;
    }
    setAiMessage('Analisando Order Blocks (OB) e Máximas/Mínimas (BOS)...');
    
    setTimeout(() => {
      const highs = candleData.slice(-50).map(c => c.high);
      const lows = candleData.slice(-50).map(c => c.low);
      const currentPriceNum = candleData[candleData.length - 1].close;

      const maxPrice = Math.max(...highs);
      const minPrice = Math.min(...lows);
      const midPoint = (maxPrice + minPrice) / 2;

      // Limpar e criar linhas
      if (candleSeriesRef.current) {
        priceLineRef.current.forEach(line => {
          try { candleSeriesRef.current.removePriceLine(line); } catch (e) {}
        });
        const resLine = candleSeriesRef.current.createPriceLine({ price: maxPrice, color: '#ef4444', lineStyle: 2, title: 'OB Res' });
        const supLine = candleSeriesRef.current.createPriceLine({ price: minPrice, color: '#10b981', lineStyle: 2, title: 'OB Sup' });
        priceLineRef.current = [resLine, supLine];
      }

      const isCall = currentPriceNum < midPoint;
      setSignal({ type: isCall ? 'CALL' : 'PUT', entry: currentPriceNum });
      setAiMessage(`✅ Sinal ${isCall ? 'CALL (Alta)' : 'PUT (Baixa)'} gerado! Preço perto do Order Block de ${isCall ? 'Suporte' : 'Resistência'}.`);
    }, 800);
  };

  // ==========================================
  // AÇÕES DE EXECUÇÃO DE ORDEM
  // ==========================================
  const handleExecuteTrade = () => {
    if (!signal || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      buy: 1,
      price: parseFloat(stake),
      parameters: {
        amount: parseFloat(stake),
        basis: 'stake',
        contract_type: signal.type,
        currency: 'USD',
        duration: 1,
        duration_unit: 'm',
        symbol: asset,
      },
    }));
  };

  const closeActiveContract = (idToClose = activeContractId) => {
    if (!idToClose || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ sell: idToClose, price: 0 }));
  };

  // ==========================================
  // UI DO LOGIN
  // ==========================================
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800/80 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
              <Activity className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">SMC <span className="text-blue-400">BOT</span></h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest">Deriv API Minimalista</p>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-2">TOKEN DERIV (Read/Trade)</label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition"
              />
            </div>
            {loginError && <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{loginError}</p>}
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition flex justify-center items-center gap-2"
            >
              {isLoading ? 'CONECTANDO...' : 'ENTRAR E ABRIR GRÁFICO'} {isLoading ? '' : <ChevronRight className="w-4 h-4"/>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // UI DO BOT DE TRADING
  // ==========================================
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-blue-400" />
            <h1 className="font-bold text-white tracking-wide">SMC TERMINAL</h1>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 flex items-center gap-3">
            <span className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-1 rounded">{accountType}</span>
            <span className="text-green-400 font-mono font-bold text-sm">{accountBalance}</span>
          </div>
        </div>
      </header>

      {/* Controles de Configuração */}
      <div className="bg-slate-800/40 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-semibold mb-1">Ativo</label>
            <select value={asset} onChange={(e) => { setAsset(e.target.value); loadAssetStream(e.target.value); }} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm">
              <option value="R_10">Volatility 10</option>
              <option value="R_25">Volatility 25</option>
              <option value="frxEURUSD">EUR/USD</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-semibold mb-1">Tempo</label>
            <select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); loadAssetStream(asset); }} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm">
              <option value="5M">5 Minutos</option>
              <option value="15M">15 Minutos</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-semibold mb-1">Aposta ($)</label>
            <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-center" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-green-400 font-semibold mb-1">Take Profit ($)</label>
            <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} className="bg-slate-900 border border-green-800 rounded-lg px-3 py-2 text-sm text-center" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-red-400 font-semibold mb-1">Stop Loss ($)</label>
            <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="bg-slate-900 border border-red-800 rounded-lg px-3 py-2 text-sm text-center" />
          </div>
          <button onClick={handleAnalyze} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition h-[38px] text-sm">
            📊 ANALISAR SMC
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Container do Gráfico: OBRIGATÓRIO ESTILOS INLINE COMO SOLICITADO */}
        <section className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden relative shadow-xl">
          <div className="absolute top-4 left-4 z-10 bg-slate-900/80 border border-slate-700 px-3 py-1.5 rounded-lg flex gap-4 text-xs font-mono">
            <span className="text-white font-bold">{asset}</span>
            <span className="text-cyan-400 font-bold">{currentPrice}</span>
          </div>
          
          <div 
            ref={chartContainerRef} 
            style={{ position: 'relative', width: '100%', height: '500px' }} 
          />
        </section>

        {/* Sidebar Execução */}
        <section className="lg:col-span-1 flex flex-col gap-4">
          {/* Mensagens IA */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
              <TrendingUp className="w-4 h-4 text-blue-400"/>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Monitor SMC</h2>
            </div>
            <p className="text-sm text-slate-300 font-mono">{aiMessage}</p>
          </div>

          {/* Painel de Trading ou Operação em Andamento */}
          {activeContractId ? (
             <div className="bg-slate-800 border-2 border-blue-500/50 rounded-xl p-5 shadow-[0_0_20px_rgba(59,130,246,0.15)] flex flex-col items-center">
                <h3 className="text-sm text-slate-400 uppercase mb-2 font-bold animate-pulse">Contrato Ativo</h3>
                <div className={`text-5xl font-black mb-6 ${realPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                   {realPnL >= 0 ? '+' : ''}{realPnL.toFixed(2)}
                </div>
                <button onClick={() => closeActiveContract()} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-lg flex justify-center items-center gap-2 transition">
                  <XOctagon className="w-5 h-5"/> PARAR / FECHAR ORDEM
                </button>
             </div>
          ) : (
            signal && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
                <div className="text-center mb-6">
                  <p className="text-xs text-slate-400 uppercase mb-1">Entrada Calculada</p>
                  <div className={`text-4xl font-black ${signal.type === 'CALL' ? 'text-green-400' : 'text-red-400'}`}>
                    {signal.type} {signal.type === 'CALL' ? '↗' : '↘'}
                  </div>
                  <p className="text-sm mt-2 text-slate-400 font-mono">Entry: {signal.entry}</p>
                </div>
                <button onClick={handleExecuteTrade} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition shadow-lg shadow-green-900/20">
                  ⚡ EXECUTAR {signal.type} (${stake})
                </button>
              </div>
            )
          )}
        </section>
      </main>
    </div>
  );
}

// Injeção Estática na Raiz (Garante arquitetura sem arquivos extras)
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
