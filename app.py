import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas):
    """
    Core Engine: Lógica de Pivôs, Rejeição e Momentum Adaptativo
    """
    # BUFFER: Aumentado para garantir estabilidade dos cálculos matemáticos
    if not velas or len(velas) < 20:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Buffer incompleto"}

    try:
        fechamentos = [float(v.get('c', 0)) for v in velas]
        maximas = [float(v.get('h', 0)) for v in velas]
        minimas = [float(v.get('l', 0)) for v in velas]
        
        atual = fechamentos[-1]
        
        # MÉDIAS SNIPER: Identificação de Micro-Tendência
        sma_curta = sum(fechamentos[-8:]) / 8  # Mais rápida para Scalping
        sma_longa = sum(fechamentos[-20:]) / 20
        
        # ZONAS DE PREÇO (Dinâmicas)
        resistencia = max(maximas[-15:-1])
        suporte = min(minimas[-15:-1])
        
        # Ajuste Adaptativo: Margem reduzida para 10% para aumentar a sensibilidade sniper
        margem = (resistencia - suporte) * 0.10

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando definição de zona de impacto"

        # CÁLCULO DE MOMENTUM (Força da última vela)
        momentum = atual - fechamentos[-2]

        # ESTRATÉGIA 1: PIVÔ DE ALTA / REJEIÇÃO NO SUPORTE
        if sma_curta >= sma_longa:
            if atual > resistencia and momentum > 0:
                direcao = "CALL"
                confianca = 90
                motivo = f"ROMPIMENTO SNIPER: Alvo acima de {resistencia:.2f}"
            elif atual <= (suporte + margem):
                direcao = "CALL"
                confianca = 84
                motivo = "ZONA DE COMPRA: Rejeição de preço no suporte"

        # ESTRATÉGIA 2: PIVÔ DE BAIXA / RETESTE NA RESISTÊNCIA
        if direcao == "NEUTRO" and sma_curta <= sma_longa:
            if atual < suporte and momentum < 0:
                direcao = "PUT"
                confianca = 90
                motivo = f"ROMPIMENTO SNIPER: Alvo abaixo de {suporte:.2f}"
            elif atual >= (resistencia - margem):
                direcao = "PUT"
                confianca = 84
                motivo = "ZONA DE VENDA: Rejeição de preço na resistência"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Sniper Quant V2.1",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": f"Erro interno: {str(e)}"}

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    dados = request.get_json(force=True, silent=True)
    if not dados: return jsonify({"error": "No data"}), 400
    
    resultado = motor_sniper_core(dados.get('asset'), dados.get('contexto_velas', []))
    
    # OTIMIZAÇÃO: Retorno direto do objeto para reduzir latência no JSON.parse do frontend
    return jsonify({
        "choices": [{"message": {"content": json.dumps(resultado)}}]
    })

@app.route('/radar', methods=['POST'])
def radar():
    dados = request.get_json(force=True, silent=True)
    if not dados or 'pacote_ativos' not in dados:
        return jsonify({"error": "Formato de radar inválido"}), 400
    
    resultados = []
    for item in dados['pacote_ativos']:
        analise = motor_sniper_core(item['asset'], item['velas'])
        if analise['direcao'] != "NEUTRO":
            resultados.append(analise)
    
    # Ordena por maior confiança e pega os 3 melhores
    top3 = sorted(resultados, key=lambda x: x['confianca'], reverse=True)[:3]
    return jsonify({"top3": top3})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
