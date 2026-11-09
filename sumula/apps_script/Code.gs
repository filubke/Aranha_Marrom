/**
 * Súmula Aranha Marrom — receptor da planilha "Bola de Ouro Aranha Marrom 2026"
 *
 * INSTALAÇÃO (uma vez, uns 5 minutos)
 * 1. Abra a planilha > Extensões > Apps Script. Apague o conteúdo e cole este arquivo.
 * 2. Engrenagem (Configurações do projeto) > Propriedades do script > Adicionar:
 *      ACCESS_KEY      uma senha qualquer (ex.: aranha-2026-xyz)       <- login simples (fase 1)
 *    Quando for ligar o login com Google (fase 2), adicione também:
 *      GOOGLE_CLIENT_ID   ID do cliente OAuth (tipo "Aplicativo da Web")
 *      ALLOWED_EMAILS     e-mails permitidos, separados por vírgula
 *    Com GOOGLE_CLIENT_ID preenchido, a chave deixa de valer e só entra quem estiver na lista.
 * 3. Implantar > Nova implantação > tipo "App da Web":
 *      Executar como: Eu     |     Quem tem acesso: Qualquer pessoa
 *    Autorize quando o Google pedir. Copie o endereço que termina em /exec.
 * 4. Na súmula: ⚙ > cole o endereço e a chave > Testar conexão.
 *
 * O QUE GRAVA
 * - Aba "2026": uma linha por atleta, com as mesmas fórmulas das linhas atuais (colunas B, D, L, O, Q).
 *   Quem faltou entra no grupo "Faltou" com presença -5, como já é feito hoje.
 * - Aba "Jogos": uma linha por jogo.
 * - Abas novas "Lances" (cada gol com autor e assistência) e "Goleiros_Jogo" (goleiro de cada time por jogo).
 * Nada existente é alterado. Um sábado que já está na planilha não é gravado de novo sem confirmação.
 */

var CFG = {
  TAB_ATLETAS: '2026',
  TAB_JOGOS: 'Jogos',
  TAB_LANCES: 'Lances',
  TAB_GK: 'Goleiros_Jogo',
  TZ: 'America/Sao_Paulo'
};

function doGet() {
  return out_({ ok: true, app: 'sumula-aranha-marrom', hint: 'Use POST.' });
}

function doPost(e) {
  var res;
  try {
    var req = JSON.parse(e.postData.contents);
    res = handle_(req);
  } catch (err) {
    res = { ok: false, code: err.code || 'ERRO', message: String((err && err.message) || err) };
  }
  return out_(res);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, msg) {
  var e = new Error(msg);
  e.code = code;
  throw e;
}

function handle_(req) {
  auth_(req);
  if (req.action === 'ping') {
    return { ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() };
  }
  if (req.action === 'append') {
    return append_(req);
  }
  fail_('ACAO', 'Ação desconhecida.');
}

/* ---------- acesso ---------- */
function auth_(req) {
  var p = PropertiesService.getScriptProperties();
  var cid = p.getProperty('GOOGLE_CLIENT_ID');
  if (cid) {
    if (!req.idToken) fail_('AUTH', 'Entre com sua conta Google na súmula.');
    var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(req.idToken), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) fail_('AUTH', 'Login do Google inválido ou expirado.');
    var t = JSON.parse(r.getContentText());
    if (t.aud !== cid) fail_('AUTH', 'Login emitido para outro aplicativo.');
    if (String(t.email_verified) !== 'true') fail_('AUTH', 'E-mail do Google não verificado.');
    var allowed = (p.getProperty('ALLOWED_EMAILS') || '').toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(String);
    if (allowed.indexOf(String(t.email).toLowerCase()) < 0) fail_('AUTH', 'Este e-mail não tem permissão para lançar resultados.');
    return;
  }
  var key = p.getProperty('ACCESS_KEY');
  if (!key) fail_('AUTH', 'Defina ACCESS_KEY (ou GOOGLE_CLIENT_ID) nas propriedades do script.');
  if (req.key !== key) fail_('AUTH', 'Chave de acesso incorreta.');
}

/* ---------- utilidades puras (testáveis fora do Google) ---------- */
function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Mapa nome normalizado -> grafia mais usada na planilha (evita criar "Fabio" e "Fábio" separados).
function spellingMap_(names) {
  var count = {};
  names.forEach(function (n) {
    var s = String(n == null ? '' : n).trim();
    if (!s) return;
    var k = norm_(s);
    count[k] = count[k] || {};
    count[k][s] = (count[k][s] || 0) + 1;
  });
  var map = {};
  Object.keys(count).forEach(function (k) {
    var best = null, bc = -1;
    Object.keys(count[k]).forEach(function (s) { if (count[k][s] > bc) { best = s; bc = count[k][s]; } });
    map[k] = best;
  });
  return map;
}

function f_(tpl, r) {
  return tpl.replace(/\{r\}/g, r).replace(/\{p\}/g, r - 1);
}

var FORM = {
  B: '=IF(A{r}="",B{p},A{r})',
  D: '=IF(C{r}="",D{p},C{r})',
  L: '=IF(P{r}="ZC", SUMPRODUCT((Jogos!$B$2:$B996=B{r})*(Jogos!$D$2:$D996=D{r})*(Jogos!$F$2:$F996=0)*(Jogos!$F$2:$F996<>"")) + SUMPRODUCT((Jogos!$B$2:$B996=B{r})*(Jogos!$G$2:$G996=D{r})*(Jogos!$E$2:$E996=0)*(Jogos!$E$2:$E996<>"")), "")',
  O: '=IF(B{r}="","",IF(P{r}="Goleiro",H{r}*2,H{r}*3)+SUM(F{r},G{r},I{r},J{r})-K{r}*2+L{r}+M{r}*5)',
  Q: '=IF(B{r}="","",IF(P{r}="Goleiro",H{r}*2,H{r}*3)+SUM(I{r}:J{r},L{r})-K{r}*2)',
  JB: '=IF(A{r}="",B{p},A{r})'
};

// Linhas da aba 2026 (A..Q). dateObj só na primeira linha; time só na primeira linha de cada grupo.
function buildAtletaRows_(atletas, dateObj, startRow, spell) {
  var rows = [], lastTime = null;
  atletas.forEach(function (a, i) {
    var r = startRow + i;
    var nome = spell[norm_(a.nome)] || String(a.nome).trim();
    var isGk = a.pos === 'Goleiro';
    rows.push([
      i === 0 ? dateObj : '',
      f_(FORM.B, r),
      a.time !== lastTime ? a.time : '',
      f_(FORM.D, r),
      nome,
      a.ausente ? '' : num_(a.gols), a.ausente ? '' : num_(a.ass), a.ausente ? '' : num_(a.vit), a.ausente ? '' : num_(a.emp), num_(a.assid),
      a.falta ? a.falta : '',
      f_(FORM.L, r),
      a.bonus ? a.bonus : '',
      isGk && a.gs != null ? a.gs : '',
      f_(FORM.O, r),
      a.pos || '',
      f_(FORM.Q, r)
    ]);
    lastTime = a.time;
  });
  return rows;
}

function buildJogoRows_(jogos, dateObj, startRow) {
  return jogos.map(function (j, i) {
    var r = startRow + i;
    return [i === 0 ? dateObj : '', f_(FORM.JB, r), j.n, j.timeA, num_(j.golsA), num_(j.golsB), j.timeB];
  });
}

function num_(v) { return v == null || v === '' ? 0 : Number(v); }

function validate_(req) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.date))) fail_('DADOS', 'Data inválida.');
  if (!req.atletas || !req.atletas.length) fail_('DADOS', 'Nenhum atleta para gravar.');
  if (!req.jogos || !req.jogos.length) fail_('DADOS', 'Nenhum jogo para gravar.');
  req.jogos.forEach(function (j) {
    if (!(j.golsA >= 0) || !(j.golsB >= 0)) fail_('DADOS', 'Placar inválido no jogo ' + j.n + '.');
  });
  // Gols atribuídos a atletas não podem passar dos gols dos times (a súmula já impede; aqui é a segunda trava).
  var porTime = {};
  req.jogos.forEach(function (j) {
    porTime[j.timeA] = (porTime[j.timeA] || 0) + j.golsA;
    porTime[j.timeB] = (porTime[j.timeB] || 0) + j.golsB;
  });
  var atrib = {};
  (req.lances || []).forEach(function (l) { if (l.autor) atrib[l.time] = (atrib[l.time] || 0) + 1; });
  Object.keys(atrib).forEach(function (t) {
    if (atrib[t] > (porTime[t] || 0)) fail_('DADOS', 'Há mais gols atribuídos do que gols do time ' + t + '.');
  });
}

/* ---------- gravação ---------- */
function lastRowIn_(sheet, col) {
  var n = sheet.getMaxRows();
  var v = sheet.getRange(1, col, n, 1).getValues();
  for (var i = n - 1; i >= 0; i--) if (v[i][0] !== '' && v[i][0] !== null) return i + 1;
  return 1;
}

function fmt_(d) { return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd'); }

// Linhas (de 2 até o fim dos dados) cuja coluna B (data preenchida) é igual à data.
function findDateRows_(sheet, lastRow, iso) {
  if (lastRow < 2) return [];
  var v = sheet.getRange(2, 2, lastRow - 1, 1).getValues(), hit = [];
  for (var i = 0; i < v.length; i++) {
    var x = v[i][0];
    if (x instanceof Date && fmt_(x) === iso) hit.push(i + 2);
  }
  return hit;
}

function ensureRows_(sheet, upTo) {
  var max = sheet.getMaxRows();
  if (upTo > max) sheet.insertRowsAfter(max, upTo - max);
}

function ensureTab_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function append_(req) {
  validate_(req);
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sa = ss.getSheetByName(CFG.TAB_ATLETAS), sj = ss.getSheetByName(CFG.TAB_JOGOS);
    if (!sa || !sj) fail_('ABAS', 'Não encontrei as abas "' + CFG.TAB_ATLETAS + '" e "' + CFG.TAB_JOGOS + '".');
    var dateObj = Utilities.parseDate(req.date, CFG.TZ, 'yyyy-MM-dd');

    var lastA = lastRowIn_(sa, 5);   // coluna E = Atleta
    var lastJ = lastRowIn_(sj, 4);   // coluna D = Time A
    var hitA = findDateRows_(sa, lastA, req.date);
    var hitJ = findDateRows_(sj, lastJ, req.date);
    var startA = lastA + 1, startJ = lastJ + 1;

    if (hitA.length || hitJ.length) {
      if (!req.replace) {
        fail_('DATE_EXISTS', 'Este sábado já está na planilha (' + hitA.length + ' linhas em "2026", ' + hitJ.length + ' em "Jogos"). Deseja substituir?');
      }
      // Só substitui se o sábado for o último bloco de cada aba (nada depois dele).
      var okA = !hitA.length || (hitA[hitA.length - 1] === lastA && hitA.length === lastA - hitA[0] + 1);
      var okJ = !hitJ.length || (hitJ[hitJ.length - 1] === lastJ && hitJ.length === lastJ - hitJ[0] + 1);
      if (!okA || !okJ) fail_('SUBSTITUIR', 'Esse sábado não é o último da planilha, então não dá para substituir por aqui. Corrija direto na planilha.');
      if (hitA.length) { sa.getRange(hitA[0], 1, hitA.length, 17).clearContent(); startA = hitA[0]; }
      if (hitJ.length) { sj.getRange(hitJ[0], 1, hitJ.length, 7).clearContent(); startJ = hitJ[0]; }
    }

    var spell = spellingMap_(sa.getRange(2, 5, Math.max(lastA - 1, 1), 1).getValues().map(function (r) { return r[0]; }));

    // 2026
    var rowsA = buildAtletaRows_(req.atletas, dateObj, startA, spell);
    ensureRows_(sa, startA + rowsA.length - 1);
    try { sa.getRange(startA - 1, 1, 1, 17).copyTo(sa.getRange(startA, 1, rowsA.length, 17), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e1) {}
    sa.getRange(startA, 1, rowsA.length, 17).setValues(rowsA);
    sa.getRange(startA, 1).setNumberFormat('dd/MM/yyyy');

    // Jogos
    var rowsJ = buildJogoRows_(req.jogos, dateObj, startJ);
    ensureRows_(sj, startJ + rowsJ.length - 1);
    try { sj.getRange(startJ - 1, 1, 1, 7).copyTo(sj.getRange(startJ, 1, rowsJ.length, 7), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e2) {}
    sj.getRange(startJ, 1, rowsJ.length, 7).setValues(rowsJ);
    sj.getRange(startJ, 1).setNumberFormat('dd/MM/yyyy');

    // Lances e goleiros (abas novas, só da súmula)
    var sl = ensureTab_(ss, CFG.TAB_LANCES, ['Data', 'Jogo', 'Ordem', 'Time', 'Autor', 'Assistência', 'Placar (A-B)']);
    var sg = ensureTab_(ss, CFG.TAB_GK, ['Data', 'Jogo', 'Time A', 'Goleiro A', 'Time B', 'Goleiro B']);
    if (req.replace) { dropOwn_(sl, req.date); dropOwn_(sg, req.date); }
    var sp = function (n) { return n ? (spell[norm_(n)] || String(n).trim()) : ''; };
    var rowsL = (req.lances || []).map(function (l) { return [dateObj, l.jogo, l.ordem, l.time, sp(l.autor), sp(l.assist), l.placar]; });
    if (rowsL.length) sl.getRange(sl.getLastRow() + 1, 1, rowsL.length, 7).setValues(rowsL);
    var rowsG = (req.goleiros || []).map(function (g) { return [dateObj, g.n, g.timeA, sp(g.gkA), g.timeB, sp(g.gkB)]; });
    if (rowsG.length) sg.getRange(sg.getLastRow() + 1, 1, rowsG.length, 6).setValues(rowsG);
    SpreadsheetApp.flush();

    return { ok: true, written: { atletas: rowsA.length, jogos: rowsJ.length, lances: rowsL.length }, rows: { atletas2026: startA, jogos: startJ } };
  } finally {
    lock.releaseLock();
  }
}

function dropOwn_(sheet, iso) {
  for (var r = sheet.getLastRow(); r >= 2; r--) {
    var x = sheet.getRange(r, 1).getValue();
    if (x instanceof Date && fmt_(x) === iso) sheet.deleteRow(r);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { norm_: norm_, spellingMap_: spellingMap_, buildAtletaRows_: buildAtletaRows_, buildJogoRows_: buildJogoRows_, FORM: FORM, f_: f_, validate_: validate_ };
}
