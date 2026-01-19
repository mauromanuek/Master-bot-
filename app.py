import os
import json
import requests
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Configuração de CORS robusta para evitar "Conexão Instável" por bloqueio de segurança
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["POST", "GET", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

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
        return jsonify({"erro": "GROQ_API_KEY não configurada no ambiente"}), 500

    dados_brutos = request.json
    if not dados_brutos:
        return jsonify({"erro": "Dados brutos não recebidos"}), 400

    asset_name = dados_brutos.get('asset', 'Volatility Index')

    # PROMPT DE ENGENHARIA CIRÚRGICA: Foco em estabilidade e saída JSON rígida
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system", 
                "content": (
                    f"Você é um motor de execução algorítmico para {asset_name}. "
                    "Analise rigorosamente Price Action, Momentum e Fluxo de Ticks. "
                    "Decida: CALL, PUT ou NEUTRO. "
                    "Não ignore suportes/resistências evidentes no histórico de velas. "
                    "RESPOSTA OBRIGATÓRIA EM JSON PURO: "
                    '{"direcao": "CALL"|"PUT"|"NEUTRO", "confianca": 0-100, "estratégia": "nome", "motivo": "curto"}'
                )
            },
            {
                "role": "user", 
                "content": f"DATA: {json.dumps(dados_brutos)}"
            }
        ],
        "temperature": 0.2, # Reduzido para máxima velocidade e consistência de formato
        "max_tokens": 200,
        "response_format": {"type": "json_object"}
    }
    
    try:
        # Timeout de 15s para evitar que a Vercel mate a conexão prematuramente
        response = requests.post(
            GROQ_URL, 
            json=payload, 
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            }, 
            timeout=15
        )
        
        # Tratamento de erro da API Groq antes de processar o JSON
        if response.status_code != 200:
            return jsonify({
                "erro": f"Groq API Error {response.status_code}",
                "detalhes": response.text
            }), response.status_code

        res_data = response.json()
        
        # Verificação de segurança da estrutura de resposta
        if 'choices' in res_data and len(res_data['choices']) > 0:
            content_str = res_data['choices'][0]['message']['content']
            # Garante que o retorno seja o objeto JSON esperado
            return jsonify({
                "choices": [{"message": {"content": content_str}}]
            })
        
        return jsonify({"erro": "Resposta vazia da IA"}), 500

    except requests.exceptions.Timeout:
        return jsonify({"erro": "Timeout: A IA demorou muito para responder"}), 504
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
