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

## Atualizar com novos sábados (um comando)

1. Exporte a planilha "Bola de Ouro" do Google Sheets como `.xlsx` (todas as abas) ou peça ao Claude.
2. Em `modelo/`: **`python atualizar.py caminho/da/planilha.xlsx`** (leva cerca de 15 segundos).
3. Revise com `git diff --stat` e faça o commit de `sorteio_am/`.

O comando faz, nesta ordem (o teste vem **antes** do retreino):

| Passo | O que faz | Onde registra |
|---|---|---|
| 1 | Lê as abas 2026 e Jogos da planilha | `dados/bola_de_ouro_2026_export.txt`, `dados/jogos.csv` |
| 2 | **Teste prospectivo**: o modelo antigo (`data.json`) prevê os sábados que vieram depois dele. Status: `ok`, `faltante` (time com menos atletas: só se compara os times completos), `jogos_incompletos` (menos de 9 jogos) | `dados/historico_previsoes.csv` |
| 3 | Atletas novos recebem posição proposta (as já aceitas não mudam) | `dados/posicoes_propostas.csv` |
| 4 | **Retreino** (`final_fit`, `gk`, `export`) e atualização do `data.json`, mantendo `rules` e `rulesVer` | `dados/data.json` |
| 5 | Teste retroativo dos últimos 8 sábados | `dados/historico_modelo.csv` (coluna `base_ate`) |
| 6 | **Aba Jogos**: força prevista x resultado de cada jogo e de cada confronto | `dados/jogos_confrontos.csv`, `dados/historico_jogos.csv` |
| 7 | Reconstrói a página | `index.html` |

Se algo falhar, os arquivos de `dados/` voltam ao estado anterior. O comando não faz commit nem publica. Rodar duas vezes com a mesma planilha não muda nada (o `data.json` sai idêntico).

### Aba Jogos (confrontos)
Para cada sábado com jogos, o modelo é treinado sem aquele sábado e a força de cada time é a soma dos ratings de quem jogou. Compara-se a diferença de força com o resultado de cada jogo e de cada confronto (cada dupla de times joga 3 vezes no sábado). Em 29/10/2026 (15 sábados, 133 jogos): nos jogos com times completos, o time mais forte ganhou 58 de 91 decididos (64%; por acaso seria 50%) e a correlação força x saldo de gols foi 0,26. Linha em branco de jogo na planilha (ex.: jogo 9 de 17/10) é ignorada e aparece como sábado com 8 jogos.

Sugestão: registrar na planilha se o sorteio foi aleatório, manual ou pelo app, para o modelo não aprender o gosto de quem montou os times.

Requisitos: Python 3 com pandas, numpy e openpyxl.

## Times desfalcados (faltante)

Um time com menos atletas que os outros joga em desvantagem em todos os jogos, e isso não é qualidade dos atletas. Por isso o treino (`model.py`, função `design`) ignora, em cada sábado, os times com tamanho diferente do usual. Nos testes retroativos isso subiu o R² dos times completos de 0,31 para 0,33. Os sábados com faltante continuam servindo para os outros dois times e para o histórico de duplas.
