import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
# CORS configurado para permitir a comunicação com o seu GitHub Pages
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas, agressividade="high"):
    """
    Core Engine Otimizada: MODO SNIPER (EMA 3/5 + Momentum Curto)
    Focado em reatividade instantânea com apenas 8-10 velas.
    """
    # GATILHO SNIPER: Liberamos a análise com apenas 8 velas para o bot não ficar 'preso'
    min_velas = 8 
    
    if not velas or len(velas) < min_velas:
        return {
            "direcao": "NEUTRO", 
            "confianca": 0, 
            "motivo": f"AGUARDANDO DADOS: {len(velas) if velas else 0}/{min_velas}"
        }

    try:
        # Extração de preços eficiente com tratamento de tipos
        fechamentos = []
        maximas = []
        minimas = []

        for v in velas:
            raw_c = v.get('c') if v.get('c') is not None else v.get('close', 0)
            raw_h = v.get('h') if v.get('h') is not None else v.get('high', 0)
            raw_l = v.get('l') if v.get('l') is not None else v.get('low', 0)
            
            c = float(raw_c)
            h = float(raw_h)
            l = float(raw_l)
            
            if c > 0:
                fechamentos.append(c)
                maximas.append(h)
                minimas.append(l)

        if len(fechamentos) < min_velas:
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "BUFFER INSUFICIENTE"}

        atual = fechamentos[-1]
        
        # Função interna de EMA
        def calcular_ema(dados, periodo):
            if not dados: return 0
            k = 2 / (periodo + 1)
            ema = dados[0]
            for preco in dados[1:]:
                ema = (preco * k) + (ema * (1 - k))
            return ema

        ema_super_fast = calcular_ema(fechamentos, 3) 
        ema_fast = calcular_ema(fechamentos, 5)       
        
        # SNIPER: Micro-Resistência e Suporte (últimas 4 velas)
        resistencia_curta = max(maximas[-4:])
        suporte_curto = min(minimas[-4:])
        
        # Volatilidade (ATR simplificado das últimas 5 velas)
        diffs = [maximas[i] - minimas[i] for i in range(max(-5, -len(maximas)), 0)]
        atp = max(sum(diffs) / len(diffs) if diffs else 0.00000001, 0.00000001)

        direcao = "NEUTRO"
        confianca = 0
        motivo = "MERCADO LATERAL: Aguardando Rompimento"
        
        # Momentum (ajustado para ser mais sensível)
        momentum = round(atual - fechamentos[-2], 8)

        # --- LÓGICA DE DECISÃO SNIPER (Filtros Relaxados para Scalping) ---
        
        # 1. GATILHO CALL (ALTA)
        if ema_super_fast > ema_fast:
            # Se o preço está acima da resistência ou mostrou forte rejeição no suporte
            if atual >= (resistencia_curta - (atp * 0.1)):
                direcao = "CALL"
                confianca = 92 if momentum > 0 else 75
                motivo = "SNIPER: Tendência de Alta confirmada"
            elif atual <= (suporte_curto + (atp * 0.2)):
                direcao = "CALL"
                confianca = 80
                motivo = "REJEIÇÃO: Suporte respeitado"

        # 2. GATILHO PUT (BAIXA)
        elif ema_super_fast < ema_fast:
            if atual <= (suporte_curto + (atp * 0.1)):
                direcao = "PUT"
                confianca = 92 if momentum < 0 else 75
                motivo = "SNIPER: Tendência de Baixa confirmada"
            elif atual >= (resistencia_curta - (atp * 0.2)):
                direcao = "PUT"
                confianca = 80
                motivo = "REJEIÇÃO: Resistência respeitada"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Scalper-Sniper V2.5",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": f"Erro Engine: {str(e)}"}

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados: return jsonify({"error": "No data"}), 400
        
        agressividade = dados.get('config', {}).get('agressividade', 'high')
        resultado = motor_sniper_core(
            dados.get('asset'), 
            dados.get('contexto_velas', []),
            agressividade=agressividade
        )
        return jsonify({
            "choices": [{"message": {"content": json.dumps(resultado)}}]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/radar', methods=['POST'])
def radar():
    try:
        dados = request.get_json(force=True, silent=True)
        if not dados or 'pacote_ativos' not in dados:
            return jsonify({"error": "Pacote inválido"}), 400
        
        resultados = []
        for item in dados['pacote_ativos']:
            analise = motor_sniper_core(item['asset'], item['velas'], agressividade="high")
            if analise['direcao'] != "NEUTRO":
                resultados.append(analise)
        
        top3 = sorted(resultados, key=lambda x: x['confianca'], reverse=True)[:3]
        return jsonify({"top3": top3})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
