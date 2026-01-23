import os
import json
import math
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Permitir CORS para o seu domínio Vercel e localhost para testes
CORS(app, resources={r"/*": {"origins": "*"}})

# URL OFICIAL DO SEU BOT (Vercel)
LINK_DO_BOT = "https://master-bot-beta.vercel.app"

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
    """
    Engine Quantitativa Institucional V3.0
    Analisa RSI, Bandas de Bollinger e Volatilidade ATR.
    """
    min_velas = 12 
    if not velas or len(velas) < min_velas:
        return {"direcao": "SINC", "confianca": 0, "motivo": "Coletando Inteligência Quant..."}

    try:
        fechamentos = [float(v.get('c', v.get('close', 0))) for v in velas]
        maximas = [float(v.get('h', v.get('high', 0))) for v in velas]
        minimas = [float(v.get('l', v.get('low', 0))) for v in velas]
        atual = fechamentos[-1]

        # Cálculos Técnicos
        ema_3 = sum(fechamentos[-3:]) / 3
        ema_8 = sum(fechamentos[-8:]) / 8
        rsi = calcular_rsi(fechamentos)
        b_sup, b_inf = calcular_bollinger(fechamentos)
        volatilidade = (sum([maximas[i] - minimas[i] for i in range(-5, 0)]) / 5)

        score_call = 0
        score_put = 0

        # Regras de Pontuação Quantitativa
        if ema_3 > ema_8: score_call += 40
        else: score_put += 40
        if rsi < 35: score_call += 35 # Sobrevendido (Oportunidade de CALL)
        if rsi > 65: score_put += 35  # Sobrecomprado (Oportunidade de PUT)
        if atual < b_inf: score_call += 25 # Rompeu Banda Inferior
        if atual > b_sup: score_put += 25  # Rompeu Banda Superior

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando confluência institucional"

        # Filtro de Mercado Parado
        if volatilidade < (atual * 0.00005):
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "VOLATILIDADE INSUFICIENTE"}

        # Verificação de Alinhamento (Confluência mínima de 70%)
        if score_call >= 70 and rsi < 70:
            direcao = "CALL"
            confianca = score_call
            motivo = "ALTA PROBABILIDADE: Recuperação de fundo com RSI positivo"
        elif score_put >= 70 and rsi > 30:
            direcao = "PUT"
            confianca = score_put
            motivo = "ALTA PROBABILIDADE: Rejeição de topo com pressão vendedora"

        return {
            "direcao": direcao, 
            "confianca": confianca, 
            "motivo": motivo, 
            "asset": asset,
            "rsi": round(rsi, 2)
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Erro de cálculo quant"}

@app.route('/')
def index():
    # Redireciona a raiz do Render para o seu Bot no Vercel
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    try:
        dados = request.get_json(force=True, silent=True)
        res = motor_sniper_core(dados.get('asset'), dados.get('contexto_velas', []))
        return jsonify({"choices": [{"message": {"content": json.dumps(res)}}]})
    except:
        return jsonify({"error": "server error"}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
