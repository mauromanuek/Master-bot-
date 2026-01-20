import os
import json
import numpy as np
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# CORS Robusto para evitar bloqueios no navegador
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def calcular_sniper_engine(asset, velas, ticks):
    try:
        if not velas or len(velas) < 5:
            return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Aguardando", "motivo": "Dados insuficientes"}

        # Conversão segura para floats
        closes = np.array([float(v.get('close', v.get('c', 0))) for v in velas])
        highs = np.array([float(v.get('high', v.get('h', 0))) for v in velas])
        lows = np.array([float(v.get('low', v.get('l', 0))) for v in velas])
        
        preco_atual = closes[-1]
        
        # Tendência via Slope
        x = np.arange(len(closes))
        slope, _ = np.polyfit(x, closes, 1)
        tendencia = "ALTA" if slope > 0 else "BAIXA"

        # Zonas
        suporte = np.min(lows)
        resistencia = np.max(highs)
        range_medio = np.mean(highs - lows) if len(highs) > 0 else 0.1

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando sinal claro"

        if tendencia == "ALTA":
            if preco_atual <= (suporte + (range_medio * 0.5)):
                direcao = "CALL"
                confianca = 85
                motivo = f"Sniper: Pullback em Alta (Z:{suporte:.2f})"
        elif tendencia == "BAIXA":
            if preco_atual >= (resistencia - (range_medio * 0.5)):
                direcao = "PUT"
                confianca = 85
                motivo = f"Sniper: Reteste em Baixa (Z:{resistencia:.2f})"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Sniper Quant",
            "motivo": motivo
        }
    except Exception as e:
        return {"direcao": "ERRO", "confianca": 0, "estratégia": "Erro", "motivo": str(e)}

@app.route('/')
def home():
    # Se for uma chamada de API vindo do Bot, não redireciona
    if "application/json" in request.headers.get("Content-Type", ""):
        return jsonify({"status": "Servidor Online"}), 200
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    try:
        dados = request.get_json(force=True, silent=True)
        if not dados:
            return jsonify({"error": "JSON Inválido"}), 400

        velas = dados.get('contexto_velas', [])
        resultado = calcular_sniper_engine(dados.get('asset'), velas, [])

        # Formato compatível com o seu AnaliseGeral.js antigo
        return jsonify({
            "choices": [{"message": {"content": json.dumps(resultado)}}]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Exigido pelo Vercel para exportar o app
app = app
