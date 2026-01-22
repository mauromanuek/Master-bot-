import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# CORS configurado para permitir a comunicação com o seu GitHub Pages
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas, agressividade="low"):
    """
    Core Engine: Scalping Agressivo baseado em Momentum e EMA.
    Esta função é o 'cérebro' único usado tanto pelo Bot quanto pelo Radar.
    """
    # Verificação de volume de dados
    min_velas = 10 if agressividade == "high" else 15
    if not velas or len(velas) < min_velas:
        return {
            "direcao": "NEUTRO", 
            "confianca": 0, 
            "motivo": f"Sincronizando: {len(velas) if velas else 0}/{min_velas} velas"
        }

    try:
        # Extração de preços com suporte a múltiplos formatos de API (Stream vs History)
        fechamentos = []
        maximas = []
        minimas = []

        for v in velas:
            # Tenta pegar 'c' (stream) ou 'close' (histórico), garantindo conversão para float
            c = float(v.get('c') if v.get('c') is not None else v.get('close', 0))
            h = float(v.get('h') if v.get('h') is not None else v.get('high', 0))
            l = float(v.get('l') if v.get('l') is not None else v.get('low', 0))
            
            if c > 0:
                fechamentos.append(c)
                maximas.append(h)
                minimas.append(l)

        if len(fechamentos) < min_velas:
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Buffer insuficiente"}

        atual = fechamentos[-1]
        
        # Cálculo de EMA (Média Móvel Exponencial)
        def calcular_ema(dados, periodo):
            if not dados: return 0
            k = 2 / (periodo + 1)
            ema = dados[0]
            for preco in dados[1:]:
                ema = (preco * k) + (ema * (1 - k))
            return ema

        ema_super_fast = calcular_ema(fechamentos, 3) 
        ema_fast = calcular_ema(fechamentos, 7)       
        
        # Micro-Resistência e Suporte (últimas 6 velas)
        resistencia_curta = max(maximas[-6:])
        suporte_curto = min(minimas[-6:])
        
        # Cálculo de Volatilidade para Gatilhos (ATP simplificado)
        atp_calc = sum([maximas[i] - minimas[i] for i in range(-5, 0)]) / 5
        atp = max(atp_calc, 0.00000001)

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando Gatilho"
        momentum = atual - fechamentos[-2]

        # --- LÓGICA DE DECISÃO ---
        
        # GATILHO CALL (ALTA)
        if ema_super_fast > (ema_fast + (atp * 0.05)):
            if atual >= resistencia_curta and momentum > (atp * 0.1):
                direcao = "CALL"
                confianca = 88 if agressividade == "high" else 75
                motivo = "ROMPIMENTO: Momentum de alta detectado"
            elif atual <= (suporte_curto + (atp * 0.1)):
                direcao = "CALL"
                confianca = 82
                motivo = "REJEIÇÃO: Suporte de micro-tendência"

        # GATILHO PUT (BAIXA)
        elif ema_super_fast < (ema_fast - (atp * 0.05)):
            if atual <= suporte_curto and momentum < -(atp * 0.1):
                direcao = "PUT"
                confianca = 88 if agressividade == "high" else 75
                motivo = "ROMPIMENTO: Momentum de baixa detectado"
            elif atual >= (resistencia_curta - (atp * 0.1)):
                direcao = "PUT"
                confianca = 82
                motivo = "REJEIÇÃO: Resistência de micro-tendência"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Scalper-Sniper V2.5",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": f"Erro: {str(e)}"}

# --- ROTAS ---

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    """Rota para análise contínua do ativo principal selecionado no bot"""
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados: return jsonify({"error": "No data"}), 400
        
        agressividade = dados.get('config', {}).get('agressividade', 'low')
        resultado = motor_sniper_core(
            dados.get('asset'), 
            dados.get('contexto_velas', []),
            agressividade=agressividade
        )
        # Formato compatível com o parser do frontend
        return jsonify({
            "choices": [{"message": {"content": json.dumps(resultado)}}]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/radar', methods=['POST'])
def radar():
    """Rota para varredura de múltiplos ativos simultâneos"""
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados or 'pacote_ativos' not in dados:
            return jsonify({"error": "Pacote inválido"}), 400
        
        resultados = []
        for item in dados['pacote_ativos']:
            # No radar, usamos agressividade 'high' para filtrar apenas as melhores entradas
            analise = motor_sniper_core(item['asset'], item['velas'], agressividade="high")
            if analise['direcao'] != "NEUTRO":
                resultados.append(analise)
        
        # Retorna o TOP 3 ordenado por confiança
        top3 = sorted(resultados, key=lambda x: x['confianca'], reverse=True)[:3]
        return jsonify({"top3": top3})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Porta dinâmica para deploy em nuvem (Render, Heroku, etc)
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
