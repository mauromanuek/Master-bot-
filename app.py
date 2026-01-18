import os
import json
import requests
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") 
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    if not GROQ_API_KEY:
        return jsonify({"erro": "Chave não configurada"}), 500

    dados_brutos = request.json
    asset_name = dados_brutos.get('asset', 'Volatility Index')

    # PROMPT DE AUTONOMIA TOTAL: IA decide a estratégia
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system", 
                "content": (
                    f"Você é um Especialista em Derivativos operando no ativo {asset_name}. "
                    "Não use regras fixas. Analise o fluxo de ticks e as velas OHLC para identificar: "
                    "1. Padrões de Price Action (Candles de rejeição, Suporte/Resistência). "
                    "2. Micro-tendências e Momentum. "
                    "3. Probabilidade estatística para o próximo minuto. "
                    "Decida entre CALL, PUT ou NEUTRO. Use NEUTRO apenas em extrema incerteza. "
                    "RESPOSTA OBRIGATÓRIA EM JSON: "
                    '{"direcao": "CALL"|"PUT"|"NEUTRO", "confianca": 0-100, "estratégia": "Nome da estratégia usada", "motivo": "Explicação técnica"}'
                )
            },
            {
                "role": "user", 
                "content": f"DADOS ATUAIS: {json.dumps(dados_brutos)}"
            }
        ],
        "temperature": 0.5, # Equilíbrio entre precisão técnica e criatividade estratégica
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = requests.post(GROQ_URL, json=payload, headers={"Authorization": f"Bearer {GROQ_API_KEY}"}, timeout=15)
        res_data = response.json()
        content = json.loads(res_data['choices'][0]['message']['content'])
        
        # Mantém compatibilidade com o retorno esperado pelo frontend
        return jsonify({
            "choices": [{"message": {"content": json.dumps(content)}}]
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
