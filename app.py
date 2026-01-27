import os
from flask import Flask, redirect

app = Flask(__name__)

# URL OFICIAL DO SEU BOT NO GITHUB
GITHUB_BOT_URL = "https://mauromanuek.github.io/Master-bot-/"

@app.route('/')
def index():
    # Redireciona automaticamente para o seu novo endereço do GitHub Pages
    return redirect(GITHUB_BOT_URL)

if __name__ == '__main__':
    # Porta padrão para o Render
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
