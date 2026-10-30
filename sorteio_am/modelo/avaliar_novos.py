"""Teste PROSPECTIVO: o modelo congelado em dados/data.json prevê os sábados que vieram DEPOIS dele.

Fluxo ao receber a planilha atualizada (antes de retreinar):
  1. python avaliar_novos.py          -> compara a previsão do modelo antigo com o que aconteceu nos sábados novos
  2. python avaliar_sabados.py 8      -> teste retroativo com a base inteira
  3. retreinar (final_fit.py, export.py, ...) e atualizar dados/data.json

Previsão de um time = soma do rating dos atletas de linha que realmente jogaram naquele time
(escalação lida da planilha) - não depende do sorteio ter sido feito pelo app.
Opcional: --ate dd/mm/aaaa para simular uma data de corte (teste do script).
"""
import sys, json, csv, os, datetime
import numpy as np
from model import *

ate = None
if '--ate' in sys.argv:
    ate = datetime.datetime.strptime(sys.argv[sys.argv.index('--ate') + 1], '%d/%m/%Y')
D = json.load(open(os.path.join('..', 'dados', 'data.json'), encoding='utf-8'))
corte = ate or datetime.datetime.strptime(D['meta']['ate'], '%d/%m/%Y')
rating = {p['n']: (p['r'] if p.get('d') else 0.0) for p in D['roster']}
novos = [d for d in valid_days if d.to_pydatetime() > corte]
print(f"Modelo congelado com dados até {corte:%d/%m/%Y}. Sábados válidos depois dessa data: {len(novos)}")
if not novos:
    print("Nada a testar ainda: lance os novos sábados na planilha e rode de novo."); sys.exit()
linhas = []
for d in novos:
    pr = np.array([sum(rating.get(players[i], 0.0) for i in roster.get((d, t), [])) for t in TEAMS])
    sub = td[td.dia == d].set_index('team')
    real = sub.loc[TEAMS, 'pts'].values - sub.loc[TEAMS, 'pts'].values.mean()
    pr = pr - pr.mean()
    ok = int(np.argmax(pr)) == int(np.argmax(real))
    print(f"{d:%d/%m/%Y}  prev {np.round(pr,1)}  real {np.round(real,1)}  erro médio {np.abs(pr-real).mean():.2f}  campeão {'acertou' if ok else 'errou'}")
    linhas.append(dict(sabado=f"{d:%Y-%m-%d}", modelo_ate=f"{corte:%Y-%m-%d}", prev_branco=round(pr[0],2), prev_azul=round(pr[1],2), prev_marrom=round(pr[2],2),
                       real_branco=round(real[0],2), real_azul=round(real[1],2), real_marrom=round(real[2],2),
                       erro_medio=round(float(np.abs(pr-real).mean()),2), erro_todos_iguais=round(float(np.abs(real).mean()),2), campeao_acertou=int(ok)))
H = os.path.join('..', 'dados', 'historico_previsoes.csv')
campos = list(linhas[0].keys())
antigas = []
if os.path.exists(H):
    chaves = {(l['sabado'], l['modelo_ate']) for l in linhas}
    antigas = [l for l in csv.DictReader(open(H, encoding='utf-8')) if (l['sabado'], l['modelo_ate']) not in chaves]
with open(H, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=campos); w.writeheader(); w.writerows(antigas + linhas)
e = np.mean([l['erro_medio'] for l in linhas]); b = np.mean([l['erro_todos_iguais'] for l in linhas])
print(f"\nErro médio do modelo {e:.2f} pts vs {b:.2f} de 'todos iguais'. Registrado em {H}")
