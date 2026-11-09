# Súmula Aranha Marrom

Página para lançar os jogos de sábado (gols, assistências, resultado de cada jogo) e, quando ligada, gravar na planilha "Bola de Ouro Aranha Marrom 2026".

**Estado atual: modo de teste.** Nenhuma planilha está ligada, então o botão de envio fica desligado. Dá para lançar um sábado inteiro e ver o resumo sem risco.

## Como usar no sábado
1. No sorteio, toque em **Enviar para a súmula** (ou **Copiar texto** e cole na súmula, se precisar ajustar algo por fora).
2. Na súmula, aba **Times**: toque em **Usar o sorteio**. Marque quem atrasou (presença 1) ou faltou (−5).
3. Aba **Jogo**: **+ GOL** no time que marcou, depois autor e assistência. **Fim do jogo** abre o próximo.
4. Aba **Resumo**: tabela do dia e pontos de cada atleta.

Os dados do dia ficam salvos no aparelho (localStorage). O sorteio e a súmula precisam estar no mesmo endereço (GitHub Pages) para trocar os times.

## Regras de pontuação (iguais às da planilha)
Vitória 3 (goleiro 2), empate 1, gol 1, assistência 1, presença 2 (atraso 1, falta −5), jogo sem sofrer gol para ZC 1, bônus 5, falta dura −2.

## Ligar a planilha (quando for a hora)
Siga o cabeçalho de `apps_script/Code.gs`. Depois cole o endereço `/exec` e a chave em ⚙ dentro da súmula. O script grava nas abas `2026` e `Jogos` com as fórmulas existentes e cria as abas `Lances` e `Goleiros_Jogo`. Login com Google: preencher `GOOGLE_CLIENT_ID` e `ALLOWED_EMAILS` nas propriedades do script.

## Ordem dos jogos
3 times: o 1º jogo é sorteado; quem ganha fica (empate: par ou ímpar) e a sequência se repete (padrão observado nos 15 sábados de 2026). 2 e 4 times usam uma ordem assumida e podem ser editados jogo a jogo.
