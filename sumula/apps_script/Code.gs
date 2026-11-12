/**
 * Súmula Aranha Marrom — receptor da planilha "Bola de Ouro Aranha Marrom 2026"
 *
 * INSTALAÇÃO (uma vez, uns 5 minutos). Faça primeiro na CÓPIA DE TESTE da planilha.
 * 1. Abra a planilha > Extensões > Apps Script. Apague o conteúdo e cole este arquivo.
 * 2. Quem pode anotar: o modo mais simples NÃO precisa de nenhuma propriedade. Na súmula, quem quer anotar toca em
 *    Assumir > "Pedir acesso"; o pedido cai na aba "Acessos" da planilha e o administrador marca a caixa "Liberado".
 *    (Opcional) Engrenagem (Configurações do projeto) > Propriedades do script > Adicionar:
 *      ACCESS_KEY         uma senha própria do administrador (ex.: aranha-2026-xyz)
 *    Quando for ligar o login com Google (fase 2), adicione também:
 *      GOOGLE_CLIENT_ID   ID do cliente OAuth (tipo "Aplicativo da Web")
 *      ALLOWED_EMAILS     e-mails de quem pode anotar, separados por vírgula
 *    Com GOOGLE_CLIENT_ID preenchido, a chave deixa de valer e só anota quem estiver na lista.
 * 2b. No editor, escolha a função "autorizar" no seletor ao lado de "Executar" e clique em Executar. Aceite as permissões
 *    (planilha, Drive, internet). Faça isso ANTES de implantar.
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
      return { ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName(), edit: edit, why: why, email: edit && who0 ? who0.email || who0.name || '' : '' };
    case 'access_request':      // público: qualquer pessoa pode PEDIR; quem libera é o administrador na planilha
      return accessRequest_(req);
    case 'access_status':
      return accessStatus_(req);
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
    sh.appendRow([new Date(), (who && (who.email || who.name)) || '(chave de acesso)', evento, detalhe || '']);
  } catch (e) {}
}

/* ---------- acesso ---------- */
/** Rode UMA vez no editor (menu "Executar") para o Google pedir todas as permissões de uma vez: planilha, Drive e internet. */
function autorizar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  DriveApp.getFolderById(CFG.PDF_FOLDER_ID).getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  accSheet_();
  Logger.log('Permissões ok para a planilha "' + ss.getName() + '". Agora implante uma nova versão do app da web.');
}

/* ---------- pedido de acesso (sem Google Cloud): a pessoa pede, o administrador libera marcando a caixa na aba "Acessos" ---------- */
var ACC_HEAD = ['Nome', 'Código', 'Pedido em', 'Liberado', 'Último uso'];
function accSheet_() { return ensureTab_(SpreadsheetApp.getActiveSpreadsheet(), 'Acessos', ACC_HEAD); }
function accFind_(code) {
  code = String(code || '').trim().toUpperCase(); if (!code) return null;
  var sh = accSheet_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).toUpperCase() === code) {
      var ok = v[i][3] === true || /^(sim|true|x|ok|1)$/i.test(String(v[i][3]).trim());
      return { sh: sh, row: i + 1, name: String(v[i][0]), ok: ok };
    }
  }
  return null;
}
function accessRequest_(req) {
  var name = String(req.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) fail_('BAD', 'Informe seu nome para pedir acesso.');
  var code = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  var sh = accSheet_();
  sh.appendRow([name, code, new Date(), false, '']);
  sh.getRange(sh.getLastRow(), 4).insertCheckboxes();
  return { ok: true, code: code, name: name };
}
function accessStatus_(req) {
  var a = accFind_(req.code);
  if (!a) return { ok: true, status: 'desconhecido' };
  return { ok: true, status: a.ok ? 'liberado' : 'pendente', name: a.name };
}

function auth_(req) {
  var p = PropertiesService.getScriptProperties();
  if (req.code) {
    var a = accFind_(req.code);
    if (!a) fail_('AUTH', 'Código de acesso desconhecido. Peça o acesso de novo.');
    if (!a.ok) fail_('AUTH', 'Seu acesso ainda não foi liberado pelo administrador.');
    a.sh.getRange(a.row, 5).setValue(new Date());
    return { email: '', name: a.name };
  }
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
    if (who && who.name) req.name = who.name;
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

function fmt_(d) { return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
// Data da planilha como número de série (dias desde 30/12/1899). Evita conversões de fuso entre o script e a planilha.
function serial_(iso) { var p = String(iso).split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000); }

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
    var dateObj = serial_(req.date);   // número de dias (sem fuso): evita a data cair um dia antes

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
    sa.getRange(startA, 1, 1, 2).setNumberFormat('dd/MM/yyyy');

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
    if (rowsL.length) { var rl = sl.getRange(sl.getLastRow() + 1, 1, rowsL.length, 8); rl.setValues(rowsL); sl.getRange(rl.getRow(), 1, rowsL.length, 1).setNumberFormat('dd/MM/yyyy'); }
    var rowsG = (req.goleiros || []).map(function (g) { return [dateObj, g.n, g.timeA, sp(g.gkA), g.timeB, sp(g.gkB)]; });
    if (rowsG.length) { var rg = sg.getRange(sg.getLastRow() + 1, 1, rowsG.length, 6); rg.setValues(rowsG); sg.getRange(rg.getRow(), 1, rowsG.length, 1).setNumberFormat('dd/MM/yyyy'); }
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

var PDF_LOGO_URL = 'https://filubke.github.io/Aranha_Marrom/sumula/logo.jpg';

function pdfLogo_() {
  try {
    var r = UrlFetchApp.fetch(PDF_LOGO_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return '';
    return 'data:image/jpeg;base64,' + Utilities.base64Encode(r.getContent());
  } catch (e) { return ''; }
}

function pdfHtml_(req, logo) {
  var p = String(req.date).split('-'), dia = p[2] + '/' + p[1] + '/' + p[0];
  var MARROM = '#4a2113', MARROM2 = '#6b2f16', OURO = '#c9954a', CREME = '#f7f1e7', LINHA = '#d9c9b0';
  var cor = function (t) { return PDF_COR[t] || ['#dddddd', '#222222']; };
  var chip = function (t) { var c = cor(t); return '<span style="background:' + c[0] + ';color:' + c[1] + ';padding:2px 8px;border:1px solid #8a7560"><b>' + esc_(t) + '</b></span>'; };
  var h = '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#2a1a10}' +
    'h2{font-family:Georgia,serif;font-size:13pt;color:' + MARROM2 + ';margin:16px 0 6px;padding-bottom:3px;border-bottom:2px solid ' + OURO + '}' +
    'table{border-collapse:collapse;width:100%;margin-bottom:8px}' +
    'th{background:' + MARROM2 + ';color:#ffffff;border:1px solid ' + MARROM2 + ';padding:4px 5px;font-size:9pt;text-align:center}' +
    'td{border:1px solid ' + LINHA + ';padding:4px 5px;font-size:9.5pt;text-align:center}' +
    'td.l,th.l{text-align:left}.z{background:' + CREME + '}.sub{color:#7a6652;font-size:8.5pt}.ev{font-size:9pt;margin:1px 0}' +
    '</style></head><body>';
  // faixa de título
  h += '<table style="margin-bottom:6px"><tr><td style="background:' + MARROM + ';border:1px solid ' + MARROM + ';padding:10px 12px;text-align:left;width:64px">' +
    (logo ? '<img src="' + logo + '" width="56" height="56">' : '') + '</td>' +
    '<td style="background:' + MARROM + ';border:1px solid ' + MARROM + ';padding:10px 6px;text-align:left"><div style="font-family:Georgia,serif;font-size:21pt;color:#fbf3e6"><b>Súmula Aranha Marrom</b></div>' +
    '<div style="font-size:10.5pt;color:' + '#e0b366' + '">' + ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()] + ' · ' + dia + '</div></td></tr>' +
    '<tr><td colspan="2" style="background:' + OURO + ';border:1px solid ' + OURO + ';padding:0;font-size:3pt">&nbsp;</td></tr></table>';
  // tabela do dia
  h += '<h2>Resultado do dia</h2><table><tr><th class="l">#</th><th class="l">Time</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr>';
  pdfTabela_(req.jogos).forEach(function (r, i) {
    h += '<tr' + (i % 2 ? ' class="z"' : '') + '><td class="l"><b>' + (i + 1) + 'º</b></td><td class="l">' + chip(r.t) + '</td><td>' + r.j + '</td><td>' + r.v + '</td><td>' + r.e + '</td><td>' + r.d + '</td><td>' + r.gp + '</td><td>' + r.gc + '</td><td>' + (r.gp - r.gc) + '</td><td style="background:' + CREME + '"><b>' + r.pts + '</b></td></tr>';
  });
  h += '</table>';
  // jogos
  var gks = {}; (req.goleiros || []).forEach(function (g) { gks[g.n] = g; });
  h += '<h2>Jogos</h2>';
  req.jogos.forEach(function (j) {
    var g = gks[j.n] || {}, L = [], R = [];
    (req.lances || []).filter(function (l) { return l.jogo === j.n; }).forEach(function (l) {
      var left = l.time === j.timeA, s, ic = (l.tipo === 'Agressão') ? '🟥' : '🟨';
      if ((l.tipo || 'Gol') === 'Gol') s = '<div class="ev">⚽ <b>' + (l.autor ? esc_(l.autor) : 'gol contra') + '</b>' + (l.assist ? ' <span class="sub">ass. ' + esc_(l.assist) + '</span>' : '') + '</div>';
      else s = '<div class="ev" style="color:' + (l.tipo === 'Agressão' ? '#b71c1c' : '#8a5a00') + '">' + ic + ' <b>' + esc_(l.autor) + '</b> <span class="sub">' + esc_(l.tipo.toLowerCase()) + '</span></div>';
      (left ? L : R).push(s);
    });
    var ca = cor(j.timeA), cb = cor(j.timeB);
    h += '<table style="margin-bottom:10px;page-break-inside:avoid"><tr>' +
      '<td style="width:42%;background:' + ca[0] + ';color:' + ca[1] + ';text-align:left;font-size:11pt"><b>' + esc_(j.timeA) + '</b></td>' +
      '<td style="width:16%;background:' + MARROM + ';color:#e0b366;font-family:Georgia,serif;font-size:15pt;border-color:' + MARROM + '"><b>' + num_(j.golsA) + ' × ' + num_(j.golsB) + '</b></td>' +
      '<td style="width:42%;background:' + cb[0] + ';color:' + cb[1] + ';text-align:right;font-size:11pt"><b>' + esc_(j.timeB) + '</b></td></tr>' +
      '<tr><td class="l" style="vertical-align:top">' + (L.join('') || '<span class="sub">—</span>') + '</td><td class="sub" style="background:' + CREME + '">Jogo ' + j.n + '</td><td style="text-align:right;vertical-align:top">' + (R.join('') || '<span class="sub">—</span>') + '</td></tr>' +
      ((g.gkA || g.gkB) ? '<tr><td class="l sub" style="background:' + CREME + '">🧤 ' + esc_(g.gkA || '—') + '</td><td style="background:' + CREME + '"></td><td class="sub" style="text-align:right;background:' + CREME + '">' + esc_(g.gkB || '—') + ' 🧤</td></tr>' : '') + '</table>';
  });
  // atletas
  h += '<h2>Pontuação dos atletas</h2>';
  var grupos = [], gi = {};
  req.atletas.forEach(function (a) { var k = a.ausente ? 'Faltou' : a.time; if (!(k in gi)) { gi[k] = grupos.length; grupos.push({ t: k, r: [] }); } grupos[gi[k]].r.push(a); });
  grupos.forEach(function (G) {
    var c = cor(G.t), isT = !!PDF_COR[G.t];
    h += '<table style="page-break-inside:avoid"><tr><td class="l" colspan="10" style="background:' + (isT ? c[0] : MARROM) + ';color:' + (isT ? c[1] : '#ffffff') + ';font-size:10.5pt"><b>' + esc_(G.t) + '</b></td></tr>' +
      '<tr><th class="l">Atleta</th><th>Pos</th><th>Gols</th><th>Ass.</th><th>Vit.</th><th>Emp.</th><th>Falta</th><th>Agr.</th><th>Bônus</th><th>Total</th></tr>';
    G.r.forEach(function (a, i) {
      var ps = a.pos === 'ZC' ? 'Zag' : (a.pos || ''), z = i % 2 ? ' class="z"' : '', au = a.ausente;
      h += '<tr' + z + '><td class="l">' + esc_(a.nome) + (au ? ' <span class="sub">(faltou)</span>' : '') + '</td><td>' + esc_(ps) + '</td><td>' + (au ? '' : num_(a.gols)) + '</td><td>' + (au ? '' : num_(a.ass)) + '</td><td>' + (au ? '' : num_(a.vit)) + '</td><td>' + (au ? '' : num_(a.emp)) + '</td><td>' + (a.falta ? a.falta : '') + '</td><td>' + (a.agr ? a.agr : '') + '</td><td>' + (a.bonus ? '★' : '') + '</td><td style="background:' + CREME + '"><b>' + (a.total != null ? a.total : '') + '</b></td></tr>';
    });
    h += '</table>';
  });
  h += '<div class="sub" style="margin-top:8px;border-top:1px solid ' + LINHA + ';padding-top:4px">Pontuação: vitória 3 (goleiro 2), empate 1, gol 1, assistência 1, presença 2 (atraso 1, falta −5), zagueiro com jogo sem sofrer gol 1, falta dura −2, agressão −5, bônus 5 (★) para o time de linha que ganhou todos os jogos e para o goleiro que sofreu menos gols.</div>' +
    '<div class="sub" style="text-align:center;margin-top:6px">Aranha Marrom · súmula digital</div></body></html>';
  return h;
}

function pdf_(req) {
  validate_(req);
  var props = PropertiesService.getScriptProperties();
  var folder = DriveApp.getFolderById(props.getProperty('PDF_FOLDER_ID') || CFG.PDF_FOLDER_ID);
  var name = pdfName_(req.date);
  var blob = Utilities.newBlob(pdfHtml_(req, pdfLogo_()), 'text/html', 'sumula.html').getAs('application/pdf').setName(name);
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
