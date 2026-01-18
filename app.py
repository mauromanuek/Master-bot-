import os
import json
import requests
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Configuração de CORS total para evitar bloqueios no GitHub Pages
CORS(app, resources={r"/*": {"origins": "*"}})

# --- CONFIGURAÇÕES ---
LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") 
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

@app.route('/')
def index():
    """Redireciona acessos acidentais para a interface do bot."""
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    # Tratamento para pre-flight do CORS
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    if not GROQ_API_KEY:
        return jsonify({"erro": "Chave GROQ_API_KEY não configurada no servidor"}), 500

    dados_mercado = request.json
    if not dados_mercado:
        return jsonify({"erro": "Nenhum dado de mercado recebido"}), 400

    # Extração e saneamento de dados
    asset_name = dados_mercado.get('asset', 'Ativo')
    indicadores = dados_mercado.get('indicadores', {})

    # PROMPT DE ENGENHARIA QUANTITATIVA (Agressivo para M1)
    # Reajustado: Removido o conflito de RSI e adicionada ordem de decisão clara
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system", 
                "content": (
                    f"Você é um Analista de Scalping de Alta Frequência para {asset_name}. "
                    "Sua função é fornecer vereditos imediatos de CALL ou PUT baseados em Price Action e RSI. "
                    "REGRAS DE DECISÃO: "
                    "1. Se RSI estiver abaixo de 50 e a tendência for ALTA, priorize CALL. "
                    "2. Se RSI estiver acima de 50 e a tendência for BAIXA, priorize PUT. "
                    "3. Ignore lateralizações leves; identifique a força do momentum nos últimos 15 candles. "
                    "4. Proibido responder 'NEUTRO' se houver qualquer inclinação de tendência. "
                    "5. Se o RSI estiver em zonas extremas (<30 ou >70), ignore a tendência e foque na reversão. "
                    "SAÍDA OBRIGATÓRIA EM JSON PURO: "
                    '{"direcao": "CALL"|"PUT"|"NEUTRO", "confianca": 0-100, "motivo": "Explicação técnica curta"}'
                )
            },
            {
                "role": "user", 
                "content": f"DADOS ATUAIS ({asset_name}): {json.dumps(indicadores)}"
            }
        ],
        "temperature": 0.5, # Aumentado para permitir que a IA identifique padrões sem rigidez excessiva
        "max_tokens": 150,
        "response_format": {"type": "json_object"}
    }
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}", 
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(GROQ_URL, json=payload, headers=headers, timeout=15)
        
        if response.status_code != 200:
            return jsonify({
                "erro": f"Groq API Error: {response.status_code}", 
                "detalhes": response.text
            }), response.status_code

        res_data = response.json()
        
        if 'choices' in res_data and len(res_data['choices']) > 0:
            content_raw = res_data['choices'][0]['message']['content'].strip()
            
            try:
                # Parse e Normalização
                veredito = json.loads(content_raw)
                
                # Garante que a IA não ignore a ordem de agressividade
                direcao_final = str(veredito.get('direcao', 'NEUTRO')).upper()
                confianca_final = int(veredito.get('confianca', 0))

                # Resposta formatada exatamente como o frontend espera
                return jsonify({
                    "choices": [{
                        "message": {
                            "content": json.dumps({
                                "direcao": direcao_final,
                                "confianca": confianca_final,
                                "motivo": veredito.get('motivo', 'Análise técnica concluída')
                            })
                        }
                    }]
                })
            except (json.JSONDecodeError, ValueError):
                return jsonify({"erro": "Erro no parse do JSON da IA"}), 500
        
        return jsonify({"erro": "Resposta da IA inválida"}), 500

    except requests.exceptions.Timeout:
        return jsonify({"erro": "Timeout"}), 504
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
