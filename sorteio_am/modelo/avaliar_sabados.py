"""Teste fora da amostra, sábado a sábado ("testa primeiro, treina depois").

Para cada um dos últimos K sábados válidos, treina só com os sábados anteriores,
prevê a força de cada time e compara com os pontos que ele fez de fato.
O último sábado da base é o "sábado novo": o resultado dele mostra como o modelo
teria ido se tivesse sido usado no sorteio.

Uso (dentro de modelo/):  python avaliar_sabados.py [K]
Depois de olhar o teste, rode final_fit.py/export.py para retreinar com todos os dias.
Cada execução registra uma linha em ../dados/historico_modelo.csv (uma por último sábado avaliado),
para acompanhar se o modelo melhora conforme entram dados.
"""
import sys
import numpy as np
from model import *

KW = dict(lam=6, lam_b=200)
K = int(sys.argv[1]) if len(sys.argv) > 1 else 8
days = valid_days
rows = []
for d in days[-K:]:
    tr = [x for x in days if x < d]
    s, _, _ = fit(tr, **KW)
    p, y = predict(s, [d])            # p = força prevista (pts), y = pts reais menos a média do dia
    best_pred, best_real = int(np.argmax(p)), int(np.argmax(y))
    rows.append((d, p, y, best_pred == best_real))
print(f"{len(days)} sábados válidos na base. Teste nos últimos {K} (treino = tudo que veio antes).\n")
print(f"{'sábado':<12}{'prev. (B/A/M)':<22}{'real (B/A/M)':<22}{'erro médio':>10}  acertou campeão")
P_all, Y_all = [], []
for d, p, y, ok in rows:
    P_all.append(p); Y_all.append(y)
    print(f"{str(d)[:10]:<12}{np.round(p,1)!s:<22}{np.round(y,1)!s:<22}{np.abs(p-y).mean():>10.2f}  {'sim' if ok else 'não'}")
P_all, Y_all = np.concatenate(P_all), np.concatenate(Y_all)
r2 = 1 - ((Y_all - P_all) ** 2).sum() / (Y_all ** 2).sum()
print(f"\nR² fora da amostra: {r2:.2f} | correlação: {np.corrcoef(P_all, Y_all)[0,1]:.2f} | "
      f"erro médio do modelo: {np.abs(P_all-Y_all).mean():.2f} pts | erro de prever 'todos iguais': {np.abs(Y_all).mean():.2f} pts")
print("Campeão acertado em", sum(r[3] for r in rows), "de", len(rows), "(acaso = 1 em 3).")
print("Ordem dos times nas colunas:", TEAMS)

# ---- histórico: uma linha por base avaliada (não duplica se rodar de novo com os mesmos dados) ----
import csv, os, datetime
H = os.path.join('..', 'dados', 'historico_modelo.csv')
ultimo = str(days[-1])[:10]
campos = ['rodado_em', 'ultimo_sabado', 'sabados_validos', 'janela_teste', 'r2_fora_amostra', 'correlacao', 'erro_medio_modelo', 'erro_medio_todos_iguais', 'campeao_acertos']
linha = dict(rodado_em=datetime.date.today().isoformat(), ultimo_sabado=ultimo, sabados_validos=len(days), janela_teste=K,
             r2_fora_amostra=round(float(r2), 3), correlacao=round(float(np.corrcoef(P_all, Y_all)[0, 1]), 3),
             erro_medio_modelo=round(float(np.abs(P_all - Y_all).mean()), 2), erro_medio_todos_iguais=round(float(np.abs(Y_all).mean()), 2),
             campeao_acertos=f"{sum(r[3] for r in rows)}/{len(rows)}")
antigas = []
if os.path.exists(H):
    antigas = [l for l in csv.DictReader(open(H, encoding='utf-8')) if l['ultimo_sabado'] != ultimo or l['janela_teste'] != str(K)]
with open(H, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=campos); w.writeheader(); w.writerows(antigas + [linha])
print('Histórico atualizado em', H)
