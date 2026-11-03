// One-time setup, run by hand from the Apps Script editor.

var NUMERIC_COLUMNS_ = ['amount', 'amount_sar', 'monthly_budget', 'hits', 'sort'];
var BOOLEAN_COLUMNS_ = ['active', 'auto'];

// Creates missing tabs with headers, formats text columns as '@', freezes row 1
// and seeds Categories and Settings when they are empty. Existing data is kept.
function setupSheet() {
  var ss = getSpreadsheet_();
  Object.keys(TAB_HEADERS).forEach(function (tab) {
    var headers = TAB_HEADERS[tab];
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);
    var isNew = sheet.getLastRow() === 0;
    if (isNew) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);

    var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    actual.forEach(function (h, i) {
      if (!h || NUMERIC_COLUMNS_.indexOf(h) >= 0 || BOOLEAN_COLUMNS_.indexOf(h) >= 0) return;
      sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    });

    if (tab === 'Categories' && sheet.getLastRow() === 1) {
      seedRows_(sheet, actual, STARTER_CATEGORIES);
    }
    if (tab === 'Settings' && sheet.getLastRow() === 1) {
      seedRows_(sheet, actual, Object.keys(DEFAULT_SETTINGS).map(function (k) {
        return { key: k, value: DEFAULT_SETTINGS[k] };
      }));
    }
  });
}

// Writes the objects below the header row, one column per header name.
function seedRows_(sheet, headers, objects) {
  if (!objects.length) return;
  var values = objects.map(function (o) {
    return headers.map(function (h) {
      return toCell_(o[h]);
    });
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

// Stores a new 48-character token in Script Properties and logs it once.
// Running this again replaces the token: update the Shortcut and the dashboard.
function createApiToken() {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 48);
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('API token (copy it now, it is shown only here): ' + token);
}

// Replaces this project's trigger handlers with the four schedules from Plan.md section 8.
function installTriggers() {
  var handlers = ['dailyReportTrigger', 'weeklyNudgeTrigger', 'healthCheckTrigger', 'backupTrigger'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReportTrigger').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('weeklyNudgeTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(20).create();
  ScriptApp.newTrigger('healthCheckTrigger').timeBased().everyDays(1).atHour(22).create();
  ScriptApp.newTrigger('backupTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(3).create();
}
