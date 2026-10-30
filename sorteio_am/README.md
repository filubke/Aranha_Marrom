# Sorteio Aranha Marrom

Sorteio equilibrado (mas aleatório) dos 3 times de sábado. A página `index.html` é autônoma: abre no celular e no desktop, sem servidor.

## Estrutura

| Pasta/arquivo | O que é |
|---|---|
| `index.html` | A ferramenta final (gerada por `app/build.py`; não edite à mão) |
| `app/app.tmpl.html` | Código-fonte da página (HTML/CSS/JS). Contém o motor de sorteio, a previsão e a edição dos times |
| `app/build.py` | Junta template + `dados/data.json` + logo e gera `index.html` |
| `dados/data.json` | **Saída do modelo embutida na página**: rating de cada atleta, incerteza, posição, pares recentes, regras "não jogam juntos" |
| `dados/bola_de_ouro_2026_export.txt` | Export da planilha (aba 2026 + demais) usado para treinar |
| `dados/posicoes_propostas.csv` | Posições (Z/M/A/G) propostas pelo histórico, até chegar a lista oficial |
| `modelo/` | Scripts Python que ajustam o modelo e geram os números |

## Como o modelo funciona

1. **Dados** (`load.py`): lê a planilha, normaliza nomes (Fábio→Fabio, Preto≡Marrom etc.) e monta uma linha por atleta por sábado.
2. **Alvo**: pontos do time no dia (3·vitória + empate), centrados pela média do dia. Só entram os 32 sábados "válidos" (9 jogos registrados).
3. **Rating dos atletas** (`model.py`, `final_fit.py`): regressão ridge (λ=6) dos pontos do time sobre indicadores 0/1 de quem jogou. Há um *prior* a partir de gols, assistências e jogos sem sofrer gol por sábado, para atletas com pouco histórico. Ratings são centrados por posição. Cada atleta tem também um desvio-padrão (incerteza).
4. **Validação**: leave-one-day-out R² ≈ 0,25 e teste de permutação p < 0,01. O ruído de um time num sábado é ≈ 4 pts, então o modelo equilibra mas não prevê placar.
5. **Goleiros** (`gk.py`): ranking próprio, pontos por jogo encolhidos para a média (6 jogos por time). Com 2 goleiros, uma das configurações dá mais jogos a um deles.
6. **Pares** (`pairs.py`): sinergia/antagonismo por dupla, comparado a uma distribuição por permutação. Nenhuma dupla é significativa, mas Adriano+Eliel e Alexandre+Eliel entram como regra opcional "não jogam juntos".
7. **Posições** (`classify.py`, `final.py`, `pos.py`): classificação Z/M/A pelo histórico.
8. **Exportação** (`export.py`): gera os números que a página usa. `pairstat` e `rules` de `data.json` foram adicionados depois e estão mantidos direto em `dados/data.json`.

### Motor do sorteio (no navegador, em `app.tmpl.html`)

1. Gera 60 000 divisões válidas ao acaso (respeitando vagas por posição, goleiros, regras ligadas e "juntos/separados").
2. Perda de cada divisão = desvio-padrão da força dos times + 0,35 · desbalanço por posição + 0,5 · desbalanço de incerteza + 0,6 · repetição de duplas dos últimos 8 sábados (os três últimos são opcionais).
3. Ordena e sorteia **uniformemente** entre os q % melhores (padrão 10 %). Esse é o controle entre equilíbrio e aleatoriedade.
4. Previsão: força por time (pts relativos à média de 8,4), chance de ganhar o dia por simulação e pontos esperados. Recalculada a cada troca de atleta.

## Atualizar com novos sábados (teste primeiro, treino depois)

1. Lance o sábado na planilha e exporte para `dados/bola_de_ouro_2026_export.txt` (ou peça ao Claude para atualizar a base).
2. **Teste:** em `modelo/`, `python avaliar_sabados.py 8`. Para cada um dos últimos 8 sábados o modelo é treinado só com o que veio antes e prevê a força de cada time. O script compara com os pontos reais (erro médio, R², se acertou o time campeão). O sábado novo é o último da lista.
3. **Treino:** `python load.py && python final_fit.py && python gk.py && python pairs.py && python export.py` (gera `dados/data_modelo.json`).
4. Copie `roster` e `meta` para `dados/data.json`, mantendo `pairstat` e `rules`.
5. Em `app/`: `python build.py` e faça commit de `index.html`.

Cada teste grava uma linha em `dados/historico_modelo.csv` (data, último sábado, R², erro, campeões acertados). Para comparar versões do modelo ao longo do tempo, olhe esse arquivo e o histórico do `dados/data.json` no Git (cada atualização é um commit).

Resultado do teste em 29/10/2026 (últimos 8 sábados): R² fora da amostra 0,21, correlação 0,46, erro médio 2,8 pts contra 3,3 pts de "todos iguais", campeão acertado em 5 de 8 (acaso = 1 em 3).

Sugestão: registrar na planilha se o sorteio foi aleatório, manual ou pelo app, para o modelo não aprender o gosto de quem montou os times.

Requisitos: Python 3 com pandas e numpy.
