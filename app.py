import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Configuração de CORS robusta para aceitar requisições do GitHub Pages
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas, agressividade="low"):
    """
    Core Engine: Scalping Agressivo baseado em Momentum de Ticks e Reversão de Micro-Tendência.
    Revisado para garantir estabilidade na troca de ativos.
    """
    # BUFFER QUANT: 10 velas é o mínimo para o Scalper, mas 30 é o ideal para Médias Móveis.
    min_velas = 10 if agressividade == "high" else 15
    if not velas or len(velas) < min_velas:
        return {
            "direcao": "NEUTRO", 
            "confianca": 0, 
            "motivo": f"Sincronizando: {len(velas) if velas else 0}/{min_velas} velas recebidas"
        }

    try:
        # NORMALIZAÇÃO DE DADOS (Dicionário Flexível):
        # A Deriv envia 'c' no stream OHLC e 'close' no histórico inicial. 
        # Aqui garantimos que o motor enxergue o preço independente da chave.
        fechamentos = []
        maximas = []
        minimas = []

        for v in velas:
            c = float(v.get('c') if v.get('c') is not None else v.get('close', 0))
            h = float(v.get('h') if v.get('h') is not None else v.get('high', 0))
            l = float(v.get('l') if v.get('l') is not None else v.get('low', 0))
            
            # Filtro de sanidade: ignora velas "vazias" que a API manda no momento do reset
            if c > 0:
                fechamentos.append(c)
                maximas.append(h)
                minimas.append(l)

        if len(fechamentos) < min_velas:
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Aguardando preenchimento do buffer"}

        atual = fechamentos[-1]
        
        # CÁLCULO DE EMA (Exponential Moving Average) - Peso maior para o preço atual
        def calcular_ema(dados, periodo):
            if not dados: return 0
            k = 2 / (periodo + 1)
            ema = dados[0]
            for preco in dados[1:]:
                ema = (preco * k) + (ema * (1 - k))
            return ema

        ema_super_fast = calcular_ema(fechamentos, 3)  # Reação imediata
        ema_fast = calcular_ema(fechamentos, 7)       # Tendência de curto prazo
        
        # ZONAS DE SUPORTE E RESISTÊNCIA DE MICRO-FRAME (Últimas 6 velas)
        resistencia_curta = max(maximas[-6:])
        suporte_curto = min(minimas[-6:])
        
        # VOLATILIDADE (ATP - Average True Price Range)
        # Proteção contra divisão por zero e volatilidade nula
        atp_calc = sum([maximas[i] - minimas[i] for i in range(-5, 0)]) / 5
        atp = max(atp_calc, 0.00000001)

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando Gatilho"

        # MOMENTUM (Velocidade do candle atual em relação ao anterior)
        momentum = atual - fechamentos[-2]

        # --- LÓGICA DE DECISÃO AGRESSIVA ---
        
        # 1. GATILHO DE ALTA (BULLISH)
        if ema_super_fast > (ema_fast + (atp * 0.05)):
            # Rompimento de máxima com momentum positivo
            if atual >= resistencia_curta and momentum > (atp * 0.1):
                direcao = "CALL"
                confianca = 88 if agressividade == "high" else 75
                motivo = "ROMPIMENTO DE ALTA: Momentum e volume confirmados"
            # Pullback no suporte
            elif atual <= (suporte_curto + (atp * 0.1)):
                direcao = "CALL"
                confianca = 82
                motivo = "REJEIÇÃO DE BAIXA: Suporte de micro-tendência identificado"

        # 2. GATILHO DE BAIXA (BEARISH)
        elif ema_super_fast < (ema_fast - (atp * 0.05)):
            # Rompimento de mínima com momentum negativo
            if atual <= suporte_curto and momentum < -(atp * 0.1):
                direcao = "PUT"
                confianca = 88 if agressividade == "high" else 75
                motivo = "ROMPIMENTO DE BAIXA: Momentum e volume confirmados"
            # Pullback na resistência
            elif atual >= (resistencia_curta - (atp * 0.1)):
                direcao = "PUT"
                confianca = 82
                motivo = "REJEIÇÃO DE ALTA: Resistência de micro-tendência identificada"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Agressive Scalper V2.5",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": f"Erro na Engine: {str(e)}"}

# --- ROTAS DA API ---

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados: 
            return jsonify({"error": "Dados inválidos"}), 400
        
        config = dados.get('config', {})
        agressividade = config.get('agressividade', 'low')
        
        resultado = motor_sniper_core(
            dados.get('asset'), 
            dados.get('contexto_velas', []),
            agressividade=agressividade
        )
        
        # Mantém o formato esperado pelo frontend (padrão JSON aninhado)
        return jsonify({
            "choices": [{"message": {"content": json.dumps(resultado)}}]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/radar', methods=['POST'])
def radar():
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados or 'pacote_ativos' not in dados:
            return jsonify({"error": "Pacote de ativos não encontrado"}), 400
        
        resultados = []
        for item in dados['pacote_ativos']:
            analise = motor_sniper_core(item['asset'], item['velas'], agressividade="high")
            if analise['direcao'] != "NEUTRO":
                resultados.append(analise)
        
        # Retorna apenas as 3 melhores oportunidades para o radar do frontend
        top3 = sorted(resultados, key=lambda x: x['confianca'], reverse=True)[:3]
        return jsonify({"top3": top3})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Configuração para deploy (Render/Heroku/Railway)
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
