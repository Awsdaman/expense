// Sheet-backed store for handleRequest. Columns are found by header name in row 1.
// Callers hold the script lock for writes (see respond_ in Code.js).

function createSheetStore(ss) {
  var headerCache = {};

  function sheetOf_(tab) {
    var sheet = ss.getSheetByName(tab);
    if (!sheet) throw new Error('missing tab ' + tab);
    return sheet;
  }

  function headersOf_(sheet, tab) {
    if (!headerCache[tab]) {
      var width = sheet.getLastColumn();
      headerCache[tab] = width ? sheet.getRange(1, 1, 1, width).getValues()[0].map(String) : [];
    }
    return headerCache[tab];
  }

  return {
    rows: function (tab) {
      var sheet = sheetOf_(tab);
      var headers = headersOf_(sheet, tab);
      var last = sheet.getLastRow();
      if (last < 2 || !headers.length) return [];
      return sheet.getRange(2, 1, last - 1, headers.length).getValues().map(function (row) {
        var obj = {};
        headers.forEach(function (h, i) {
          if (!h) return;
          if (h === 'cycle') obj[h] = cycleValue_(row[i], ss);
          else if (h === 'value') obj[h] = settingValue_(row[i], ss);
          else obj[h] = cellValue_(row[i]);
        });
        return obj;
      });
    },

    append: function (tab, obj) {
      var sheet = sheetOf_(tab);
      var headers = headersOf_(sheet, tab);
      sheet.appendRow(headers.map(function (h) {
        return toCell_(obj[h]);
      }));
    },

    update: function (tab, match, fields) {
      var sheet = sheetOf_(tab);
      var headers = headersOf_(sheet, tab);
      var last = sheet.getLastRow();
      if (last < 2 || !headers.length) return 0;
      var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
      var count = 0;
      values.forEach(function (row, r) {
        var matches = Object.keys(match).every(function (k) {
          var i = headers.indexOf(k);
          return i >= 0 && String(cellValue_(row[i])) === String(match[k]);
        });
        if (!matches) return;
        Object.keys(fields).forEach(function (k) {
          var i = headers.indexOf(k);
          if (i >= 0) row[i] = toCell_(fields[k]);
        });
        sheet.getRange(r + 2, 1, 1, headers.length).setValues([row]);
        count++;
      });
      return count;
    },
  };
}

// Sheet value to store value: Dates back to the ISO form in Asia/Riyadh, blanks to ''.
function cellValue_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Riyadh', "yyyy-MM-dd'T'HH:mm:ssXXX");
  return v;
}

// Sheets can turn the text "2026-10" into a date. Its own time zone gives back the month it parsed.
function cycleValue_(v, ss) {
  return v instanceof Date ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM') : cellValue_(v);
}

// A Settings value such as "2026-11-16" can come back as a date. Read it as a plain date in the Sheet's zone.
function settingValue_(v, ss) {
  return v instanceof Date ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : cellValue_(v);
}

function toCell_(v) {
  return v === null || v === undefined ? '' : v;
}
