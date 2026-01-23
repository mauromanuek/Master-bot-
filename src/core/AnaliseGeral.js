class AnaliseGeral {
    constructor(backendUrl, modo = "principal") {
        this.backendUrl = backendUrl;
        this.modo = modo; 
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
        this.ultimoVeredito = { direcao: "NEUTRO", confianca: 0 };
    }

    limparHistorico() {
        this.historicoVelas = [];
        this.ultimosTicks = [];
        this._analisando = false;
    }

    adicionarDados(velas, tickBruto = null) {
        if (tickBruto !== null) {
            const t = parseFloat(tickBruto);
            if (!isNaN(t)) this.ultimosTicks.push(t);
            if (this.ultimosTicks.length > 10) this.ultimosTicks.shift();
        }

        const formatar = (v) => ({
            c: parseFloat(v.close || v.c),
            h: parseFloat(v.high || v.h),
            l: parseFloat(v.low || v.l),
            e: parseInt(v.epoch || v.e)
        });

        if (Array.isArray(velas)) {
            this.historicoVelas = velas.map(v => formatar(v)).filter(v => !isNaN(v.c));
        } else if (velas) {
            const n = formatar(velas);
            const idx = this.historicoVelas.findIndex(v => v.e === n.e);
            if (idx !== -1) this.historicoVelas[idx] = n;
            else if (this.historicoVelas.length === 0 || n.e > this.historicoVelas[this.historicoVelas.length-1].e) {
                this.historicoVelas.push(n);
            }
        }
        if (this.historicoVelas.length > 30) this.historicoVelas.shift();
    }

    async obterVereditoCompleto() {
        if (this._analisando) return this.ultimoVeredito;
        if (this.historicoVelas.length < 12) return { direcao: "SINC", confianca: 0 };

        this._analisando = true;
        try {
            const response = await fetch(this.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    asset: window.app ? app.currentAsset : "R_100",
                    contexto_velas: this.historicoVelas.slice(-20)
                })
            });
            const data = await response.json();
            const res = JSON.parse(data.choices[0].message.content);
            this.ultimoVeredito = {
                direcao: res.direcao,
                confianca: res.confianca,
                motivo: res.motivo
            };
            return this.ultimoVeredito;
        } catch (e) {
            return { direcao: "NEUTRO", confianca: 0 };
        } finally {
            this._analisando = false;
        }
    }
}
