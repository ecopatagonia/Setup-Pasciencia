/**
 * Append this helper to the EXISTING spreadsheet API project.
 * In the existing doGet payload builder, add only:
 *   payload.comparativoGio = buildComparativoGio_(spreadsheet);
 * where `spreadsheet` is the same Spreadsheet object already used to read A:P.
 * Preserve sucesso, operacoes, meta, geradoEm and all existing fields/filters.
 * Redeploy the existing Web App to a new version, retaining its /exec URL.
 */
function buildComparativoGio_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('PARA_SITE');
  if (!sheet) throw new Error('Aba PARA_SITE não encontrada');
  if (sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 17, sheet.getLastRow() - 1, 9).getValues();
  var tz = spreadsheet.getSpreadsheetTimeZone();
  var stops = buildGiolvanStops_(spreadsheet);
  var numeric = function (value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
  };
  return values.filter(function (r) {
    return r[0] && r[1] instanceof Date && !isNaN(r[1].getTime()) &&
      (r[2] === 'COMPRA' || r[2] === 'VENDA');
  }).map(function (r) {
    var date = Utilities.formatDate(r[1], tz, 'yyyy-MM-dd');
    var stop = stops[String(r[0])];
    // Never attach another setup's stop or pair operations by sheet row position.
    var matches = stop && stop.date === date && stop.side === r[2] &&
      stop.original === numeric(r[3]) && stop.protected === numeric(r[5]);
    return {
      id: String(r[0]),
      date: Utilities.formatDate(r[1], tz, 'yyyy-MM-dd'),
      side: r[2],
      original: numeric(r[3]),
      protected: numeric(r[5]),
      improvement: numeric(r[6]),
      maximum: numeric(r[7]),
      tamanhoStop: matches ? stop.sl : null,
      candleEntrada: matches ? stop.entry : null
    };
  });
}

/** Read GIO's own stop on every API generation, including pending/zero results. */
function buildGiolvanStops_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('GIOLVAN');
  if (!sheet) throw new Error('Aba GIOLVAN não encontrada');
  if (sheet.getLastRow() < 2) return {};
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  var tz = spreadsheet.getSpreadsheetTimeZone(), days = {}, stops = {};
  var numeric = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
  values.forEach(function (r, index) {
    if (!(r[0] instanceof Date) || isNaN(r[0].getTime()) ||
      (r[1] !== 'COMPRA' && r[1] !== 'VENDA') || numeric(r[3]) === null) return;
    var date = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
    if (!days[date]) days[date] = [];
    days[date].push({date:date, side:r[1], entry:r[3], sl:numeric(r[4]),
      original:numeric(r[6]), protected:numeric(r[8]), row:index});
  });
  Object.keys(days).forEach(function (date) {
    var rows = days[date].sort(function (a,b) { return a.entry-b.entry || a.row-b.row; });
    // Ambiguous identities must not produce a plausible but incorrect filter.
    if (rows.length > 3 || rows.some(function (r,i) { return i && r.entry === rows[i-1].entry; })) return;
    rows.forEach(function (r,i) {
      var parts = date.split('-');
      stops['OP_'+parts[2]+'-'+parts[1]+'-'+parts[0]+'__'+(i+1)] = r;
    });
  });
  return stops;
}
