import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# CORS configurado para permitir a comunicação com o seu GitHub Pages
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas, agressividade="high"):
    """
    Core Engine Otimizada: MODO SNIPER (EMA 3/5 + Momentum Curto)
    Focado em reatividade instantânea com apenas 8-10 velas.
    """
    # GATILHO SNIPER: Liberamos a análise com apenas 8 velas para o bot não ficar 'preso'
    min_velas = 8 
    
    if not velas or len(velas) < min_velas:
        return {
            "direcao": "NEUTRO", 
            "confianca": 0, 
            "motivo": f"Sincronizando: {len(velas) if velas else 0}/{min_velas} velas"
        }

    try:
        # Extração de preços eficiente
        fechamentos = []
        maximas = []
        minimas = []

        for v in velas:
            c = float(v.get('c') if v.get('c') is not None else v.get('close', 0))
            h = float(v.get('h') if v.get('h') is not None else v.get('high', 0))
            l = float(v.get('l') if v.get('l') is not None else v.get('low', 0))
            
            if c > 0:
                fechamentos.append(c)
                maximas.append(h)
                minimas.append(l)

        # Re-checagem após limpeza de dados
        if len(fechamentos) < min_velas:
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Buffer insuficiente"}

        atual = fechamentos[-1]
        
        # Função interna de EMA
        def calcular_ema(dados, periodo):
            if not dados: return 0
            k = 2 / (periodo + 1)
            ema = dados[0]
            for preco in dados[1:]:
                ema = (preco * k) + (ema * (1 - k))
            return ema

        # AJUSTE SNIPER: Médias Curtas para Scalping de 1-5 Ticks/Minutos
        ema_super_fast = calcular_ema(fechamentos, 3) 
        ema_fast = calcular_ema(fechamentos, 5)       
        
        # SNIPER: Micro-Resistência e Suporte (Reduzido para as últimas 4 velas)
        # Isso identifica rompimentos muito mais cedo.
        resistencia_curta = max(maximas[-4:])
        suporte_curto = min(minimas[-4:])
        
        # Volatilidade (ATR simplificado das últimas 5 velas)
        atp_calc = sum([maximas[i] - minimas[i] for i in range(max(-5, -len(maximas)), 0)]) / 5
        atp = max(atp_calc, 0.00000001)

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando Explosão"
        
        # Momentum em relação ao candle imediatamente anterior
        momentum = atual - fechamentos[-2]

        # --- LÓGICA DE DECISÃO SNIPER ---
        
        # 1. GATILHO CALL (ALTA)
        # Se a média de 3 cruza a de 5 e o preço rompe a máxima das últimas 4 velas
        if ema_super_fast > (ema_fast + (atp * 0.02)):
            if atual >= resistencia_curta and momentum > 0:
                direcao = "CALL"
                confianca = 91 if agressividade == "high" else 80
                motivo = "SNIPER: Rompimento de micro-topo detectado"
            elif atual <= (suporte_curto + (atp * 0.05)):
                direcao = "CALL"
                confianca = 85
                motivo = "REJEIÇÃO: Reteste de suporte curto"

        # 2. GATILHO PUT (BAIXA)
        # Se a média de 3 cai abaixo da de 5 e o preço rompe a mínima das últimas 4 velas
        elif ema_super_fast < (ema_fast - (atp * 0.02)):
            if atual <= suporte_curto and momentum < 0:
                direcao = "PUT"
                confianca = 91 if agressividade == "high" else 80
                motivo = "SNIPER: Rompimento de micro-fundo detectado"
            elif atual >= (resistencia_curta - (atp * 0.05)):
                direcao = "PUT"
                confianca = 85
                motivo = "REJEIÇÃO: Reteste de resistência curta"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Scalper-Sniper V2.5",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": f"Erro Engine: {str(e)}"}

# --- ROTAS API ---

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados: return jsonify({"error": "No data"}), 400
        
        agressividade = dados.get('config', {}).get('agressividade', 'high')
        resultado = motor_sniper_core(
            dados.get('asset'), 
            dados.get('contexto_velas', []),
            agressividade=agressividade
        )
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
            return jsonify({"error": "Pacote inválido"}), 400
        
        resultados = []
        for item in dados['pacote_ativos']:
            analise = motor_sniper_core(item['asset'], item['velas'], agressividade="high")
            if analise['direcao'] != "NEUTRO":
                resultados.append(analise)
        
        top3 = sorted(resultados, key=lambda x: x['confianca'], reverse=True)[:3]
        return jsonify({"top3": top3})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
