"""Aba "Jogos": quão bem a força prevista dos times explica o resultado de cada jogo e de cada confronto.

Para cada sábado com jogos registrados, o modelo é treinado SEM aquele sábado (nada de vazamento) e a força
de cada time é a soma dos ratings dos atletas que jogaram nele. Depois compara:
  - jogo a jogo: diferença de força (A - B) x saldo de gols; o time mais forte ganhou?
  - confronto a confronto no sábado (cada dupla de times joga 3 vezes): diferença de força x saldo/pontos nos 3 jogos
Uso (dentro de modelo/):  python jogos.py
Saídas: dados/jogos_confrontos.csv (um confronto por linha) e uma linha em dados/historico_jogos.csv.
"""
import csv, os, datetime, math
import numpy as np
from model import *

JG = os.path.join('..', 'dados', 'jogos.csv')
if not os.path.exists(JG):
    print("dados/jogos.csv não existe (rode atualizar.py com o xlsx da planilha)."); raise SystemExit
games = []
for r in csv.DictReader(open(JG, encoding='utf-8')):
    if r['gols_a'] == '' or r['gols_b'] == '':
        continue                                   # jogo sem placar (linha em branco na planilha)
    a = 'Preto' if r['time_a'] == 'Marrom' else r['time_a']; b = 'Preto' if r['time_b'] == 'Marrom' else r['time_b']
    games.append(dict(dia=pd.Timestamp(r['data']), jogo=int(float(r['jogo'])), A=a, B=b, ga=float(r['gols_a']), gb=float(r['gols_b'])))
dias = sorted({g['dia'] for g in games})
tam = line.groupby(['dia', 'team']).size().unstack()
KW = dict(lam=6, lam_b=200)
S = {}                                              # (dia, time) -> força prevista, treinando sem o dia
for d in dias:
    if d not in td.dia.values:
        continue
    treino = [x for x in valid_days if x != d]
    skill, _, _ = fit(treino, **KW)
    for t in TEAMS:
        S[(d, t)] = float(sum(skill[i] for i in roster.get((d, t), [])))
rows = []
for g in games:
    if (g['dia'], g['A']) not in S or (g['dia'], g['B']) not in S:
        continue
    n = tam.loc[g['dia']]
    limpo = bool(n[g['A']] == n[g['B']] == n.max())
    rows.append(dict(g, x=S[(g['dia'], g['A'])] - S[(g['dia'], g['B'])], y=g['ga'] - g['gb'], limpo=limpo))
def resumo(rs, rotulo):
    x = np.array([r['x'] for r in rs]); y = np.array([r['y'] for r in rs]); dec = y != 0
    acerto = int((np.sign(x[dec]) == np.sign(y[dec])).sum()); nd = int(dec.sum())
    # p-valor bilateral aproximado de acertar tanto por acaso (binomial 50%)
    p = sum(math.comb(nd, k) for k in range(acerto, nd + 1)) / 2 ** nd if nd else float('nan')
    print(f"{rotulo}: {len(rs)} jogos | correlação força x saldo de gols {np.corrcoef(x, y)[0,1]:.2f} | "
          f"time mais forte ganhou {acerto} de {nd} jogos decididos ({100*acerto/max(nd,1):.0f}%; p≈{p:.3f} se fosse acaso) | empates {len(rs)-nd}")
    return dict(jogos=len(rs), corr=round(float(np.corrcoef(x, y)[0, 1]), 3), acerto=f"{acerto}/{nd}", p=round(p, 3))
print(f"{len(games)} jogos com placar em {len(dias)} sábados.")
todos = resumo(rows, 'Todos os jogos      ')
limpos = resumo([r for r in rows if r['limpo']], 'Só times completos  ')
# confrontos: cada dupla de times, por sábado (3 jogos)
conf = {}
for r in rows:
    k = (r['dia'], tuple(sorted([r['A'], r['B']])))
    c = conf.setdefault(k, dict(dia=r['dia'], t1=k[1][0], t2=k[1][1], g=0, saldo=0.0, p1=0, p2=0, limpo=True))
    s = r['y'] if r['A'] == c['t1'] else -r['y']
    c['g'] += 1; c['saldo'] += s; c['limpo'] &= r['limpo']
    if s > 0: c['p1'] += 3
    elif s < 0: c['p2'] += 3
    else: c['p1'] += 1; c['p2'] += 1
cs = []
for (d, _), c in sorted(conf.items()):
    c['x'] = S[(d, c['t1'])] - S[(d, c['t2'])]; c['dif_pts'] = c['p1'] - c['p2']; cs.append(c)
x = np.array([c['x'] for c in cs]); y = np.array([c['dif_pts'] for c in cs]); ys = np.array([c['saldo'] for c in cs])
print(f"\nConfrontos (dupla de times no sábado, até 3 jogos): {len(cs)} | correlação força x pontos do confronto {np.corrcoef(x, y)[0,1]:.2f} | x saldo de gols {np.corrcoef(x, ys)[0,1]:.2f}")
print("Inclinação: cada 1 pt de diferença de força prevista ≈ %.2f pts a mais no confronto (3 jogos)" % np.polyfit(x, y, 1)[0])
H = os.path.join('..', 'dados', 'jogos_confrontos.csv')
with open(H, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['sabado', 'time_1', 'time_2', 'jogos', 'forca_prevista_1_menos_2', 'pontos_1', 'pontos_2', 'saldo_gols_1', 'times_completos'])
    for c in cs: w.writerow([f"{c['dia']:%Y-%m-%d}", c['t1'], c['t2'], c['g'], round(c['x'], 2), c['p1'], c['p2'], c['saldo'], int(c['limpo'])])
# histórico por base
HH = os.path.join('..', 'dados', 'historico_jogos.csv')
campos = ['rodado_em', 'base_ate', 'sabados_com_jogos', 'jogos', 'corr_forca_x_saldo', 'forte_ganhou_decididos', 'corr_confronto_pontos']
linha = dict(rodado_em=datetime.date.today().isoformat(), base_ate=f"{max(dias):%Y-%m-%d}", sabados_com_jogos=len(dias), jogos=todos['jogos'],
             corr_forca_x_saldo=todos['corr'], forte_ganhou_decididos=todos['acerto'], corr_confronto_pontos=round(float(np.corrcoef(x, y)[0, 1]), 3))
antigas = []
if os.path.exists(HH):
    antigas = [l for l in csv.DictReader(open(HH, encoding='utf-8')) if l['base_ate'] != linha['base_ate']]
with open(HH, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=campos); w.writeheader(); w.writerows(antigas + [linha])
print("Registrado em", H, "e", HH)
