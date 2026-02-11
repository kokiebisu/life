/**
 * Google Apps Script - Calendar API
 *
 * セットアップ手順:
 *   1. https://script.google.com にアクセス
 *   2. 「新しいプロジェクト」を作成
 *   3. このファイルの内容を全てコピーして貼り付け
 *   4. 「デプロイ」→「新しいデプロイ」
 *   5. 種類: 「ウェブアプリ」
 *   6. 実行ユーザー: 「自分」
 *   7. アクセス: 「自分のみ」
 *   8. デプロイしてURLをコピー
 *   9. .env.local に GCAL_APPS_SCRIPT_URL=<コピーしたURL> を追加
 *  10. .env.local に GCAL_SECRET=<任意のパスワード> を追加
 *  11. Apps Script のスクリプトプロパティにも同じ SECRET を設定:
 *      「プロジェクトの設定」→「スクリプト プロパティ」→ キー: SECRET, 値: <同じパスワード>
 */

// ============================================================
// ここから下を Google Apps Script のエディタに貼り付け
// ============================================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (!secret || e.parameter.secret !== secret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  var action = e.parameter.action;

  try {
    if (action === "list") {
      return listEvents(e.parameter);
    } else if (action === "add") {
      var body = e.postData ? JSON.parse(e.postData.contents) : {};
      return addEvent(body);
    } else if (action === "calendars") {
      return listCalendars();
    } else {
      return jsonResponse({ error: "Unknown action. Use: list, add, calendars" }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function listEvents(params) {
  var calendarId = params.calendarId || "primary";
  var days = parseInt(params.days || "1", 10);
  var date = params.date;

  var timeMin, timeMax;

  if (date) {
    timeMin = new Date(date + "T00:00:00");
    timeMax = new Date(date + "T23:59:59");
  } else {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    timeMin = today;
    timeMax = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  }

  var calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) {
    calendar = CalendarApp.getDefaultCalendar();
  }

  var events = calendar.getEvents(timeMin, timeMax);

  var result = events.map(function (ev) {
    return {
      id: ev.getId(),
      title: ev.getTitle(),
      start: ev.getStartTime().toISOString(),
      end: ev.getEndTime().toISOString(),
      allDay: ev.isAllDayEvent(),
      location: ev.getLocation(),
      description: ev.getDescription(),
    };
  });

  return jsonResponse({ events: result, count: result.length });
}

function addEvent(body) {
  var calendar = CalendarApp.getDefaultCalendar();

  if (body.allDay) {
    var event = calendar.createAllDayEvent(body.title, new Date(body.date));
    if (body.description) event.setDescription(body.description);
    if (body.location) event.setLocation(body.location);

    return jsonResponse({
      id: event.getId(),
      title: event.getTitle(),
      message: "All-day event created",
    });
  } else {
    var start = new Date(body.start);
    var end = new Date(body.end);
    var event = calendar.createEvent(body.title, start, end);
    if (body.description) event.setDescription(body.description);
    if (body.location) event.setLocation(body.location);

    return jsonResponse({
      id: event.getId(),
      title: event.getTitle(),
      start: start.toISOString(),
      end: end.toISOString(),
      message: "Event created",
    });
  }
}

function listCalendars() {
  var calendars = CalendarApp.getAllCalendars();
  var result = calendars.map(function (cal) {
    return {
      id: cal.getId(),
      name: cal.getName(),
    };
  });
  return jsonResponse({ calendars: result });
}

function jsonResponse(data, code) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
