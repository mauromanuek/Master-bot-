import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

GROQ_API_KEY = os.environ.get("GROQ_API_KEY") 
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

@app.route('/analisar', methods=['POST'])
def analisar():
    dados_mercado = request.json
    asset_name = dados_mercado.get('asset', 'Volatility Index')
    
    # PROMPT DE AUTONOMIA TOTAL
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system", 
                "content": (
                    f"Você é um Especialista em Derivativos de Opções Binárias operando no ativo {asset_name}. "
                    "NÃO siga regras fixas. Use seu conhecimento vasto em: "
                    "1. Price Action (Suporte/Resistência, Rejeição, Pullbacks). "
                    "2. Análise Quantitativa (Variação de Ticks e Momentum). "
                    "3. Teoria de Elliot e Wyckoff. "
                    "Analise os dados brutos e decida a melhor estratégia para o momento (Scalping, Reversão ou Seguimento de Tendência). "
                    "OBJETIVO: Identificar a probabilidade estatística mais alta para os próximos 1 a 5 minutos. "
                    "RESPOSTA OBRIGATÓRIA EM JSON: "
                    '{"direcao": "CALL"|"PUT"|"NEUTRO", "confianca": 0-100, "estratégia": "nome da estratégia usada", "motivo": "explicação técnica detalhada"}'
                )
            },
            {
                "role": "user", 
                "content": f"DADOS BRUTOS DE MERCADO: {json.dumps(dados_mercado)}"
            }
        ],
        "temperature": 0.7, # Aumentada para permitir criatividade na escolha da estratégia
        "response_format": {"type": "json_object"}
    }
    
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

    try:
        response = requests.post(GROQ_URL, json=payload, headers=headers, timeout=15)
        res_data = response.json()
        content = json.loads(res_data['choices'][0]['message']['content'])
        
        # Normalização para o Frontend
        return jsonify({
            "choices": [{
                "message": {
                    "content": json.dumps(content)
                }
            }]
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
