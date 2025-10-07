"use strict";
(() => {
  // web/src/lobby.ts
  var STORAGE_KEY = "lsd:callsign";
  var saveStatusTimer = null;
  var callSignInput = document.querySelector("#call-sign-input");
  var saveStatus = document.getElementById("save-status");
  var campaignButton = document.getElementById("campaign-button");
  var tutorialButton = document.getElementById("tutorial-button");
  var freeplayButton = document.getElementById("freeplay-button");
  bootstrap();
  function bootstrap() {
    var _a;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbnR5cGUgTWF5YmU8VD4gPSBUIHwgbnVsbCB8IHVuZGVmaW5lZDtcblxubGV0IHNhdmVTdGF0dXNUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGNhbGxTaWduSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI2NhbGwtc2lnbi1pbnB1dFwiKTtcbmNvbnN0IHNhdmVTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmUtc3RhdHVzXCIpO1xuY29uc3QgY2FtcGFpZ25CdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbXBhaWduLWJ1dHRvblwiKTtcbmNvbnN0IHR1dG9yaWFsQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0dXRvcmlhbC1idXR0b25cIik7XG5jb25zdCBmcmVlcGxheUJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJlZXBsYXktYnV0dG9uXCIpO1xuXG5ib290c3RyYXAoKTtcblxuZnVuY3Rpb24gYm9vdHN0cmFwKCk6IHZvaWQge1xuICBjb25zdCBpbml0aWFsTmFtZSA9IHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTtcbiAgaWYgKGNhbGxTaWduSW5wdXQpIHtcbiAgICBjYWxsU2lnbklucHV0LnZhbHVlID0gaW5pdGlhbE5hbWU7XG4gIH1cblxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbGwtc2lnbi1mb3JtXCIpPy5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHNob3dTYXZlU3RhdHVzKFwiU2F2ZWQgY2FsbCBzaWduXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaG93U2F2ZVN0YXR1cyhcIkNsZWFyZWQgY2FsbCBzaWduXCIpO1xuICAgIH1cbiAgfSk7XG5cbiAgY2FtcGFpZ25CdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3Qgcm9vbUlkID0gZ2VuZXJhdGVSb29tSWQoXCJjYW1wYWlnblwiKTtcbiAgICBjb25zdCB1cmwgPSBidWlsZFJvb21Vcmwocm9vbUlkLCBuYW1lLCBcImNhbXBhaWduXCIpO1xuICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdXJsO1xuICB9KTtcblxuICB0dXRvcmlhbEJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBjb25zdCBuYW1lID0gZW5zdXJlQ2FsbFNpZ24oKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcInR1dG9yaWFsXCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwidHV0b3JpYWxcIik7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xuXG4gIGZyZWVwbGF5QnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwiZnJlZXBsYXlcIik7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKHJvb21JZCwgbmFtZSwgXCJmcmVlcGxheVwiKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUNhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGlucHV0TmFtZSA9IGNhbGxTaWduSW5wdXQgPyBjYWxsU2lnbklucHV0LnZhbHVlIDogXCJcIjtcbiAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVDYWxsU2lnbihpbnB1dE5hbWUpO1xuICBpZiAoY2FsbFNpZ25JbnB1dCkge1xuICAgIGNhbGxTaWduSW5wdXQudmFsdWUgPSBzYW5pdGl6ZWQ7XG4gIH1cbiAgcGVyc2lzdENhbGxTaWduKHNhbml0aXplZCk7XG4gIHJldHVybiBzYW5pdGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgY29uc3QgZnJvbVF1ZXJ5ID0gc2FuaXRpemVDYWxsU2lnbihuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWQgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgaWYgKGZyb21RdWVyeSkge1xuICAgIGlmIChmcm9tUXVlcnkgIT09IHN0b3JlZCkge1xuICAgICAgcGVyc2lzdENhbGxTaWduKGZyb21RdWVyeSk7XG4gICAgfVxuICAgIHJldHVybiBmcm9tUXVlcnk7XG4gIH1cbiAgcmV0dXJuIHN0b3JlZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogTWF5YmU8c3RyaW5nPik6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfS0VZKTtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIGxvY2FsU3RvcmFnZSB1bmF2YWlsYWJsZTsgaWdub3JlICovXG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPz8gXCJcIjtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRSb29tVXJsKHJvb21JZDogc3RyaW5nLCBjYWxsU2lnbjogc3RyaW5nLCBtb2RlPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IHVybCA9IGAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59Lz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb21JZCl9YDtcbiAgaWYgKG1vZGUpIHtcbiAgICB1cmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKGNhbGxTaWduKSB7XG4gICAgdXJsICs9IGAmbmFtZT0ke2VuY29kZVVSSUNvbXBvbmVudChjYWxsU2lnbil9YDtcbiAgfVxuICByZXR1cm4gdXJsO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZVJvb21JZChwcmVmaXg/OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgc2x1ZyA9IFwiXCI7XG4gIHdoaWxlIChzbHVnLmxlbmd0aCA8IDYpIHtcbiAgICBzbHVnID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgOCk7XG4gIH1cbiAgaWYgKHByZWZpeCkge1xuICAgIHJldHVybiBgJHtwcmVmaXh9LSR7c2x1Z31gO1xuICB9XG4gIHJldHVybiBgci0ke3NsdWd9YDtcbn1cblxuZnVuY3Rpb24gc2hvd1NhdmVTdGF0dXMobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gIGlmICghc2F2ZVN0YXR1cykge1xuICAgIHJldHVybjtcbiAgfVxuICBzYXZlU3RhdHVzLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgaWYgKHNhdmVTdGF0dXNUaW1lciAhPT0gbnVsbCkge1xuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoc2F2ZVN0YXR1c1RpbWVyKTtcbiAgfVxuICBzYXZlU3RhdHVzVGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgaWYgKHNhdmVTdGF0dXMpIHtcbiAgICAgIHNhdmVTdGF0dXMudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIH1cbiAgICBzYXZlU3RhdHVzVGltZXIgPSBudWxsO1xuICB9LCAyMDAwKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQUFBLE1BQU0sY0FBYztBQUlwQixNQUFJLGtCQUFpQztBQUVyQyxNQUFNLGdCQUFnQixTQUFTLGNBQWdDLGtCQUFrQjtBQUNqRixNQUFNLGFBQWEsU0FBUyxlQUFlLGFBQWE7QUFDeEQsTUFBTSxpQkFBaUIsU0FBUyxlQUFlLGlCQUFpQjtBQUNoRSxNQUFNLGlCQUFpQixTQUFTLGVBQWUsaUJBQWlCO0FBQ2hFLE1BQU0saUJBQWlCLFNBQVMsZUFBZSxpQkFBaUI7QUFFaEUsWUFBVTtBQUVWLFdBQVMsWUFBa0I7QUFkM0I7QUFlRSxVQUFNLGNBQWMsdUJBQXVCO0FBQzNDLFFBQUksZUFBZTtBQUNqQixvQkFBYyxRQUFRO0FBQUEsSUFDeEI7QUFFQSxtQkFBUyxlQUFlLGdCQUFnQixNQUF4QyxtQkFBMkMsaUJBQWlCLFVBQVUsQ0FBQyxVQUFVO0FBQy9FLFlBQU0sZUFBZTtBQUNyQixZQUFNLE9BQU8sZUFBZTtBQUM1QixVQUFJLE1BQU07QUFDUix1QkFBZSxpQkFBaUI7QUFBQSxNQUNsQyxPQUFPO0FBQ0wsdUJBQWUsbUJBQW1CO0FBQUEsTUFDcEM7QUFBQSxJQUNGO0FBRUEscURBQWdCLGlCQUFpQixTQUFTLE1BQU07QUFDOUMsWUFBTSxPQUFPLGVBQWU7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
