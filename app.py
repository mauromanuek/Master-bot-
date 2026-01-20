import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Configuração de CORS para permitir que o seu frontend no GitHub Pages acesse o backend no Render
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def calcular_sniper_engine(asset, velas, ticks):
    """
    Motor Matemático Sniper Scalping 
    Lógica Determinística sem dependência de bibliotecas pesadas (Numpy-free)
    """
    if not velas or len(velas) < 10:
        return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Aguardando", "motivo": "Dados insuficientes"}

    try:
        # Extração manual de dados para evitar dependência do Numpy no ambiente de build
        precos = [float(v.get('close', v.get('c', 0))) for v in velas]
        maximas = [float(v.get('high', v.get('h', 0))) for v in velas]
        minimas = [float(v.get('low', v.get('l', 0))) for v in velas]
        
        preco_atual = precos[-1]
        n = len(precos)

        # 1. FILTRO DE TENDÊNCIA (Cálculo de Inclinação/Regressão Linear Manual)
        sum_x = sum(range(n))
        sum_y = sum(precos)
        sum_xy = sum(i * precos[i] for i in range(n))
        sum_x2 = sum(i**2 for i in range(n))
        
        # Fórmula da inclinação (slope): (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
        denominador = (n * sum_x2 - sum_x**2)
        slope = (n * sum_xy - sum_x * sum_y) / denominador if denominador != 0 else 0
        tendencia = "ALTA" if slope > 0 else "BAIXA"

        # 2. ZONAS DE MEMÓRIA (Suporte e Resistência baseados no histórico recente)
        suporte = min(minimas[:-1])
        resistencia = max(maximas[:-1])
        
        # 3. VOLATILIDADE (Média aritmética do range das velas)
        ranges = [(maximas[i] - minimas[i]) for i in range(n)]
        range_medio = sum(ranges) / n if n > 0 else 0.1

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Aguardando gatilho técnico em zona de sniper"
        estrategia = "Sniper Math-Pura"

        # Lógica de Gatilho para CALL (Tendência de Alta + Pullback no Suporte)
        if tendencia == "ALTA":
            if preco_atual <= (suporte + (range_medio * 0.5)):
                direcao = "CALL"
                confianca = 85
                motivo = f"Pullback Sniper: Rejeição detectada no suporte em {suporte:.2f}"
            elif preco_atual > resistencia:
                direcao = "CALL"
                confianca = 70
                motivo = "Rompimento de pivô de alta confirmado pela tendência"
                
        # Lógica de Gatilho para PUT (Tendência de Baixa + Reteste na Resistência)
        elif tendencia == "BAIXA":
            if preco_atual >= (resistencia - (range_medio * 0.5)):
                direcao = "PUT"
                confianca = 85
                motivo = f"Reteste Sniper: Resistência confirmada em {resistencia:.2f}"
            elif preco_atual < suporte:
                direcao = "PUT"
                confianca = 70
                motivo = "Rompimento de fundo (suporte) em tendência de baixa"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": estrategia,
            "motivo": motivo
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "estratégia": "Erro", "motivo": f"Erro interno: {str(e)}"}

@app.route('/')
def index():
    # Redireciona o tráfego da raiz para o site do Bot no GitHub Pages
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    # Tratamento manual de requisições Preflight do Navegador (CORS)
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
    
    try:
        # Captura os dados enviados pelo bot (AnaliseGeral.js)
        dados = request.get_json(force=True, silent=True)
        if not dados:
            return jsonify({"error": "Nenhum dado recebido ou JSON inválido"}), 400

        asset = dados.get('asset', 'R_100')
        velas = dados.get('contexto_velas', [])
        
        # Executa a lógica do motor matemático
        resultado = calcular_sniper_engine(asset, velas, [])

        # Retorna no formato de resposta esperado pelo frontend do bot
        return jsonify({
            "choices": [
                {
                    "message": {
                        "content": json.dumps(resultado)
                    }
                }
            ]
        })
    except Exception as e:
        return jsonify({"error": f"Falha no processamento: {str(e)}"}), 500

# Ponto de entrada ajustado para o Render
if __name__ == '__main__':
    # O Render fornece a porta via variável de ambiente PORT. Se não existir, usa 5000 por padrão.
    port = int(os.environ.get("PORT", 5000))
    # '0.0.0.0' é necessário para que o servidor seja acessível externamente na VPS do Render
    app.run(host='0.0.0.0', port=port)
