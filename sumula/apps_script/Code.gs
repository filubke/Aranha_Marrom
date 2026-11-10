/**
 * Súmula Aranha Marrom — receptor da planilha "Bola de Ouro Aranha Marrom 2026"
 *
 * INSTALAÇÃO (uma vez, uns 5 minutos). Faça primeiro na CÓPIA DE TESTE da planilha.
 * 1. Abra a planilha > Extensões > Apps Script. Apague o conteúdo e cole este arquivo.
 * 2. Engrenagem (Configurações do projeto) > Propriedades do script > Adicionar:
 *      ACCESS_KEY         uma senha para quem pode anotar (ex.: aranha-2026-xyz)   <- fase 1
 *    Quando for ligar o login com Google (fase 2), adicione também:
 *      GOOGLE_CLIENT_ID   ID do cliente OAuth (tipo "Aplicativo da Web")
 *      ALLOWED_EMAILS     e-mails de quem pode anotar, separados por vírgula
 *    Com GOOGLE_CLIENT_ID preenchido, a chave deixa de valer e só anota quem estiver na lista.
 * 3. Implantar > Nova implantação > tipo "App da Web":
 *      Executar como: Eu     |     Quem tem acesso: Qualquer pessoa
 *    Autorize quando o Google pedir. Copie o endereço que termina em /exec.
 * 4. Cole o endereço em sumula/config.js (SCRIPT_URL) ou em ⚙ na súmula, e use "Testar conexão".
 *    Depois de editar o código, use Implantar > Gerenciar implantações > editar > Nova versão.
 *
 * COMO FUNCIONA
 * - Qualquer pessoa com o link VÊ o jogo ao vivo (sem login).
 * - Só quem tem a chave (ou e-mail permitido) pode ASSUMIR a súmula e anotar. Um anotador por vez;
 *   quem assume depois toma o lugar do anterior.
 * - O estado do dia fica no cache do Google (rápido) e numa aba oculta "_SumulaEstado" (durável).
 * - No fim do dia, o anotador envia: o script grava nas abas "2026" e "Jogos" com as fórmulas atuais e
 *   cria as abas "Lances" (gols e faltas graves) e "Goleiros_Jogo". Nada existente é alterado.
 *   Um sábado que já está na planilha não é gravado de novo sem confirmação.
 */

var CFG = {
  TAB_ATLETAS: '2026',
  TAB_JOGOS: 'Jogos',
  TAB_LANCES: 'Lances',
  TAB_GK: 'Goleiros_Jogo',
  TAB_ESTADO: '_SumulaEstado',
  PDF_FOLDER_ID: '1rEAeqAb4Vnth6_UtXq9wA5TOA812o9_s',   // pasta "Sumulas" do Drive (pode ser trocada na propriedade PDF_FOLDER_ID)
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
  switch (req.action) {
    case 'ping':
      var edit = true, why = '', who0 = null;
      try { who0 = auth_(req); } catch (e) { edit = false; why = e.message; }
      return { ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName(), edit: edit, why: why, email: edit && who0 ? who0.email || '' : '' };
    case 'state_get':           // público: ver o jogo ao vivo não exige login
      return stateGetGas_(req);
    case 'take':                // assumir exige login (ou chave); put/beat/release usam o tk devolvido pelo take
      var who = auth_(req);
      req.newTk = Utilities.getUuid();
      return stateWriteGas_(req, who);
    case 'put':
    case 'beat':
    case 'release':
      return stateWriteGas_(req, null);
    case 'append':
      var wa = auth_(req);
      var ra = append_(req);
      if (ra && ra.ok) log_(wa, 'Enviou para a planilha', req.date + ' · ' + (req.jogos || []).length + ' jogos');
      return ra;
    case 'pdf':
      var wp = auth_(req);
      var rp = pdf_(req);
      if (rp && rp.ok) log_(wp, 'Salvou PDF', rp.name);
      return rp;
  }
  fail_('ACAO', 'Ação desconhecida.');
}

/* ---------- registro de quem editou (aba visível "Log_Sumula") ---------- */
function log_(who, evento, detalhe) {
  try {
    var sh = ensureTab_(SpreadsheetApp.getActiveSpreadsheet(), 'Log_Sumula', ['Quando', 'Quem', 'O que', 'Detalhe']);
    sh.appendRow([new Date(), (who && who.email) || '(chave de acesso)', evento, detalhe || '']);
  } catch (e) {}
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
    if (allowed.indexOf(String(t.email).toLowerCase()) < 0) fail_('AUTH', 'Este e-mail não tem permissão para anotar.');
    return { email: String(t.email) };
  }
  var key = p.getProperty('ACCESS_KEY');
  if (!key) fail_('AUTH', 'Defina ACCESS_KEY (ou GOOGLE_CLIENT_ID) nas propriedades do script.');
  if (req.key !== key) fail_('AUTH', 'Chave de acesso incorreta.');
  return {};
}

/* ---------- estado compartilhado (lógica pura, testável fora do Google) ---------- */
// doc = { rev, holder: {id,name,at} | null, state | null }.  Só o "holder" escreve; assumir troca o holder.
function emptyDoc_() { return { rev: 0, holder: null, state: null }; }
function pub_(h) { return h ? { id: h.id, name: h.name, email: h.email || '', at: h.at } : null; }   // nunca expõe o tk
function isHolder_(doc, req) { return !!(doc.holder && doc.holder.id === String(req.clientId) && doc.holder.tk && doc.holder.tk === String(req.tk || '')); }

function stateView_(doc, since, now) {
  var r = { ok: true, rev: doc.rev, holder: pub_(doc.holder), now: now };
  if (since !== undefined && since !== null && Number(since) === doc.rev) r.unchanged = true;
  else r.state = doc.state;
  return r;
}

function stateTake_(doc, req, now) {
  var d = { rev: doc.rev, holder: { id: String(req.clientId), name: String(req.name || 'Anotador').slice(0, 40), email: req.email ? String(req.email) : '', tk: String(req.newTk || ''), at: now }, state: doc.state };
  var adopted = !!doc.state;
  if (!doc.state && req.state) { d.state = req.state; d.rev = doc.rev + 1; }
  return { doc: d, persist: true, resp: { ok: true, rev: d.rev, holder: pub_(d.holder), tk: d.holder.tk, state: d.state, adopted: adopted, now: now } };
}

function notHolder_(doc, now) {
  return { doc: doc, persist: false, resp: { ok: false, code: 'NOT_HOLDER', message: 'Outra pessoa assumiu a súmula.', rev: doc.rev, holder: pub_(doc.holder), state: doc.state, now: now } };
}

function statePut_(doc, req, now) {
  if (!isHolder_(doc, req)) return notHolder_(doc, now);
  if (!req.state) return { doc: doc, persist: false, resp: { ok: false, code: 'DADOS', message: 'Estado vazio.', now: now } };
  var d = { rev: doc.rev + 1, holder: { id: doc.holder.id, name: req.name ? String(req.name).slice(0, 40) : doc.holder.name, email: doc.holder.email || '', tk: doc.holder.tk, at: now }, state: req.state };
  return { doc: d, persist: true, resp: { ok: true, rev: d.rev, holder: pub_(d.holder), now: now } };
}

function stateBeat_(doc, req, now) {
  if (!isHolder_(doc, req)) return notHolder_(doc, now);
  var d = { rev: doc.rev, holder: { id: doc.holder.id, name: doc.holder.name, email: doc.holder.email || '', tk: doc.holder.tk, at: now }, state: doc.state };
  return { doc: d, persist: false, resp: { ok: true, rev: d.rev, holder: pub_(d.holder), now: now } };
}

function stateRelease_(doc, req, now) {
  if (!isHolder_(doc, req)) return notHolder_(doc, now);
  var d = { rev: doc.rev, holder: null, state: doc.state };
  return { doc: d, persist: true, resp: { ok: true, rev: d.rev, holder: null, now: now } };
}

/* ---------- estado: cache + aba oculta ---------- */
function stateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.TAB_ESTADO);
  if (!sh) {
    sh = ss.insertSheet(CFG.TAB_ESTADO);
    sh.getRange('A1').setValue('Estado do dia da súmula (não edite). A1 = holder/versão, A2 = jogos.');
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

function loadDoc_() {
  var raw = CacheService.getScriptCache().get('st');
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  var sh = stateSheet_();
  var doc = emptyDoc_();
  var meta = sh.getRange('B1').getValue(), st = sh.getRange('A2').getValue();
  if (meta) { try { var m = JSON.parse(meta); doc.rev = m.rev; doc.holder = m.holder; } catch (e) {} }
  if (st) { try { doc.state = JSON.parse(st); } catch (e) {} }
  return doc;
}

function saveDoc_(doc, persist) {
  var json = JSON.stringify(doc);
  if (json.length > 95000) fail_('GRANDE', 'O estado do dia ficou grande demais.');
  CacheService.getScriptCache().put('st', json, 21600);
  if (persist) {
    var sh = stateSheet_();
    var s = JSON.stringify(doc.state);
    if (s.length > 49000) fail_('GRANDE', 'O estado do dia ficou grande demais.');
    sh.getRange('B1').setValue(JSON.stringify({ rev: doc.rev, holder: doc.holder }));
    sh.getRange('A2').setValue(s);
  }
}

function stateGetGas_(req) {
  return stateView_(loadDoc_(), req.since, Date.now());
}

function stateWriteGas_(req, who) {
  if (!req.clientId) fail_('DADOS', 'clientId ausente.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var doc = loadDoc_(), now = Date.now(), r;
    if (who && who.email) { req.email = who.email; if (!req.name) req.name = who.email.split('@')[0]; }
    if (req.action === 'take') r = stateTake_(doc, req, now);
    else if (req.action === 'put') r = statePut_(doc, req, now);
    else if (req.action === 'beat') r = stateBeat_(doc, req, now);
    else r = stateRelease_(doc, req, now);
    if (r.doc !== doc) saveDoc_(r.doc, r.persist);
    if (req.action === 'take' && r.resp.ok) log_(who, 'Assumiu a súmula', (doc.holder ? 'de ' + (doc.holder.email || doc.holder.name) : 'sem titular anterior'));
    return r.resp;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- utilidades puras ---------- */
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
  (req.lances || []).forEach(function (l) { if (l.autor && (l.tipo || 'Gol') === 'Gol') atrib[l.time] = (atrib[l.time] || 0) + 1; });
  Object.keys(atrib).forEach(function (t) {
    if (atrib[t] > (porTime[t] || 0)) fail_('DADOS', 'Há mais gols atribuídos do que gols do time ' + t + '.');
  });
}

/* ---------- gravação na planilha ---------- */
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

function dropOwn_(sheet, iso) {
  for (var r = sheet.getLastRow(); r >= 2; r--) {
    var x = sheet.getRange(r, 1).getValue();
    if (x instanceof Date && fmt_(x) === iso) sheet.deleteRow(r);
  }
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

    // Lances (gols e faltas graves) e goleiros: abas novas, só da súmula
    var sl = ensureTab_(ss, CFG.TAB_LANCES, ['Data', 'Jogo', 'Ordem', 'Time', 'Autor', 'Assistência', 'Placar (A-B)', 'Tipo']);
    var sg = ensureTab_(ss, CFG.TAB_GK, ['Data', 'Jogo', 'Time A', 'Goleiro A', 'Time B', 'Goleiro B']);
    if (req.replace) { dropOwn_(sl, req.date); dropOwn_(sg, req.date); }
    var sp = function (n) { return n ? (spell[norm_(n)] || String(n).trim()) : ''; };
    var rowsL = (req.lances || []).map(function (l) { return [dateObj, l.jogo, l.ordem, l.time, sp(l.autor), sp(l.assist), l.placar || '', l.tipo || 'Gol']; });
    if (rowsL.length) sl.getRange(sl.getLastRow() + 1, 1, rowsL.length, 8).setValues(rowsL);
    var rowsG = (req.goleiros || []).map(function (g) { return [dateObj, g.n, g.timeA, sp(g.gkA), g.timeB, sp(g.gkB)]; });
    if (rowsG.length) sg.getRange(sg.getLastRow() + 1, 1, rowsG.length, 6).setValues(rowsG);
    SpreadsheetApp.flush();

    return { ok: true, written: { atletas: rowsA.length, jogos: rowsJ.length, lances: rowsL.length }, rows: { atletas2026: startA, jogos: startJ } };
  } finally {
    lock.releaseLock();
  }
}


/* ---------- PDF da súmula (salvo na pasta "Sumulas" do Drive) ---------- */
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

var PDF_COR = { Branco: ['#eeeeee', '#222222'], Azul: ['#2f5fb3', '#ffffff'], Marrom: ['#6b3a1e', '#ffffff'], Preto: ['#222222', '#ffffff'], Amarelo: ['#f2c200', '#222222'] };

function pdfName_(iso) {
  var p = String(iso).split('-');
  return 'SUMULA ' + p[2] + '-' + p[1] + '-' + p[0].slice(2) + ' (digital).pdf';
}

function pdfTabela_(jogos) {
  var m = {}, ord = [];
  function T(n) { if (!m[n]) { m[n] = { t: n, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 }; ord.push(n); } return m[n]; }
  jogos.forEach(function (j) {
    var A = T(j.timeA), B = T(j.timeB), a = num_(j.golsA), b = num_(j.golsB);
    A.j++; B.j++; A.gp += a; A.gc += b; B.gp += b; B.gc += a;
    if (a > b) { A.v++; B.d++; } else if (b > a) { B.v++; A.d++; } else { A.e++; B.e++; }
  });
  return ord.map(function (n) { var r = m[n]; r.pts = r.v * 3 + r.e; return r; })
    .sort(function (x, y) { return y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp; });
}

function pdfHtml_(req) {
  var p = String(req.date).split('-'), dia = p[2] + '/' + p[1] + '/' + p[0];
  var cor = function (t) { return PDF_COR[t] || ['#dddddd', '#222222']; };
  var chip = function (t) { var c = cor(t); return '<span style="background:' + c[0] + ';color:' + c[1] + ';padding:1px 6px;border-radius:3px;border:1px solid #999">' + esc_(t) + '</span>'; };
  var h = '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222}h1{font-size:17pt;margin:0 0 2px}h2{font-size:12pt;margin:14px 0 4px;border-bottom:2px solid #6b3a1e;padding-bottom:2px}' +
    'table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:3px 5px;font-size:9.5pt;text-align:center}th{background:#f0e8de}td.l,th.l{text-align:left}' +
    '.sub{color:#555;font-size:9pt}.gm{margin:0 0 5px;page-break-inside:avoid}.ev{font-size:9pt;color:#333;margin:0 0 0 14px}</style></head><body>';
  h += '<h1>SÚMULA ' + dia + '</h1><div class="sub">Aranha Marrom · gerada pela súmula digital</div>';
  // tabela do dia
  h += '<h2>Resultado do dia</h2><table><tr><th class="l">Time</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr>';
  pdfTabela_(req.jogos).forEach(function (r) { h += '<tr><td class="l">' + chip(r.t) + '</td><td>' + r.j + '</td><td>' + r.v + '</td><td>' + r.e + '</td><td>' + r.d + '</td><td>' + r.gp + '</td><td>' + r.gc + '</td><td>' + (r.gp - r.gc) + '</td><td><b>' + r.pts + '</b></td></tr>'; });
  h += '</table>';
  // jogos
  var gks = {}; (req.goleiros || []).forEach(function (g) { gks[g.n] = g; });
  h += '<h2>Jogos</h2>';
  req.jogos.forEach(function (j) {
    var g = gks[j.n] || {};
    var L = [], R = [];
    (req.lances || []).filter(function (l) { return l.jogo === j.n; }).forEach(function (l) {
      var left = l.time === j.timeA, s;
      if ((l.tipo || 'Gol') === 'Gol') s = '<div class="ev">' + esc_(l.placar) + ' · Gol ' + (l.autor ? esc_(l.autor) : '(sem autor)') + (l.assist ? ' <span class="sub">assist. ' + esc_(l.assist) + '</span>' : '') + '</div>';
      else s = '<div class="ev" style="color:' + (l.tipo === 'Agressão' ? '#b71c1c' : '#9a6b00') + '"><b>' + esc_(l.tipo) + '</b> · ' + esc_(l.autor) + '</div>';
      (left ? L : R).push(s);
    });
    h += '<div class="gm"><table style="margin:0"><tr><th style="width:50%;text-align:left">' + j.n + '. ' + chip(j.timeA) + '</th><th style="width:50%;text-align:right">' + chip(j.timeB) + '</th></tr>' +
      '<tr><td colspan="2" style="font-size:12pt"><b>' + num_(j.golsA) + ' × ' + num_(j.golsB) + '</b></td></tr>' +
      '<tr><td class="l" style="vertical-align:top">' + (L.join('') || '<span class="sub">—</span>') + '</td><td style="text-align:right;vertical-align:top">' + (R.join('') || '<span class="sub">—</span>') + '</td></tr>' +
      ((g.gkA || g.gkB) ? '<tr><td class="l sub">Goleiro: ' + esc_(g.gkA || '—') + '</td><td class="sub" style="text-align:right">Goleiro: ' + esc_(g.gkB || '—') + '</td></tr>' : '') + '</table></div>';
  });
  // atletas
  h += '<h2>Atletas</h2>';
  var grupos = [], gi = {};
  req.atletas.forEach(function (a) { var k = a.ausente ? 'Faltou' : a.time; if (!(k in gi)) { gi[k] = grupos.length; grupos.push({ t: k, r: [] }); } grupos[gi[k]].r.push(a); });
  grupos.forEach(function (G) {
    h += '<table><tr><th class="l" colspan="10">' + (PDF_COR[G.t] ? chip(G.t) : esc_(G.t)) + '</th></tr><tr><th class="l">Atleta</th><th>Pos</th><th>Gols</th><th>Assist.</th><th>Vit.</th><th>Emp.</th><th>Falta dura</th><th>Agressão</th><th>Bônus</th><th>Total</th></tr>';
    G.r.forEach(function (a) {
      var ps = a.pos === 'ZC' ? 'Zag' : (a.pos || '');
      h += '<tr><td class="l">' + esc_(a.nome) + (a.ausente ? ' <span class="sub">(faltou)</span>' : '') + '</td><td>' + esc_(ps) + '</td><td>' + (a.ausente ? '' : num_(a.gols)) + '</td><td>' + (a.ausente ? '' : num_(a.ass)) + '</td><td>' + (a.ausente ? '' : num_(a.vit)) + '</td><td>' + (a.ausente ? '' : num_(a.emp)) + '</td><td>' + (a.falta ? a.falta : '') + '</td><td>' + (a.agr ? a.agr : '') + '</td><td>' + (a.bonus ? a.bonus : '') + '</td><td><b>' + (a.total != null ? a.total : '') + '</b></td></tr>';
    });
    h += '</table>';
  });
  h += '<div class="sub">Pontuação: vitória 3 (goleiro 2), empate 1, gol 1, assistência 1, presença (2, atraso 1, falta −5), zagueiro com jogo sem sofrer gol, falta dura −2, agressão −5, bônus 5 para o time de linha que ganhou todos os jogos e para o goleiro que sofreu menos gols.</div></body></html>';
  return h;
}

function pdf_(req) {
  validate_(req);
  var props = PropertiesService.getScriptProperties();
  var folder = DriveApp.getFolderById(props.getProperty('PDF_FOLDER_ID') || CFG.PDF_FOLDER_ID);
  var name = pdfName_(req.date);
  var blob = Utilities.newBlob(pdfHtml_(req), 'text/html', 'sumula.html').getAs('application/pdf').setName(name);
  var it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);   // só substitui o PDF digital do mesmo dia; os PDFs escaneados têm outro nome
  var file = folder.createFile(blob);
  return { ok: true, name: name, url: file.getUrl(), folder: folder.getName() };
}

if (typeof module !== 'undefined') {
  module.exports = {
    norm_: norm_, spellingMap_: spellingMap_, buildAtletaRows_: buildAtletaRows_, buildJogoRows_: buildJogoRows_,
    FORM: FORM, f_: f_, validate_: validate_, pdfHtml_: pdfHtml_, pdfName_: pdfName_,
    emptyDoc_: emptyDoc_, stateView_: stateView_, stateTake_: stateTake_, statePut_: statePut_, stateBeat_: stateBeat_, stateRelease_: stateRelease_,
    handle_: handle_, append_: append_, _setGlobals: function (g) { Object.keys(g).forEach(function (k) { global[k] = g[k]; }); }
  };
}
