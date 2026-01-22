import os
import json
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

LINK_DO_BOT = "https://mauromanuek.github.io/Master-bot-/"

def motor_sniper_core(asset, velas, agressividade="low"):
    """
    Core Engine: Scalping Agressivo baseado em Momentum de Ticks e Reversão de Micro-Tendência
    """
    # BUFFER REDUZIDO: Para Scalping, 10 velas já são suficientes para decidir
    min_velas = 10 if agressividade == "high" else 15
    if not velas or len(velas) < min_velas:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Aguardando volume de dados"}

    try:
        # CORREÇÃO PONTUAL: Mapeamento duplo (chaves curtas 'c'/'h'/'l' e chaves longas 'close'/'high'/'low')
        # Isso evita que o histórico inicial da Deriv seja lido como zeros, gerando NEUTRO.
        fechamentos = [float(v.get('c') if v.get('c') is not None else v.get('close', 0)) for v in velas]
        maximas = [float(v.get('h') if v.get('h') is not None else v.get('high', 0)) for v in velas]
        minimas = [float(v.get('l') if v.get('l') is not None else v.get('low', 0)) for v in velas]
        
        # Validação de integridade dos dados extraídos
        if not fechamentos or fechamentos[-1] == 0:
            return {"direcao": "NEUTRO", "confianca": 0, "motivo": "Dados de preço insuficientes ou zerados"}

        atual = fechamentos[-1]
        
        # MÉDIAS ULTRA-RÁPIDAS (Exponenciais para dar peso ao AGORA)
        def calcular_ema(dados, periodo):
            k = 2 / (periodo + 1)
            ema = dados[0]
            for preco in dados[1:]:
                ema = (preco * k) + (ema * (1 - k))
            return ema

        ema_super_fast = calcular_ema(fechamentos, 3) 
        ema_fast = calcular_ema(fechamentos, 7)
        
        # ZONAS DE SCALPING (Curto Prazo - últimas 6 velas)
        resistencia_curta = max(maximas[-6:-1])
        suporte_curto = min(minimas[-6:-1])
        
        # VOLATILIDADE REAL (Diferença entre a máxima e mínima recente)
        # CORREÇÃO PONTUAL: Proteção contra divisão por zero ou volatilidade nula (atp mínimo)
        atp_calc = sum([maximas[i] - minimas[i] for i in range(-5, 0)]) / 5
        atp = max(atp_calc, 0.000001)

        direcao = "NEUTRO"
        confianca = 0
        motivo = "Monitorando exaustão"

        # CÁLCULO DE VELOCIDADE (Momentum Imediato)
        momentum = atual - fechamentos[-2]

        # --- ESTRATÉGIA AGRESSIVA: ROMPIMENTO DE MOMENTUM ---
        # Adicionado pequeno threshold de 0.000001 para evitar ruído de micro-ticks
        if ema_super_fast > (ema_fast + 0.000001):
            # Se rompeu a resistência curta com força
            if atual > resistencia_curta and momentum > (atp * 0.2):
                direcao = "CALL"
                confianca = 88 if agressividade == "high" else 75
                motivo = "EXPLOSÃO DE ALTA: Scalping momentum ativo"
            # Rejeição em suporte curto
            elif atual <= (suporte_curto + (atp * 0.1)):
                direcao = "CALL"
                confianca = 82
                motivo = "PULLBACK CURTO: Suporte de micro-tendência"

        elif ema_super_fast < (ema_fast - 0.000001):
            # Se rompeu o suporte curto com força
            if atual < suporte_curto and momentum < -(atp * 0.2):
                direcao = "PUT"
                confianca = 88 if agressividade == "high" else 75
                motivo = "EXPLOSÃO DE BAIXA: Scalping momentum ativo"
            # Rejeição em resistência curta
            elif atual >= (resistencia_curta - (atp * 0.1)):
                direcao = "PUT"
                confianca = 82
                motivo = "PULLBACK CURTO: Resistência de micro-tendência"

        return {
            "direcao": direcao,
            "confianca": confianca,
            "estratégia": "Agressive Scalper V2.5",
            "motivo": motivo,
            "asset": asset
        }
    except Exception as e:
        return {"direcao": "NEUTRO", "confianca": 0, "motivo": f"Erro interno: {str(e)}"}

@app.route('/')
def index():
    return redirect(LINK_DO_BOT)

@app.route('/analisar', methods=['POST'])
def analisar():
    dados = request.get_json(force=True, silent=True)
    if not dados: return jsonify({"error": "No data"}), 400
    
    config = dados.get('config', {})
    agressividade = config.get('agressividade', 'low')
    
    resultado = motor_sniper_core(
        dados.get('asset'), 
        dados.get('contexto_velas', []),
        agressividade=agressividade
    )
    
    return jsonify({
        "choices": [{"message": {"content": json.dumps(resultado)}}]
    })

@app.route('/radar', methods=['POST'])
def radar():
    dados = request.get_json(force=True, silent=True)
    if not dados or 'pacote_ativos' not in dados:
        return jsonify({"error": "Radar Fail"}), 400
    
    resultados = []
    for item in dados['pacote_ativos']:
        analise = motor_sniper_core(item['asset'], item['velas'], agressividade="high")
        if analise['direcao'] != "NEUTRO":
            resultados.append(analise)
    
    top3 = sorted(resultados, key=lambda x: x['confianca'], reverse=True)[:3]
    return jsonify({"top3": top3})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
