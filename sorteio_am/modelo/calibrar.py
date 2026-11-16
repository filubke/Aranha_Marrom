"""Calibração fora da amostra: as previsões e as faixas de incerteza do modelo se confirmam nos sábados passados?

Para cada sábado válido com pelo menos 12 sábados de treino antes dele, treina só com o passado e compara a previsão
com os pontos reais (centrados na média do dia). Mede:
  - R², correlação e erro (RMSE) contra a referência "todos iguais";
  - inclinação de calibração (real ~ previsto; 1,00 = previsões na escala certa);
  - intervalo de confiança do R² (bootstrap por sábado: com poucos sábados ele é largo);
  - cobertura das faixas usadas pela página (50%, 80%, 90%): a faixa de 80% deveria conter ~80% dos resultados reais.
Grava ../dados/calibracao.json, uma linha em ../dados/historico_calibracao.csv e a cobertura (cov80) em meta do data.json.
Uso (dentro de modelo/):  python calibrar.py
"""
import io, contextlib, json, os, csv, datetime
import numpy as np
with contextlib.redirect_stdout(io.StringIO()):
    from model import *
from scipy.stats import norm

KW = dict(lam=6, lam_b=200); NOISE = 4.0; START = 12
days = valid_days
PL, YL, VL = [], [], []
for d in days[START:]:
    tr = [x for x in days if x < d]
    s, _, _ = fit(tr, **KW)
    D, y, _ = design(tr); r = y - D @ s
    s2 = (r ** 2).sum() / (len(y) - 0.6 * P if len(y) > 0.6 * P else len(y)); sig = np.sqrt(s2)
    Ainv = np.linalg.inv(D.T @ D + KW['lam'] * np.eye(P))
    sd = np.minimum(sig * np.sqrt(np.diag(Ainv)), sig / np.sqrt(KW['lam']))
    Dd, yd, _ = design([d])
    PL.append(Dd @ s); YL.append(yd); VL.append((Dd ** 2) @ (sd ** 2))
n = len(PL); p = np.concatenate(PL); y = np.concatenate(YL); v = np.concatenate(VL); e = y - p
r2 = 1 - (e ** 2).sum() / (y ** 2).sum(); corr = np.corrcoef(p, y)[0, 1]
rmse = np.sqrt((e ** 2).mean()); rmse0 = np.sqrt((y ** 2).mean()); slope = np.polyfit(p, y, 1)[0]
rng = np.random.default_rng(1); R = []
for _ in range(3000):
    ix = rng.integers(0, n, n); pp = np.concatenate([PL[i] for i in ix]); yy = np.concatenate([YL[i] for i in ix])
    R.append(1 - ((yy - pp) ** 2).sum() / (yy ** 2).sum())
lo, hi = np.quantile(R, [.025, .975])
# faixa usada na página: ruído do sábado (centrado) + incerteza dos ratings
tot = np.sqrt((2 / 3) * NOISE ** 2 + v)
cov = {lv: float((np.abs(e) <= norm.ppf(.5 + lv / 2) * tot).mean()) for lv in (.5, .8, .9)}
print(f"{n} sábados avaliados ({len(y)} times-sábado), treino sempre só com o passado (mín. {START} sábados).")
print(f"R² fora da amostra {r2:.2f} (IC 95%: {lo:.2f} a {hi:.2f}) | correlação {corr:.2f} | erro RMSE {rmse:.2f} vs {rmse0:.2f} de 'todos iguais' | inclinação de calibração {slope:.2f}")
print(f"Cobertura das faixas da página: 50% -> {cov[.5]:.0%} | 80% -> {cov[.8]:.0%} | 90% -> {cov[.9]:.0%}")
out = dict(base_ate=str(days[-1])[:10], sabados_avaliados=n, r2=round(float(r2), 3), r2_ic95=[round(float(lo), 3), round(float(hi), 3)],
           correlacao=round(float(corr), 3), rmse=round(float(rmse), 2), rmse_todos_iguais=round(float(rmse0), 2), inclinacao=round(float(slope), 2),
           cobertura50=round(cov[.5], 3), cobertura80=round(cov[.8], 3), cobertura90=round(cov[.9], 3))
json.dump(out, open(os.path.join('..', 'dados', 'calibracao.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
H = os.path.join('..', 'dados', 'historico_calibracao.csv')
campos = ['rodado_em'] + list(out)
antigas = [l for l in csv.DictReader(open(H, encoding='utf-8')) if l['base_ate'] != out['base_ate']] if os.path.exists(H) else []
with open(H, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=campos); w.writeheader(); w.writerows(antigas + [dict(rodado_em=datetime.date.today().isoformat(), **out)])
DJ = os.path.join('..', 'dados', 'data.json')
if os.path.exists(DJ):
    d = json.load(open(DJ, encoding='utf-8')); d['meta']['cov80'] = round(cov[.8], 2)
    open(DJ, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, allow_nan=False))
