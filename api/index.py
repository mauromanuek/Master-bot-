import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def calcular_sniper_engine(asset, velas, ticks):
    if not velas or len(velas) < 10:
        return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Aguardando", "motivo": "Dados insuficientes"}

    try:
        # Extração manual sem Numpy
        precos = [float(v.get('close', v.get('c', 0))) for v in velas]
        maximas = [float(v.get('high', v.get('h', 0))) for v in velas]
        minimas = [float(v.get('low', v.get('l', 0))) for v in velas]
        
        preco_atual = precos[-1]
        n = len(precos)

        # 1. TENDÊNCIA (Cálculo de Inclinação Manual)
        sum_x = sum(range(n))
        sum_y = sum(precos)
        sum_xy = sum(i * precos[i] for i in range(n))
        sum_x2 = sum(i**2 for i in range(n))
        
        # Fórmula da inclinação (slope): (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x**2)
        tendencia = "ALTA" if slope > 0 else "BAIXA"

        # 2. ZONAS DE MEMÓRIA (Suporte e Resistência manuais)
        suporte = min(minimas[:-1])
        resistencia = max(maximas[:-1])
        
        # 3. VOLATILIDADE (Média do range)
        ranges = [(maximas[i] - minimas[i]) for i in range(n)]
        range_medio = sum(ranges) / n

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando gatilho técnico"

        if tendencia == "ALTA":
            if preco_atual <= (suporte + (range_medio * 0.5)):
                direcao = "CALL"
                confianca = 85
                motivo = f"Pullback Sniper: Suporte em {suporte:.2f}"
        elif tendencia == "BAIXA":
            if preco_atual >= (resistencia - (range_medio * 0.5)):
                direcao = "PUT"
                confianca = 85
                motivo = f"Reteste Sniper: Resistência em {resistencia:.2f}"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Sniper Math-Pura",
            "motivo": motivo
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Erro", "motivo": str(e)}

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
    
    dados = request.get_json(force=True, silent=True)
    if not dados: return jsonify({"error": "No data"}), 400

    velas = dados.get('contexto_velas', [])
    resultado = calcular_sniper_engine(dados.get('asset'), velas, [])

    return jsonify({
        "choices": [{"message": {"content": json.dumps(resultado)}}]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
