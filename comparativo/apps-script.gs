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
  var numeric = function (value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
  };
  return values.filter(function (r) {
    return r[0] && r[1] instanceof Date && !isNaN(r[1].getTime()) &&
      (r[2] === 'COMPRA' || r[2] === 'VENDA');
  }).map(function (r) {
    return {
      id: String(r[0]),
      date: Utilities.formatDate(r[1], tz, 'yyyy-MM-dd'),
      side: r[2],
      original: numeric(r[3]),
      protected: numeric(r[5]),
      improvement: numeric(r[6]),
      maximum: numeric(r[7])
    };
  });
}
