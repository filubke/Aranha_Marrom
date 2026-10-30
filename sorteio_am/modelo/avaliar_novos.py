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
# todos os sábados com 3 times depois da data de corte (não só os "válidos")
todos = sorted(d for d in td.dia.unique() if d.to_pydatetime() > corte and td[td.dia == d].shape[0] == 3)
tam = line.groupby(['dia', 'team']).size().unstack()
print(f"Modelo congelado com dados até {corte:%d/%m/%Y}. Sábados com 3 times depois dessa data: {len(todos)}")
if not todos:
    print("Nada a testar ainda: lance os novos sábados na planilha e rode de novo."); sys.exit()
linhas = []
for d in todos:
    sub = td[td.dia == d].set_index('team')
    pts = sub.loc[TEAMS, 'pts'].values
    pr = np.array([sum(rating.get(players[i], 0.0) for i in roster.get((d, t), [])) for t in TEAMS])
    n = tam.loc[d, TEAMS].values
    jogos = float(games[d])
    completo = (jogos == 9) and bool((n == n.max()).all())
    status = 'ok' if completo else ('faltante' if (jogos == 9) else 'jogos_incompletos')
    # sábado com faltante: o time com menos gente joga em desvantagem (efeito que o modelo não conhece).
    # Só se compara a diferença entre os times COMPLETOS.
    cheios = n == n.max()
    if status == 'faltante' and cheios.sum() >= 2:
        i, j = np.where(cheios)[0][:2]
        dif_prev, dif_real = pr[i] - pr[j], pts[i] - pts[j]
        nota = f"só {TEAMS[i]} x {TEAMS[j]}: previsto {dif_prev:+.1f}, real {dif_real:+.1f} ({'acertou o lado' if dif_prev*dif_real>0 else 'errou o lado'})"
    else:
        dif_prev = dif_real = float('nan'); nota = ''
    prc, real = pr - pr.mean(), pts - pts.mean()
    ok = int(np.argmax(prc)) == int(np.argmax(real))
    print(f"{d:%d/%m/%Y} [{status}] jogos={jogos:.0f} tamanhos={dict(zip(TEAMS, n))}\n   prev {np.round(prc,1)}  real {np.round(real,1)}  erro médio {np.abs(prc-real).mean():.2f}  campeão {'acertou' if ok else 'errou'}" + (f"\n   {nota}" if nota else ''))
    linhas.append(dict(sabado=f"{d:%Y-%m-%d}", modelo_ate=f"{corte:%Y-%m-%d}", status=status, jogos=int(jogos),
                       prev_branco=round(prc[0],2), prev_azul=round(prc[1],2), prev_marrom=round(prc[2],2),
                       real_branco=round(real[0],2), real_azul=round(real[1],2), real_marrom=round(real[2],2),
                       erro_medio=round(float(np.abs(prc-real).mean()),2), erro_todos_iguais=round(float(np.abs(real).mean()),2),
                       campeao_acertou=int(ok), nota=nota))
H = os.path.join('..', 'dados', 'historico_previsoes.csv')
campos = list(linhas[0].keys())
antigas = []
if os.path.exists(H):
    chaves = {(l['sabado'], l['modelo_ate']) for l in linhas}
    antigas = [l for l in csv.DictReader(open(H, encoding='utf-8')) if (l['sabado'], l['modelo_ate']) not in chaves]
with open(H, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=campos); w.writeheader(); w.writerows(antigas + linhas)
oks = [l for l in linhas if l['status'] == 'ok']
if oks:
    print(f"\nSábados completos ({len(oks)}): erro médio {np.mean([l['erro_medio'] for l in oks]):.2f} pts vs {np.mean([l['erro_todos_iguais'] for l in oks]):.2f} de 'todos iguais'.")
print(f"Registrado em {H}. Só 'ok' entra nas métricas oficiais; 'faltante' e 'jogos_incompletos' ficam registrados à parte.")
