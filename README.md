# SMC Trading Bot | Pro Charting

Bot de trading profissional com análise técnica avançada, totalmente independente e pronto para deploy.

## 🎯 Características

- ✅ **Análise Técnica Profissional**: RSI, MACD, Bollinger Bands, ATR
- ✅ **Múltiplos Ativos**: Monitore vários ativos simultaneamente
- ✅ **Indicadores de P&L**: Visualize ganhos/perdas em tempo real
- ✅ **Gerenciamento de Risco**: Stop Loss e Take Profit automáticos
- ✅ **Gráficos em Tempo Real**: TradingView Lightweight Charts
- ✅ **Interface Responsiva**: Funciona em desktop e mobile
- ✅ **100% Independente**: Sem dependências externas

## 📁 Estrutura de Arquivos

```
smc-bot-standalone/
├── index.html      # Interface principal
├── bot.js          # Lógica de trading e análise
├── README.md       # Este arquivo
└── package.json    # (Opcional) Para npm scripts
```

## 🚀 Como Usar

### 1. Localmente (Desenvolvimento)

```bash
# Abrir com Python (Python 3)
python -m http.server 8000

# Ou com Node.js (http-server)
npx http-server

# Ou com Live Server (VS Code)
# Instale a extensão "Live Server" e clique em "Go Live"
```

Acesse: `http://localhost:8000`

### 2. GitHub Pages (Gratuito)

1. Crie um repositório no GitHub chamado `smc-trading-bot`
2. Clone o repositório
3. Copie todos os arquivos para a pasta
4. Faça commit e push:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

5. Vá para **Settings → Pages**
6. Selecione **Deploy from a branch** e escolha `main`
7. Seu bot estará em: `https://seu-usuario.github.io/smc-trading-bot`

### 3. Render (Recomendado)

1. Crie conta em [render.com](https://render.com)
2. Clique em **New → Static Site**
3. Conecte seu repositório GitHub
4. Configure:
   - **Name**: smc-trading-bot
   - **Build Command**: (deixe em branco)
   - **Publish directory**: . (ponto)
5. Deploy automático!

### 4. Netlify

1. Acesse [netlify.com](https://netlify.com)
2. Clique em **New site from Git**
3. Conecte seu repositório
4. Configure:
   - **Build command**: (deixe em branco)
   - **Publish directory**: . (ponto)
5. Deploy!

### 5. Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em **New Project**
3. Importe seu repositório GitHub
4. Vercel detectará automaticamente como site estático
5. Deploy!

## 🔐 Obter Token Deriv

1. Acesse [app.deriv.com](https://app.deriv.com)
2. Faça login ou crie uma conta
3. Vá para **Settings → API tokens**
4. Clique em **Create new token**
5. Selecione as permissões:
   - `read` (ler dados)
   - `trade` (executar trades)
6. Copie o token e cole no bot

## 📊 Como Usar o Bot

### Conectar
1. Cole seu token Deriv no campo "Token API Deriv"
2. Clique em "Conectar"
3. Aguarde a conexão estabelecer

### Analisar
1. Selecione um ativo no dropdown
2. Clique em "Analisar Gráfico"
3. Aguarde a análise (mínimo 200 velas)
4. O bot mostrará o sinal (BUY/SELL) com confiança

### Executar Trade
1. Se houver sinal, clique em "Executar Trade"
2. O bot abrirá uma posição automaticamente
3. Monitore o P&L em tempo real

### Múltiplos Ativos
1. Clique em "+ Adicionar Ativo"
2. Selecione um novo ativo
3. O bot criará um gráfico adicional
4. Clique nas abas para alternar entre ativos

## 📈 Indicadores Técnicos

### RSI (Relative Strength Index)
- **< 30**: Sobrevenda (Sinal de BUY)
- **> 70**: Sobrecompra (Sinal de SELL)

### Bollinger Bands
- **Preço < Banda Inferior**: Sinal de BUY
- **Preço > Banda Superior**: Sinal de SELL

### MACD
- **Positivo**: Tendência de alta
- **Negativo**: Tendência de baixa

### ATR (Average True Range)
- Usado para calcular Stop Loss e Take Profit
- SL = Entrada - ATR × 1.5
- TP = Entrada + ATR × 3

## ⚙️ Configurações

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| Ativo Principal | R_10 | Volatility Index 10 |
| Risco por Trade | 2% | Percentual do saldo |
| Stake | 10 | Quantidade por trade |

## 🎨 Ativos Disponíveis

### Índices Sintéticos
- `R_10` - Volatility Index 10
- `R_25` - Volatility Index 25
- `R_50` - Volatility Index 50
- `R_100` - Volatility Index 100

### Forex
- `frxEURUSD` - Euro/USD
- `frxGBPUSD` - Libra/USD
- `frxAUDUSD` - Dólar Australiano/USD

## 🔧 Customização

### Mudar Cores
Edite `index.html` e procure por:
```css
background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
```

### Mudar Indicadores
Edite `bot.js` e modifique as funções:
- `calculateRSI()`
- `calculateMACD()`
- `calculateBollingerBands()`

### Mudar Períodos
```javascript
// RSI padrão: 14
calculateRSI(candles, 14)

// Bollinger padrão: 20
calculateBollingerBands(candles, 20)

// ATR padrão: 14
calculateATR(candles, 14)
```

## ⚠️ Disclaimer

Este bot é fornecido "como está" para fins educacionais. 

**Aviso Legal:**
- Não é uma recomendação de investimento
- Você é responsável por suas próprias decisões de trading
- Sempre use stop loss
- Nunca invista mais do que pode perder
- Teste em conta demo antes de usar em conta real

## 🐛 Troubleshooting

### "LightweightCharts não carregado"
- Verifique sua conexão com a internet
- Recarregue a página (F5)
- Limpe o cache (Ctrl+Shift+Delete)

### "Erro ao conectar"
- Verifique se o token é válido
- Confirme que o token tem permissões de `read` e `trade`
- Tente novamente em alguns segundos

### Gráfico não aparece
- Aguarde mais dados (mínimo 200 velas)
- Verifique se o ativo está disponível
- Recarregue a página

## 📞 Suporte

Para problemas ou sugestões:
1. Verifique o console (F12 → Console)
2. Procure por mensagens de erro
3. Reporte no GitHub Issues

## 📝 Licença

MIT License - Sinta-se livre para usar e modificar

## 🎓 Aprendizado

Para entender melhor o código:
- Leia os comentários em `bot.js`
- Estude as funções de indicadores
- Experimente mudar os parâmetros
- Teste em conta demo primeiro

## 🚀 Melhorias Futuras

- [ ] Backtesting engine
- [ ] Mais indicadores técnicos
- [ ] Alertas por email/SMS
- [ ] Histórico de trades persistente
- [ ] Exportar relatórios
- [ ] Machine Learning para sinais

---

**Versão**: 1.0.0  
**Última atualização**: 2026-03-11  
**Status**: Pronto para produção ✅
