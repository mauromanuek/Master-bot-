import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas):
    """
    Core Engine: Lógica de Pivôs e Rejeição de Preço
    """
    if not velas or len(velas) < 20:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Buffer incompleto"}

    try:
        fechamentos = [float(v.get('c', 0)) for v in velas]
        maximas = [float(v.get('h', 0)) for v in velas]
        minimas = [float(v.get('l', 0)) for v in velas]
        
        atual = fechamentos[-1]
        # Médias Rápidas para Tendência
        sma_curta = sum(fechamentos[-10:]) / 10
        sma_longa = sum(fechamentos[-20:]) / 20
        
        # Zonas de Sniper (Últimas 15 velas para Scalping)
        resistencia = max(maximas[-15:-1])
        suporte = min(minimas[-15:-1])
        range_volatilidade = (resistencia - suporte) * 0.15 # 15% de margem

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Mercado em acumulação (sem tendência clara)"

        # ESTRATÉGIA 1: PIVÔ DE ALTA (Tendência + Rompimento)
        if sma_curta > sma_longa:
            if atual > resistencia:
                direcao = "CALL"
                confianca = 88
                motivo = f"SNIPER: Rompimento de Topo em {resistencia:.2f}"
            elif atual <= (suporte + range_volatilidade):
                direcao = "CALL"
                confianca = 82
                motivo = "REJEIÇÃO: Compra em zona de fundo ascendente"

        # ESTRATÉGIA 2: PIVÔ DE BAIXA (Tendência + Rompimento)
        elif sma_curta < sma_longa:
            if atual < suporte:
                direcao = "PUT"
                confianca = 88
                motivo = f"SNIPER: Rompimento de Fundo em {suporte:.2f}"
            elif atual >= (resistencia - range_volatilidade):
                direcao = "PUT"
                confianca = 82
                motivo = "RETESTE: Venda em zona de topo descendente"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Sniper Quant V2",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": str(e)}

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    dados = request.get_json(force=True, silent=True)
    if not dados: return jsonify({"error": "No data"}), 400
    
    resultado = motor_sniper_core(dados.get('asset'), dados.get('contexto_velas', []))
    
    # Mantém o formato compatível com o seu AnaliseGeral.js
    return jsonify({
        "choices": [{"message": {"content": json.dumps(resultado)}}]
    })

# MISSÃO 3: NOVO ENDPOINT PARA O RADAR TOP 3
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
