import os
import json
import math
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def calcular_rsi(precos, periodo=14):
    if len(precos) < periodo + 1: return 50
    ganhos = []
    perdas = []
    for i in range(1, len(precos)):
        dif = precos[i] - precos[i-1]
        ganhos.append(max(dif, 0))
        perdas.append(max(-dif, 0))
    avg_ganho = sum(ganhos[-periodo:]) / periodo
    avg_perda = sum(perdas[-periodo:]) / periodo
    if avg_perda == 0: return 100
    rs = avg_ganho / avg_perda
    return 100 - (100 / (1 + rs))

def calcular_bollinger(precos, periodo=20):
    if len(precos) < periodo: return precos[-1], precos[-1]
    sma = sum(precos[-periodo:]) / periodo
    variancia = sum((x - sma) ** 2 for x in precos[-periodo:]) / periodo
    desvio = math.sqrt(variancia)
    return sma + (desvio * 2), sma - (desvio * 2)

def motor_sniper_core(asset, velas):
    min_velas = 12 
    if not velas or len(velas) < min_velas:
        return {"direcao": "SINC", "confianca": 0, "motivo": "Coletando Inteligência..."}

    try:
        fechamentos = [float(v.get('c', v.get('close', 0))) for v in velas]
        maximas = [float(v.get('h', v.get('high', 0))) for v in velas]
        minimas = [float(v.get('l', v.get('low', 0))) for v in velas]
        atual = fechamentos[-1]

        # Indicadores
        ema_3 = sum(fechamentos[-3:]) / 3
        ema_8 = sum(fechamentos[-8:]) / 8
        rsi = calcular_rsi(fechamentos)
        b_sup, b_inf = calcular_bollinger(fechamentos)
        volatilidade = (sum([maximas[i] - minimas[i] for i in range(-5, 0)]) / 5)

        score_call = 0
        score_put = 0

        # Regras de Pontuação
        if ema_3 > ema_8: score_call += 40
        else: score_put += 40
        if rsi < 35: score_call += 30
        if rsi > 65: score_put += 30
        if atual < b_inf: score_call += 20
        if atual > b_sup: score_put += 20

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando confluência de indicadores"

        if volatilidade < (atual * 0.00005):
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "MERCADO PARADO: Baixa volatilidade"}

        if score_call >= 70 and rsi < 70:
            direcao = "CALL"
            confianca = score_call
            motivo = "FORÇA COMPRADORA: Rompimento com RSI favorável"
        elif score_put >= 70 and rsi > 30:
            direcao = "PUT"
            confianca = score_put
            motivo = "FORÇA VENDEDORA: Pressão institucional detectada"

        return {"direcao": direcao, "confianca": confianca, "motivo": motivo, "asset": asset}
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Erro de processamento"}

@app.route('/analisar', methods=['POST'])
def analisar():
    try:
        dados = request.get_json(force=True, silent=True)
        res = motor_sniper_core(dados.get('asset'), dados.get('contexto_velas', []))
        return jsonify({"choices": [{"message": {"content": json.dumps(res)}}]})
    except:
        return jsonify({"error": "server error"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
