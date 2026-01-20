import os
import json
import numpy as np
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Ajuste de CORS para garantir compatibilidade total com o Vercel
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type"]}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def calcular_sniper_engine(asset, velas, ticks):
    """
    Motor Matemático Sniper Scalping 
    Substitui a IA por Lógica Determinística
    """
    # Garantia de que temos dados suficientes para o Numpy processar
    if not velas or len(velas) < 10:
        return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Aguardando Dados", "motivo": "Dados insuficientes"}

    try:
        # Extração de vetores numéricos
        closes = np.array([float(v.get('close', v.get('c', 0))) for v in velas])
        highs = np.array([float(v.get('high', v.get('h', 0))) for v in velas])
        lows = np.array([float(v.get('low', v.get('l', 0))) for v in velas])
        
        preco_atual = closes[-1]
        
        # 1. FILTRO DE TENDÊNCIA (Regressão Simples)
        x = np.arange(len(closes))
        slope, _ = np.polyfit(x, closes, 1)
        tendencia = "ALTA" if slope > 0 else "BAIXA"

        # 2. ZONAS DE MEMÓRIA (Suporte e Resistência)
        # Ignora a vela atual (index -1) para não viciar a zona
        suporte = np.min(lows[:-1])
        resistencia = np.max(highs[:-1])

        # 3. VOLATILIDADE (Distância entre bandas)
        range_medio = np.mean(highs - lows)

        # 4. LÓGICA GATILHO SNIPER (Pivô de Retomada)
        direcao = "NEUTRO"
        confianca = 0
        motivo = "Mercado em consolidação ou sem gatilho claro."
        estrategia = "Sniper Structural"

        # Critério para CALL (Sniper)
        if tendencia == "ALTA":
            if preco_atual <= (suporte + (range_medio * 0.5)): # Próximo ao suporte (Pullback)
                direcao = "CALL"
                confianca = 85
                motivo = f"Pullback detectado em tendência de alta. Rejeição em zona {suporte:.2f}."
            elif preco_atual > resistencia: # Rompimento com força
                direcao = "CALL"
                confianca = 70
                motivo = "Rompimento de pivô de alta confirmado."
                
        # Critério para PUT (Sniper)
        elif tendencia == "BAIXA":
            if preco_atual >= (resistencia - (range_medio * 0.5)): # Próximo à resistência
                direcao = "PUT"
                confianca = 85
                motivo = f"Reteste de resistência em tendência de baixa na zona {resistencia:.2f}."
            elif preco_atual < suporte: # Rompimento de fundo
                direcao = "PUT"
                confianca = 70
                motivo = "Rompimento de pivô de baixa confirmado."

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": estrategia,
            "motivo": motivo
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Erro Engine", "motivo": str(e)}

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    try:
        dados = request.get_json(silent=True)
        if not dados:
            return jsonify({"erro": "Sem dados JSON válidos"}), 400

        asset = dados.get('asset', 'R_100')
        velas = dados.get('contexto_velas', [])
        ticks = dados.get('fluxo_ticks', [])

        # Execução do motor matemático
        resultado = calcular_sniper_engine(asset, velas, ticks)

        # Resposta formatada para o AnaliseGeral.js
        return jsonify({
            "choices": [{
                "message": {
                    "content": json.dumps(resultado)
                }
            }]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Necessário para o Vercel tratar o app como função
app.debug = False

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
