import os
import json
import requests
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# Configuração de CORS para permitir que o seu GitHub Pages acesse a API
CORS(app, resources={r"/*": {"origins": "*"}})

# --- CONFIGURAÇÕES ---
LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"
# A chave deve estar nas Variáveis de Ambiente do seu servidor
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") 
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

@app.route('/')
def index():
    """Redireciona acessos acidentais para a interface do bot."""
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST', 'OPTIONS'])
def analisar():
    # Tratamento simples para pre-flight do CORS
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    if not GROQ_API_KEY:
        return jsonify({"erro": "Chave GROQ_API_KEY não configurada no servidor"}), 500

    dados_mercado = request.json
    if not dados_mercado:
        return jsonify({"erro": "Nenhum dado de mercado recebido"}), 400

    # Extração de contexto para evitar contaminação (Ajuste Cirúrgico)
    asset_name = dados_mercado.get('asset', 'Ativo')
    indicadores = dados_mercado.get('indicadores', dados_mercado)

    # PROMPT DE ENGENHARIA QUANTITATIVA (Otimizado para Scalping M1)
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system", 
                "content": (
                    f"Você é o motor de execução de um Robô Scalper de Alta Performance para o ativo {asset_name}. "
                    "Seu objetivo é analisar dados OHLC e indicadores (RSI, Tendência) para emitir sinais curtos. "
                    "ESTRATÉGIA: Momentum + Rejeição. "
                    "DIRETRIZ: Seja decisivo. Minimize o uso de 'NEUTRO'. Use 'NEUTRO' apenas se não houver volume. "
                    "Se RSI < 45 ou candle martelo em suporte -> CALL. "
                    "Se RSI > 55 ou rejeição em resistência -> PUT. "
                    "RESPOSTA OBRIGATÓRIA EM JSON: "
                    '{"direcao": "CALL"|"PUT"|"NEUTRO", "confianca": 0-100, "motivo": "frase curta"}'
                )
            },
            {
                "role": "user", 
                "content": f"Dados Técnicos de {asset_name}: {json.dumps(indicadores)}"
            }
        ],
        "temperature": 0.2, # Reduzido para aumentar a assertividade técnica e reduzir neutralidade
        "max_tokens": 150,
        "response_format": {"type": "json_object"} # Garante saída JSON válida
    }
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}", 
        "Content-Type": "application/json"
    }

    try:
        # Request para Groq com timeout de segurança otimizado para scalping
        response = requests.post(GROQ_URL, json=payload, headers=headers, timeout=15)
        
        if response.status_code != 200:
            return jsonify({
                "erro": f"Groq API Error: {response.status_code}", 
                "detalhes": response.text
            }), response.status_code

        res_data = response.json()
        
        if 'choices' in res_data and len(res_data['choices']) > 0:
            # Extração do conteúdo gerado pela IA
            content_raw = res_data['choices'][0]['message']['content'].strip()
            
            try:
                # Parse e Normalização do Veredito
                veredito = json.loads(content_raw)
                veredito['direcao'] = str(veredito.get('direcao', 'NEUTRO')).upper()
                veredito['confianca'] = int(veredito.get('confianca', 0))
                
                # Re-encapsulamento preservando a compatibilidade com o frontend atual
                return jsonify({
                    "choices": [{
                        "message": {
                            "content": json.dumps(veredito)
                        }
                    }]
                })
            except (json.JSONDecodeError, ValueError):
                return jsonify({"erro": "Erro ao processar JSON da IA", "raw": content_raw}), 500
        
        return jsonify({"erro": "Resposta da IA vazia"}), 500

    except requests.exceptions.Timeout:
        return jsonify({"erro": "Timeout na comunicação com Groq"}), 504
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    # Porta dinâmica para Render/Heroku ou 5000 para Local
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
