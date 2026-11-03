// Time-driven handlers. Schedules are set by installTriggers() in sheet/Setup.js.

// Daily 08:00. Sends the monthly report on the cycle start day only.
function dailyReportTrigger() {
  var snap = loadSnapshot_();
  var startDay = snap.settings.cycle_start_day;
  var today = riyadhDate(snap.nowIso).split('-');
  if (riyadhDate(snap.nowIso) !== cycleStartDate(Number(today[0]), Number(today[1]), startDay)) return;

  var current = cycleLabel(snap.nowIso, startDay);
  var report = monthlyReport(
    summaryFor_(snap, shiftCycle(current, -1)),
    summaryFor_(snap, shiftCycle(current, -2))
  );
  MailApp.sendEmail(ownerEmail_(), report.subject, report.text);
}

// Thursday 20:00.
function weeklyNudgeTrigger() {
  var snap = loadSnapshot_();
  var nudge = weeklyNudge(summaryFor_(snap, cycleLabel(snap.nowIso, snap.settings.cycle_start_day)));
  MailApp.sendEmail(ownerEmail_(), nudge.subject, nudge.text);
}

// Daily 22:00. Warns when the SMS capture looks broken.
function healthCheckTrigger() {
  var snap = loadSnapshot_();
  var warning = healthWarning(snap.transactions, snap.nowIso);
  if (warning) MailApp.sendEmail(ownerEmail_(), 'Iqtifaa: SMS capture may be broken', warning);
}

// Friday 03:00. Copies the spreadsheet into the Backups folder and keeps the newest 8 copies.
function backupTrigger() {
  var folder = backupFolder_();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd');
  DriveApp.getFileById(getSpreadsheet_().getId()).makeCopy('Iqtifaa backup ' + stamp, folder);

  var copies = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().indexOf('Iqtifaa backup ') === 0) copies.push(file);
  }
  copies.sort(function (a, b) {
    return b.getDateCreated() - a.getDateCreated();
  });
  copies.slice(8).forEach(function (file) {
    file.setTrashed(true);
  });
}

function loadSnapshot_() {
  var store = createSheetStore(getSpreadsheet_());
  return {
    nowIso: buildEnv_().nowIso(),
    settings: readSettings(store.rows('Settings')),
    transactions: store.rows('Transactions'),
    categories: store.rows('Categories'),
    rules: store.rows('MerchantRules'),
    parseErrors: store.rows('ParseErrors'),
  };
}

function summaryFor_(snap, cycle) {
  return computeSummary({
    transactions: snap.transactions,
    categories: snap.categories,
    rules: snap.rules,
    settings: snap.settings,
    cycle: cycle,
    nowIso: snap.nowIso,
    parseErrors: snap.parseErrors,
  });
}

function ownerEmail_() {
  return Session.getEffectiveUser().getEmail();
}

function backupFolder_() {
  var folders = DriveApp.getFoldersByName('Backups');
  return folders.hasNext() ? folders.next() : DriveApp.createFolder('Backups');
}
