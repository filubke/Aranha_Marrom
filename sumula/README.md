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
Vitória 3 (goleiro 2), empate 1, gol 1, assistência 1, presença 2 (atraso 1, falta −5), jogo sem sofrer gol para ZC 1, falta dura −2 (marcada no jogo, como um amarelo) e bônus 5 automático para o time de linha que ganhou todos os jogos do dia.

## Ligar a planilha (quando for a hora)
Siga o cabeçalho de `apps_script/Code.gs`. Depois cole o endereço `/exec` e a chave em ⚙ dentro da súmula. O script grava nas abas `2026` e `Jogos` com as fórmulas existentes e cria as abas `Lances` e `Goleiros_Jogo`. Login com Google: preencher `GOOGLE_CLIENT_ID` e `ALLOWED_EMAILS` nas propriedades do script.

## Ordem dos jogos
3 times: o 1º jogo é sorteado; quem ganha fica (empate: par ou ímpar) e a sequência se repete (padrão observado nos 15 sábados de 2026). 2 e 4 times usam uma ordem assumida e podem ser editados jogo a jogo.

## Vários celulares (um anota por vez)
- Quem só quer ver abre a página: sem login, atualiza sozinha a cada ~6 s.
- Para anotar, toque em **Assumir** (exige login Google ou a chave de acesso). Quem estava anotando passa a só visualizar. Cada troca fica registrada na aba `Log_Sumula` da planilha, com o e-mail de quem assumiu, o horário, e também cada envio de resultados e de PDF.
- Configure em `config.js`: `SCRIPT_URL` (endereço `/exec`) e `CLIENT_ID` (ID do cliente OAuth). Propriedades do script: `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS` (e-mails de quem pode anotar, separados por vírgula) ou `ACCESS_KEY`.
- O estado do dia fica guardado na aba oculta `_SumulaEstado`. O que o antigo titular digitou sem conexão e não chegou a enviar se perde quando outra pessoa assume.

## PDF no Drive
Em **Resumo** há **Salvar PDF na pasta Sumulas do Drive** (também é feito depois de cada envio). O arquivo se chama `SUMULA dd-mm-aa (digital).pdf`, sem tocar nos PDFs escaneados. A pasta é a propriedade `PDF_FOLDER_ID` do script (padrão: a pasta "Sumulas" já existente).
