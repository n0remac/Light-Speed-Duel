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
  function buildRoomUrl(roomId, callSign) {
    const base = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    if (callSign) {
      return `${base}&name=${encodeURIComponent(callSign)}`;
    }
    return base;
  }
  function generateRoomId() {
    let slug = "";
    while (slug.length < 6) {
      slug = Math.random().toString(36).slice(2, 8);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbnR5cGUgTWF5YmU8VD4gPSBUIHwgbnVsbCB8IHVuZGVmaW5lZDtcblxubGV0IHNhdmVTdGF0dXNUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgcGVuZGluZ1Jvb21JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGNhbGxTaWduSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI2NhbGwtc2lnbi1pbnB1dFwiKTtcbmNvbnN0IHNhdmVTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmUtc3RhdHVzXCIpO1xuY29uc3QgY29weVJvb21CdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktcm9vbS11cmxcIik7XG5jb25zdCByb29tVXJsSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI3Jvb20tdXJsXCIpO1xuY29uc3Qgcm9vbVNoYXJlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb29tLXNoYXJlXCIpO1xuY29uc3QgZW50ZXJSb29tQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJlbnRlci1yb29tXCIpO1xuY29uc3Qgam9pblJvb21JbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXCIjam9pbi1yb29tLWlucHV0XCIpO1xuXG5ib290c3RyYXAoKTtcblxuZnVuY3Rpb24gYm9vdHN0cmFwKCk6IHZvaWQge1xuICBjb25zdCBpbml0aWFsTmFtZSA9IHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTtcbiAgaWYgKGNhbGxTaWduSW5wdXQpIHtcbiAgICBjYWxsU2lnbklucHV0LnZhbHVlID0gaW5pdGlhbE5hbWU7XG4gIH1cblxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbGwtc2lnbi1mb3JtXCIpPy5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHNob3dTYXZlU3RhdHVzKFwiU2F2ZWQgY2FsbCBzaWduXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaG93U2F2ZVN0YXR1cyhcIkNsZWFyZWQgY2FsbCBzaWduXCIpO1xuICAgIH1cbiAgfSk7XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJuZXctcm9vbS1mb3JtXCIpPy5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3Qgcm9vbUlkID0gZ2VuZXJhdGVSb29tSWQoKTtcbiAgICBwZW5kaW5nUm9vbUlkID0gcm9vbUlkO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUpO1xuICAgIGlmIChyb29tVXJsSW5wdXQpIHtcbiAgICAgIHJvb21VcmxJbnB1dC52YWx1ZSA9IHVybDtcbiAgICB9XG4gICAgcm9vbVNoYXJlPy5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgY29weVJvb21CdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgdXJsID0gcm9vbVVybElucHV0Py52YWx1ZS50cmltKCk7XG4gICAgaWYgKCF1cmwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgb3JpZ2luYWxMYWJlbCA9IGNvcHlSb29tQnV0dG9uLnRleHRDb250ZW50O1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh1cmwpO1xuICAgICAgY29weVJvb21CdXR0b24udGV4dENvbnRlbnQgPSBcIkNvcGllZFwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcm9vbVVybElucHV0Py5zZWxlY3QoKTtcbiAgICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKFwiY29weVwiKTtcbiAgICAgIGNvcHlSb29tQnV0dG9uLnRleHRDb250ZW50ID0gXCJDb3BpZWRcIjtcbiAgICB9XG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29weVJvb21CdXR0b24udGV4dENvbnRlbnQgPSBvcmlnaW5hbExhYmVsID8/IFwiQ29weSBMaW5rXCI7XG4gICAgfSwgMTUwMCk7XG4gIH0pO1xuXG4gIGVudGVyUm9vbUJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBjb25zdCByb29tSWQgPSBwZW5kaW5nUm9vbUlkO1xuICAgIGlmICghcm9vbUlkKSB7XG4gICAgICBqb2luUm9vbUlucHV0Py5mb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1cmwgPSBidWlsZFJvb21Vcmwocm9vbUlkLCBlbnN1cmVDYWxsU2lnbigpKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJqb2luLXJvb20tZm9ybVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJhdyA9IGpvaW5Sb29tSW5wdXQ/LnZhbHVlID8/IFwiXCI7XG4gICAgY29uc3QgZXh0cmFjdGVkID0gZXh0cmFjdFJvb21JZChyYXcpO1xuICAgIGlmICghZXh0cmFjdGVkKSB7XG4gICAgICBqb2luUm9vbUlucHV0Py5mb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1cmwgPSBidWlsZFJvb21VcmwoZXh0cmFjdGVkLCBlbnN1cmVDYWxsU2lnbigpKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUNhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGlucHV0TmFtZSA9IGNhbGxTaWduSW5wdXQgPyBjYWxsU2lnbklucHV0LnZhbHVlIDogXCJcIjtcbiAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVDYWxsU2lnbihpbnB1dE5hbWUpO1xuICBpZiAoY2FsbFNpZ25JbnB1dCkge1xuICAgIGNhbGxTaWduSW5wdXQudmFsdWUgPSBzYW5pdGl6ZWQ7XG4gIH1cbiAgcGVyc2lzdENhbGxTaWduKHNhbml0aXplZCk7XG4gIHJldHVybiBzYW5pdGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgY29uc3QgZnJvbVF1ZXJ5ID0gc2FuaXRpemVDYWxsU2lnbihuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWQgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgaWYgKGZyb21RdWVyeSkge1xuICAgIGlmIChmcm9tUXVlcnkgIT09IHN0b3JlZCkge1xuICAgICAgcGVyc2lzdENhbGxTaWduKGZyb21RdWVyeSk7XG4gICAgfVxuICAgIHJldHVybiBmcm9tUXVlcnk7XG4gIH1cbiAgcmV0dXJuIHN0b3JlZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogTWF5YmU8c3RyaW5nPik6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfS0VZKTtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIGxvY2FsU3RvcmFnZSB1bmF2YWlsYWJsZTsgaWdub3JlICovXG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPz8gXCJcIjtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRSb29tVXJsKHJvb21JZDogc3RyaW5nLCBjYWxsU2lnbjogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgYmFzZSA9IGAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59Lz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb21JZCl9YDtcbiAgaWYgKGNhbGxTaWduKSB7XG4gICAgcmV0dXJuIGAke2Jhc2V9Jm5hbWU9JHtlbmNvZGVVUklDb21wb25lbnQoY2FsbFNpZ24pfWA7XG4gIH1cbiAgcmV0dXJuIGJhc2U7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlUm9vbUlkKCk6IHN0cmluZyB7XG4gIGxldCBzbHVnID0gXCJcIjtcbiAgd2hpbGUgKHNsdWcubGVuZ3RoIDwgNikge1xuICAgIHNsdWcgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KTtcbiAgfVxuICByZXR1cm4gYHItJHtzbHVnfWA7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RSb29tSWQocmF3OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgdmFsdWUgPSByYXcudHJpbSgpO1xuICBpZiAoIXZhbHVlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBtYXliZVVybCA9IG5ldyBVUkwodmFsdWUpO1xuICAgIGNvbnN0IHBhcmFtID0gbWF5YmVVcmwuc2VhcmNoUGFyYW1zLmdldChcInJvb21cIik7XG4gICAgaWYgKHBhcmFtKSB7XG4gICAgICByZXR1cm4gcGFyYW0udHJpbSgpO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgLy8gbm90IGEgZnVsbCBVUkxcbiAgfVxuICBjb25zdCBxc0luZGV4ID0gdmFsdWUuaW5kZXhPZihcInJvb209XCIpO1xuICBpZiAocXNJbmRleCAhPT0gLTEpIHtcbiAgICBjb25zdCBzdWJzdHJpbmcgPSB2YWx1ZS5zbGljZShxc0luZGV4ICsgNSk7XG4gICAgY29uc3QgYW1wSW5kZXggPSBzdWJzdHJpbmcuaW5kZXhPZihcIiZcIik7XG4gICAgY29uc3QgaWQgPSBhbXBJbmRleCA9PT0gLTEgPyBzdWJzdHJpbmcgOiBzdWJzdHJpbmcuc2xpY2UoMCwgYW1wSW5kZXgpO1xuICAgIGlmIChpZCkge1xuICAgICAgcmV0dXJuIGlkLnRyaW0oKTtcbiAgICB9XG4gIH1cbiAgaWYgKC9eW2EtekEtWjAtOV8tXSskLy50ZXN0KHZhbHVlKSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd1NhdmVTdGF0dXMobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gIGlmICghc2F2ZVN0YXR1cykge1xuICAgIHJldHVybjtcbiAgfVxuICBzYXZlU3RhdHVzLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgaWYgKHNhdmVTdGF0dXNUaW1lciAhPT0gbnVsbCkge1xuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoc2F2ZVN0YXR1c1RpbWVyKTtcbiAgfVxuICBzYXZlU3RhdHVzVGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgaWYgKHNhdmVTdGF0dXMpIHtcbiAgICAgIHNhdmVTdGF0dXMudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH1cbiAgICBzYXZlU3RhdHVzVGltZXIgPSBudWxsO1xuICB9LCAyMDAwKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQUFBLE1BQU0sY0FBYztBQUlwQixNQUFJLGtCQUFpQztBQUNyQyxNQUFJLGdCQUErQjtBQUVuQyxNQUFNLGdCQUFnQixTQUFTLGNBQWdDLGtCQUFrQjtBQUNqRixNQUFNLGFBQWEsU0FBUyxlQUFlLGFBQWE7QUFDeEQsTUFBTSxpQkFBaUIsU0FBUyxlQUFlLGVBQWU7QUFDOUQsTUFBTSxlQUFlLFNBQVMsY0FBZ0MsV0FBVztBQUN6RSxNQUFNLFlBQVksU0FBUyxlQUFlLFlBQVk7QUFDdEQsTUFBTSxrQkFBa0IsU0FBUyxlQUFlLFlBQVk7QUFDNUQsTUFBTSxnQkFBZ0IsU0FBUyxjQUFnQyxrQkFBa0I7QUFFakYsWUFBVTtBQUVWLFdBQVMsWUFBa0I7QUFqQjNCO0FBa0JFLFVBQU0sY0FBYyx1QkFBdUI7QUFDM0MsUUFBSSxlQUFlO0FBQ2pCLG9CQUFjLFFBQVE7QUFBQSxJQUN4QjtBQUVBLG1CQUFTLGVBQWUsZ0JBQWdCLE1BQXhDLG1CQUEyQyxpQkFBaUIsVUFBVSxDQUFDLFVBQVU7QUFDL0UsWUFBTSxlQUFlO0FBQ3JCLFlBQU0sT0FBTyxlQUFlO0FBQzVCLFVBQUksTUFBTTtBQUNSLHVCQUFlLGlCQUFpQjtBQUFBLE1BQ2xDLE9BQU87QUFDTCx1QkFBZSxtQkFBbUI7QUFBQSxNQUNwQztBQUFBLElBQ0Y7QUFFQSxtQkFBUyxlQUFlLGVBQWUsTUFBdkMsbUJBQTBDLGlCQUFpQixVQUFVLENBQUMsVUFBVTtBQUM5RSxZQUFNLGVBQWU7QUFDckIsWUFBTSxPQUFPLGVBQWU7QUFDNUIsWUFBTSxTQUFTLGVBQWU7QUFDOUIsc0JBQWdCO0FBQ2hCLFlBQU0sTUFB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
