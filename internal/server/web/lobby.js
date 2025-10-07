"use strict";
(() => {
  // web/src/lobby.ts
  var STORAGE_KEY = "lsd:callsign";
  var saveStatusTimer = null;
  var pendingRoomId = null;
  var callSignInput = document.querySelector("#call-sign-input");
  var saveStatus = document.getElementById("save-status");
  var copyRoomButton = document.getElementById("copy-room-url");
  var roomUrlInput = document.querySelector("#room-url");
  var roomShare = document.getElementById("room-share");
  var enterRoomButton = document.getElementById("enter-room");
  var joinRoomInput = document.querySelector("#join-room-input");
  var campaignButton = document.getElementById("campaign-button");
  var tutorialButton = document.getElementById("tutorial-button");
  var freeplayButton = document.getElementById("freeplay-button");
  bootstrap();
  function bootstrap() {
    var _a, _b, _c;
    const initialName = resolveInitialCallSign();
    if (callSignInput) {
      callSignInput.value = initialName;
    }
    (_a = document.getElementById("call-sign-form")) == null ? void 0 : _a.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = ensureCallSign();
      if (name) {
        showSaveStatus("Saved call sign");
      } else {
        showSaveStatus("Cleared call sign");
      }
    });
    (_b = document.getElementById("new-room-form")) == null ? void 0 : _b.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = ensureCallSign();
      const roomId = generateRoomId();
      pendingRoomId = roomId;
      const url = buildRoomUrl(roomId, name);
      if (roomUrlInput) {
        roomUrlInput.value = url;
      }
      roomShare == null ? void 0 : roomShare.classList.add("visible");
    });
    copyRoomButton == null ? void 0 : copyRoomButton.addEventListener("click", async () => {
      const url = roomUrlInput == null ? void 0 : roomUrlInput.value.trim();
      if (!url) {
        return;
      }
      const originalLabel = copyRoomButton.textContent;
      try {
        await navigator.clipboard.writeText(url);
        copyRoomButton.textContent = "Copied";
      } catch (e) {
        roomUrlInput == null ? void 0 : roomUrlInput.select();
        document.execCommand("copy");
        copyRoomButton.textContent = "Copied";
      }
      window.setTimeout(() => {
        copyRoomButton.textContent = originalLabel != null ? originalLabel : "Copy Link";
      }, 1500);
    });
    enterRoomButton == null ? void 0 : enterRoomButton.addEventListener("click", () => {
      const roomId = pendingRoomId;
      if (!roomId) {
        joinRoomInput == null ? void 0 : joinRoomInput.focus();
        return;
      }
      const url = buildRoomUrl(roomId, ensureCallSign());
      window.location.href = url;
    });
    (_c = document.getElementById("join-room-form")) == null ? void 0 : _c.addEventListener("submit", (event) => {
      var _a2;
      event.preventDefault();
      const raw = (_a2 = joinRoomInput == null ? void 0 : joinRoomInput.value) != null ? _a2 : "";
      const extracted = extractRoomId(raw);
      if (!extracted) {
        joinRoomInput == null ? void 0 : joinRoomInput.focus();
        return;
      }
      const url = buildRoomUrl(extracted, ensureCallSign());
      window.location.href = url;
    });
    campaignButton == null ? void 0 : campaignButton.addEventListener("click", () => {
      const name = ensureCallSign();
      const roomId = generateRoomId("campaign");
      const url = buildRoomUrl(roomId, name, "campaign");
      window.location.href = url;
    });
    tutorialButton == null ? void 0 : tutorialButton.addEventListener("click", () => {
      const name = ensureCallSign();
      const roomId = generateRoomId("tutorial");
      const url = buildRoomUrl(roomId, name, "tutorial");
      window.location.href = url;
    });
    freeplayButton == null ? void 0 : freeplayButton.addEventListener("click", () => {
      const name = ensureCallSign();
      const roomId = generateRoomId("freeplay");
      const url = buildRoomUrl(roomId, name, "freeplay");
      window.location.href = url;
    });
  }
  function ensureCallSign() {
    const inputName = callSignInput ? callSignInput.value : "";
    const sanitized = sanitizeCallSign(inputName);
    if (callSignInput) {
      callSignInput.value = sanitized;
    }
    persistCallSign(sanitized);
    return sanitized;
  }
  function resolveInitialCallSign() {
    const fromQuery = sanitizeCallSign(new URLSearchParams(window.location.search).get("name"));
    const stored = sanitizeCallSign(readStoredCallSign());
    if (fromQuery) {
      if (fromQuery !== stored) {
        persistCallSign(fromQuery);
      }
      return fromQuery;
    }
    return stored;
  }
  function sanitizeCallSign(value) {
    if (!value) {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    return trimmed.slice(0, 24);
  }
  function persistCallSign(name) {
    try {
      if (name) {
        window.localStorage.setItem(STORAGE_KEY, name);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
    }
  }
  function readStoredCallSign() {
    var _a;
    try {
      return (_a = window.localStorage.getItem(STORAGE_KEY)) != null ? _a : "";
    } catch (e) {
      return "";
    }
  }
  function buildRoomUrl(roomId, callSign, mode) {
    let url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    if (mode) {
      url += `&mode=${encodeURIComponent(mode)}`;
    }
    if (callSign) {
      url += `&name=${encodeURIComponent(callSign)}`;
    }
    return url;
  }
  function generateRoomId(prefix) {
    let slug = "";
    while (slug.length < 6) {
      slug = Math.random().toString(36).slice(2, 8);
    }
    if (prefix) {
      return `${prefix}-${slug}`;
    }
    return `r-${slug}`;
  }
  function extractRoomId(raw) {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    try {
      const maybeUrl = new URL(value);
      const param = maybeUrl.searchParams.get("room");
      if (param) {
        return param.trim();
      }
    } catch (e) {
    }
    const qsIndex = value.indexOf("room=");
    if (qsIndex !== -1) {
      const substring = value.slice(qsIndex + 5);
      const ampIndex = substring.indexOf("&");
      const id = ampIndex === -1 ? substring : substring.slice(0, ampIndex);
      if (id) {
        return id.trim();
      }
    }
    if (/^[a-zA-Z0-9_-]+$/.test(value)) {
      return value;
    }
    return null;
  }
  function showSaveStatus(message) {
    if (!saveStatus) {
      return;
    }
    saveStatus.textContent = message;
    if (saveStatusTimer !== null) {
      window.clearTimeout(saveStatusTimer);
    }
    saveStatusTimer = window.setTimeout(() => {
      if (saveStatus) {
        saveStatus.textContent = "";
      }
      saveStatusTimer = null;
    }, 2e3);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbnR5cGUgTWF5YmU8VD4gPSBUIHwgbnVsbCB8IHVuZGVmaW5lZDtcblxubGV0IHNhdmVTdGF0dXNUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgcGVuZGluZ1Jvb21JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGNhbGxTaWduSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI2NhbGwtc2lnbi1pbnB1dFwiKTtcbmNvbnN0IHNhdmVTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmUtc3RhdHVzXCIpO1xuY29uc3QgY29weVJvb21CdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktcm9vbS11cmxcIik7XG5jb25zdCByb29tVXJsSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI3Jvb20tdXJsXCIpO1xuY29uc3Qgcm9vbVNoYXJlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb29tLXNoYXJlXCIpO1xuY29uc3QgZW50ZXJSb29tQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJlbnRlci1yb29tXCIpO1xuY29uc3Qgam9pblJvb21JbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXCIjam9pbi1yb29tLWlucHV0XCIpO1xuY29uc3QgY2FtcGFpZ25CdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbXBhaWduLWJ1dHRvblwiKTtcbmNvbnN0IHR1dG9yaWFsQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0dXRvcmlhbC1idXR0b25cIik7XG5jb25zdCBmcmVlcGxheUJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJlZXBsYXktYnV0dG9uXCIpO1xuXG5ib290c3RyYXAoKTtcblxuZnVuY3Rpb24gYm9vdHN0cmFwKCk6IHZvaWQge1xuICBjb25zdCBpbml0aWFsTmFtZSA9IHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTtcbiAgaWYgKGNhbGxTaWduSW5wdXQpIHtcbiAgICBjYWxsU2lnbklucHV0LnZhbHVlID0gaW5pdGlhbE5hbWU7XG4gIH1cblxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbGwtc2lnbi1mb3JtXCIpPy5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHNob3dTYXZlU3RhdHVzKFwiU2F2ZWQgY2FsbCBzaWduXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaG93U2F2ZVN0YXR1cyhcIkNsZWFyZWQgY2FsbCBzaWduXCIpO1xuICAgIH1cbiAgfSk7XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJuZXctcm9vbS1mb3JtXCIpPy5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3Qgcm9vbUlkID0gZ2VuZXJhdGVSb29tSWQoKTtcbiAgICBwZW5kaW5nUm9vbUlkID0gcm9vbUlkO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUpO1xuICAgIGlmIChyb29tVXJsSW5wdXQpIHtcbiAgICAgIHJvb21VcmxJbnB1dC52YWx1ZSA9IHVybDtcbiAgICB9XG4gICAgcm9vbVNoYXJlPy5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgY29weVJvb21CdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgdXJsID0gcm9vbVVybElucHV0Py52YWx1ZS50cmltKCk7XG4gICAgaWYgKCF1cmwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgb3JpZ2luYWxMYWJlbCA9IGNvcHlSb29tQnV0dG9uLnRleHRDb250ZW50O1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh1cmwpO1xuICAgICAgY29weVJvb21CdXR0b24udGV4dENvbnRlbnQgPSBcIkNvcGllZFwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcm9vbVVybElucHV0Py5zZWxlY3QoKTtcbiAgICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKFwiY29weVwiKTtcbiAgICAgIGNvcHlSb29tQnV0dG9uLnRleHRDb250ZW50ID0gXCJDb3BpZWRcIjtcbiAgICB9XG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29weVJvb21CdXR0b24udGV4dENvbnRlbnQgPSBvcmlnaW5hbExhYmVsID8/IFwiQ29weSBMaW5rXCI7XG4gICAgfSwgMTUwMCk7XG4gIH0pO1xuXG4gIGVudGVyUm9vbUJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBjb25zdCByb29tSWQgPSBwZW5kaW5nUm9vbUlkO1xuICAgIGlmICghcm9vbUlkKSB7XG4gICAgICBqb2luUm9vbUlucHV0Py5mb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1cmwgPSBidWlsZFJvb21Vcmwocm9vbUlkLCBlbnN1cmVDYWxsU2lnbigpKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJqb2luLXJvb20tZm9ybVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJhdyA9IGpvaW5Sb29tSW5wdXQ/LnZhbHVlID8/IFwiXCI7XG4gICAgY29uc3QgZXh0cmFjdGVkID0gZXh0cmFjdFJvb21JZChyYXcpO1xuICAgIGlmICghZXh0cmFjdGVkKSB7XG4gICAgICBqb2luUm9vbUlucHV0Py5mb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1cmwgPSBidWlsZFJvb21VcmwoZXh0cmFjdGVkLCBlbnN1cmVDYWxsU2lnbigpKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgY2FtcGFpZ25CdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3Qgcm9vbUlkID0gZ2VuZXJhdGVSb29tSWQoXCJjYW1wYWlnblwiKTtcbiAgICBjb25zdCB1cmwgPSBidWlsZFJvb21Vcmwocm9vbUlkLCBuYW1lLCBcImNhbXBhaWduXCIpO1xuICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdXJsO1xuICB9KTtcblxuICB0dXRvcmlhbEJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBjb25zdCBuYW1lID0gZW5zdXJlQ2FsbFNpZ24oKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcInR1dG9yaWFsXCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwidHV0b3JpYWxcIik7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xuXG4gIGZyZWVwbGF5QnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwiZnJlZXBsYXlcIik7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKHJvb21JZCwgbmFtZSwgXCJmcmVlcGxheVwiKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUNhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGlucHV0TmFtZSA9IGNhbGxTaWduSW5wdXQgPyBjYWxsU2lnbklucHV0LnZhbHVlIDogXCJcIjtcbiAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVDYWxsU2lnbihpbnB1dE5hbWUpO1xuICBpZiAoY2FsbFNpZ25JbnB1dCkge1xuICAgIGNhbGxTaWduSW5wdXQudmFsdWUgPSBzYW5pdGl6ZWQ7XG4gIH1cbiAgcGVyc2lzdENhbGxTaWduKHNhbml0aXplZCk7XG4gIHJldHVybiBzYW5pdGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgY29uc3QgZnJvbVF1ZXJ5ID0gc2FuaXRpemVDYWxsU2lnbihuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWQgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgaWYgKGZyb21RdWVyeSkge1xuICAgIGlmIChmcm9tUXVlcnkgIT09IHN0b3JlZCkge1xuICAgICAgcGVyc2lzdENhbGxTaWduKGZyb21RdWVyeSk7XG4gICAgfVxuICAgIHJldHVybiBmcm9tUXVlcnk7XG4gIH1cbiAgcmV0dXJuIHN0b3JlZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogTWF5YmU8c3RyaW5nPik6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfS0VZKTtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIGxvY2FsU3RvcmFnZSB1bmF2YWlsYWJsZTsgaWdub3JlICovXG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPz8gXCJcIjtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRSb29tVXJsKHJvb21JZDogc3RyaW5nLCBjYWxsU2lnbjogc3RyaW5nLCBtb2RlPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IHVybCA9IGAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59Lz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb21JZCl9YDtcbiAgaWYgKG1vZGUpIHtcbiAgICB1cmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKGNhbGxTaWduKSB7XG4gICAgdXJsICs9IGAmbmFtZT0ke2VuY29kZVVSSUNvbXBvbmVudChjYWxsU2lnbil9YDtcbiAgfVxuICByZXR1cm4gdXJsO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZVJvb21JZChwcmVmaXg/OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgc2x1ZyA9IFwiXCI7XG4gIHdoaWxlIChzbHVnLmxlbmd0aCA8IDYpIHtcbiAgICBzbHVnID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgOCk7XG4gIH1cbiAgaWYgKHByZWZpeCkge1xuICAgIHJldHVybiBgJHtwcmVmaXh9LSR7c2x1Z31gO1xuICB9XG4gIHJldHVybiBgci0ke3NsdWd9YDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFJvb21JZChyYXc6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCB2YWx1ZSA9IHJhdy50cmltKCk7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IG1heWJlVXJsID0gbmV3IFVSTCh2YWx1ZSk7XG4gICAgY29uc3QgcGFyYW0gPSBtYXliZVVybC5zZWFyY2hQYXJhbXMuZ2V0KFwicm9vbVwiKTtcbiAgICBpZiAocGFyYW0pIHtcbiAgICAgIHJldHVybiBwYXJhbS50cmltKCk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvLyBub3QgYSBmdWxsIFVSTFxuICB9XG4gIGNvbnN0IHFzSW5kZXggPSB2YWx1ZS5pbmRleE9mKFwicm9vbT1cIik7XG4gIGlmIChxc0luZGV4ICE9PSAtMSkge1xuICAgIGNvbnN0IHN1YnN0cmluZyA9IHZhbHVlLnNsaWNlKHFzSW5kZXggKyA1KTtcbiAgICBjb25zdCBhbXBJbmRleCA9IHN1YnN0cmluZy5pbmRleE9mKFwiJlwiKTtcbiAgICBjb25zdCBpZCA9IGFtcEluZGV4ID09PSAtMSA/IHN1YnN0cmluZyA6IHN1YnN0cmluZy5zbGljZSgwLCBhbXBJbmRleCk7XG4gICAgaWYgKGlkKSB7XG4gICAgICByZXR1cm4gaWQudHJpbSgpO1xuICAgIH1cbiAgfVxuICBpZiAoL15bYS16QS1aMC05Xy1dKyQvLnRlc3QodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzaG93U2F2ZVN0YXR1cyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKCFzYXZlU3RhdHVzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHNhdmVTdGF0dXMudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuICBpZiAoc2F2ZVN0YXR1c1RpbWVyICE9PSBudWxsKSB7XG4gICAgd2luZG93LmNsZWFyVGltZW91dChzYXZlU3RhdHVzVGltZXIpO1xuICB9XG4gIHNhdmVTdGF0dXNUaW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICBpZiAoc2F2ZVN0YXR1cykge1xuICAgICAgc2F2ZVN0YXR1cy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgfVxuICAgIHNhdmVTdGF0dXNUaW1lciA9IG51bGw7XG4gIH0sIDIwMDApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBQUEsTUFBTSxjQUFjO0FBSXBCLE1BQUksa0JBQWlDO0FBQ3JDLE1BQUksZ0JBQStCO0FBRW5DLE1BQU0sZ0JBQWdCLFNBQVMsY0FBZ0Msa0JBQWtCO0FBQ2pGLE1BQU0sYUFBYSxTQUFTLGVBQWUsYUFBYTtBQUN4RCxNQUFNLGlCQUFpQixTQUFTLGVBQWUsZUFBZTtBQUM5RCxNQUFNLGVBQWUsU0FBUyxjQUFnQyxXQUFXO0FBQ3pFLE1BQU0sWUFBWSxTQUFTLGVBQWUsWUFBWTtBQUN0RCxNQUFNLGtCQUFrQixTQUFTLGVBQWUsWUFBWTtBQUM1RCxNQUFNLGdCQUFnQixTQUFTLGNBQWdDLGtCQUFrQjtBQUNqRixNQUFNLGlCQUFpQixTQUFTLGVBQWUsaUJBQWlCO0FBQ2hFLE1BQU0saUJBQWlCLFNBQVMsZUFBZSxpQkFBaUI7QUFDaEUsTUFBTSxpQkFBaUIsU0FBUyxlQUFlLGlCQUFpQjtBQUVoRSxZQUFVO0FBRVYsV0FBUyxZQUFrQjtBQXBCM0I7QUFxQkUsVUFBTSxjQUFjLHVCQUF1QjtBQUMzQyxRQUFJLGVBQWU7QUFDakIsb0JBQWMsUUFBUTtBQUFBLElBQ3hCO0FBRUEsbUJBQVMsZUFBZSxnQkFBZ0IsTUFBeEMsbUJBQTJDLGlCQUFp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
