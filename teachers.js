"use strict";
const endpoint = "https://script.google.com/macros/s/AKfycby1VQPaW7_Z_X4fg0lSHoqDmr3C4XKFuCPGr1gUnl1elkFL0OZX9jpgGHeNGx1EEmQjcw/exec?site=classes";
const $ = selector => document.querySelector(selector);
const subjects = {economy:"經濟學", Digital:"數位科技概論", Accounting:"會計學", Business:"商業概論", testmath:"數學"};
const errors = {bad:"請檢查欄位格式。",exists:"這個電子郵件已有申請。",auth:"找不到帳號，或登入金鑰不正確。",pending:"你的申請正在等待管理者核准。",disabled:"教師帳號目前未開放。",forbidden:"這個班級不在你的管理範圍。",code:"班級代碼無效或已停用。",pin:"刷題密碼不正確。",locked:"密碼錯誤次數過多，請稍後再試。",busy:"目前使用人數較多，請稍後再試。"};
let credentials = null, room = null, teacherEpoch = 0, reportEpoch = 0;

async function request(a, fields) {
  const response = await fetch(endpoint, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({...fields,a})});
  const result = await response.json();
  if (!result.ok) throw new Error(errors[result.err] || "服務暫時無法使用，請稍後再試。");
  return result;
}
function notice(message) { $("#notice").textContent = message; }
function view(id) {
  for (const name of ["login","apply","join","dashboard"]) $("#" + name).hidden = name !== id;
  if (id !== "dashboard") {
    credentials = room = null;
    teacherEpoch++;
    reportEpoch++;
    $("#report").hidden = true;
    $("tbody").replaceChildren();
  }
  if (id !== "apply") $("#issued").replaceChildren();
  notice(backendAvailable ? "" : "教師後台尚未啟用。");
}
function bind(selector, action) {
  $(selector).addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const controls = [...form.querySelectorAll("button[type=submit]")];
    if (controls.some(button => button.disabled)) return;
    const fields = Object.fromEntries(new FormData(form));
    controls.forEach(button => button.disabled = true);
    notice("處理中…");
    try { await action(fields, event.submitter, form); }
    catch (error) { notice(error instanceof TypeError ? "連線失敗，請稍後再試。" : error.message); }
    finally { controls.forEach(button => button.disabled = false); }
  });
}
for (const button of document.querySelectorAll("[data-view]")) button.onclick = () => view(button.dataset.view);
$("#logout").onclick = () => view("login");


bind("#apply form", async (fields, _, form) => {
  const result = await request("apply", fields);
  if ($("#apply").hidden) return;
  form.reset();
  notice("申請已送出。請妥善保留登入金鑰，離開此頁後無法再查看。");
  const label = document.createElement("p");
  label.textContent = "申請核對碼 " + result.verification;
  const key = document.createElement("input");
  key.readOnly = true;
  key.value = result.key;
  key.setAttribute("aria-label", "教師登入金鑰");
  $("#issued").replaceChildren(label, key);
});
bind("#join form", async (fields, button, form) => {
  const action = button?.value === "leave" ? "leave" : "join";
  const result = await request(action, fields);
  form.elements.pin.value = "";
  notice((action === "join" ? "已加入「" : "已退出「") + result.title + "」。");
});
bind("#login form", async (fields, _, form) => {
  const epoch = teacherEpoch;
  const result = await request("list", fields);
  if (epoch !== teacherEpoch) return;
  credentials = fields;
  form.reset();
  view("dashboard");
  $("#welcome").textContent = result.name + "老師的班級";
  $("#classes").replaceChildren();
  result.classes.forEach(addRoom);
  if (!result.classes.length) notice("請先建立班級，再將班級代碼提供給學生。");
});
bind("#create", async (fields, _, form) => {
  const epoch = teacherEpoch;
  const result = await request("create", {...credentials,...fields});
  if (epoch !== teacherEpoch || !credentials) return;
  form.reset();
  addRoom(result.room);
  await report(result.room);
});
function addRoom(value) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = value.title;
  button.onclick = () => report(value).catch(error => notice(error.message));
  $("#classes").append(button);
}
const date = value => value ? new Intl.DateTimeFormat("zh-TW", {dateStyle:"short", timeStyle:"short", timeZone:"Asia/Taipei"}).format(new Date(value)) : "—";
async function report(value) {
  const epoch = ++reportEpoch;
  notice("載入班級紀錄…");
  const result = await request("report", {...credentials,id:value.id});
  if (epoch !== reportEpoch || !credentials) return;
  room = value;
  $("#report").hidden = false;
  $("#room-title").textContent = value.title;
  $("#room-code").textContent = "班級加入代碼 " + value.code;
  $("#empty").textContent = result.students.length ? "" : "還沒有學生加入。";
  $("tbody").replaceChildren();
  for (const item of result.students) {
    const row = document.createElement("tr");
    const fields = [subjects[item.site] || item.site,item.name,date(item.login),date(item.attempt),item.count,item.rate == null ? null : Math.round(item.rate * 100) + "%",item.wrong,item.mastered];
    for (const field of fields) row.insertCell().textContent = field ?? "—";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "移出班級";
    button.onclick = async () => {
      if (!confirm("確定移出「" + item.name + "」的這科紀錄？")) return;
      button.disabled = true;
      try {
        await request("remove", {...credentials,id:value.id,site:item.site,name:item.name});
        if (room === value && credentials) await report(value);
      } catch (error) { notice(error.message); button.disabled = false; }
    };
    row.insertCell().append(button);
    $("tbody").append(row);
  }
  notice("");
}
$("#refresh").onclick = () => { if (room) report(room).catch(error => notice(error.message)); };


// The page remains reviewable while the administrator activates the backend.
let backendAvailable = false;
const formButtons = [...document.querySelectorAll("form button[type=submit]")];
formButtons.forEach(button => button.disabled = true);
if (location.hash === "#join" || location.hash === "#apply") view(location.hash.slice(1));
fetch(endpoint).then(response => response.json()).then(state => {
  if (!state.ok || state.service !== "quiz-classes-v1") throw new Error("inactive");
  backendAvailable = true;
  formButtons.forEach(button => button.disabled = false);
  if ($("#notice").textContent === "教師後台尚未啟用。") notice("");
}).catch(() => {
  notice("教師後台尚未啟用，開放後即可送出申請或加入班級。");
});
