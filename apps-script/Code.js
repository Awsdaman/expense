// Web App entry points. Thin adapter: rate limit, lock, env, JSON output.
// Business logic lives in handleRequest (lib/Lib.js).

function doGet(e) {
  return respond_((e && e.parameter) || {});
}

function doPost(e) {
  var raw = e && e.postData ? e.postData.contents : '';
  var params;
  try {
    params = JSON.parse(raw || '{}');
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'bad_request' });
  }
  return respond_(params);
}

function respond_(params) {
  if (isRateLimited_()) return jsonOutput_({ ok: false, error: 'rate_limited' });
  if (!params || typeof params !== 'object') return jsonOutput_({ ok: false, error: 'bad_request' });

  var lock = LockService.getScriptLock();
  var locked = false;
  var res;
  try {
    lock.waitLock(20000);
    locked = true;
    res = handleRequest(params, createSheetStore(getSpreadsheet_()), buildEnv_());
  } catch (err) {
    // Log the action name and the error message only, never the params.
    console.error('action=' + params.action + ' error=' + err.message);
    res = { ok: false, error: 'server_error' };
  } finally {
    if (locked) lock.releaseLock();
  }
  return jsonOutput_(res);
}

// More than 60 requests in the same minute is rejected.
function isRateLimited_() {
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyyMMddHHmm');
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 120);
  return count > 60;
}

function buildEnv_() {
  return {
    token: PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '',
    nowIso: function () {
      return Utilities.formatDate(new Date(), 'Asia/Riyadh', "yyyy-MM-dd'T'HH:mm:ssXXX");
    },
    random: Math.random,
  };
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
