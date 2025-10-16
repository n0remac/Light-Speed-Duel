"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // web/src/lobby.ts
  var require_lobby = __commonJS({
    "web/src/lobby.ts"() {
      var STORAGE_KEY = "lsd:callsign";
      var saveStatusTimer = null;
      var callSignInput = document.querySelector("#call-sign-input");
      var saveStatus = document.getElementById("save-status");
      var campaignButton = document.getElementById("campaign-button");
      var tutorialButton = document.getElementById("tutorial-button");
      var freeplayButton = document.getElementById("freeplay-button");
      var mapSizeSelect = document.querySelector("#map-size-select");
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
          const missionId = "1";
          const url = buildRoomUrl(
            roomId,
            name,
            "campaign",
            { w: 32e3, h: 18e3 },
            missionId
          );
          window.location.href = url;
        });
        tutorialButton == null ? void 0 : tutorialButton.addEventListener("click", () => {
          const name = ensureCallSign();
          const mapSize = getSelectedMapSize();
          const roomId = generateRoomId("tutorial");
          const url = buildRoomUrl(roomId, name, "tutorial", mapSize);
          window.location.href = url;
        });
        freeplayButton == null ? void 0 : freeplayButton.addEventListener("click", () => {
          const name = ensureCallSign();
          const mapSize = getSelectedMapSize();
          const roomId = generateRoomId("freeplay");
          const url = buildRoomUrl(roomId, name, "freeplay", mapSize);
          window.location.href = url;
        });
      }
      function getSelectedMapSize() {
        const selected = (mapSizeSelect == null ? void 0 : mapSizeSelect.value) || "medium";
        switch (selected) {
          case "small":
            return { w: 4e3, h: 2250 };
          case "medium":
            return { w: 8e3, h: 4500 };
          case "large":
            return { w: 16e3, h: 9e3 };
          case "huge":
            return { w: 32e3, h: 18e3 };
          default:
            return { w: 8e3, h: 4500 };
        }
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
      function buildRoomUrl(roomId, callSign, mode, mapSize, missionId) {
        let url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
        if (mode) {
          url += `&mode=${encodeURIComponent(mode)}`;
        }
        if (missionId) {
          url += `&mission=${encodeURIComponent(missionId)}`;
        }
        if (callSign) {
          url += `&name=${encodeURIComponent(callSign)}`;
        }
        if (mapSize) {
          url += `&mapW=${mapSize.w}&mapH=${mapSize.h}`;
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
    }
  });
  require_lobby();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbnR5cGUgTWF5YmU8VD4gPSBUIHwgbnVsbCB8IHVuZGVmaW5lZDtcblxubGV0IHNhdmVTdGF0dXNUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGNhbGxTaWduSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI2NhbGwtc2lnbi1pbnB1dFwiKTtcbmNvbnN0IHNhdmVTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmUtc3RhdHVzXCIpO1xuY29uc3QgY2FtcGFpZ25CdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbXBhaWduLWJ1dHRvblwiKTtcbmNvbnN0IHR1dG9yaWFsQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0dXRvcmlhbC1idXR0b25cIik7XG5jb25zdCBmcmVlcGxheUJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJlZXBsYXktYnV0dG9uXCIpO1xuY29uc3QgbWFwU2l6ZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTFNlbGVjdEVsZW1lbnQ+KFwiI21hcC1zaXplLXNlbGVjdFwiKTtcblxuYm9vdHN0cmFwKCk7XG5cbmZ1bmN0aW9uIGJvb3RzdHJhcCgpOiB2b2lkIHtcbiAgY29uc3QgaW5pdGlhbE5hbWUgPSByZXNvbHZlSW5pdGlhbENhbGxTaWduKCk7XG4gIGlmIChjYWxsU2lnbklucHV0KSB7XG4gICAgY2FsbFNpZ25JbnB1dC52YWx1ZSA9IGluaXRpYWxOYW1lO1xuICB9XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYWxsLXNpZ24tZm9ybVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGlmIChuYW1lKSB7XG4gICAgICBzaG93U2F2ZVN0YXR1cyhcIlNhdmVkIGNhbGwgc2lnblwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hvd1NhdmVTdGF0dXMoXCJDbGVhcmVkIGNhbGwgc2lnblwiKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNhbXBhaWduQnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwiY2FtcGFpZ25cIik7XG4gICAgY29uc3QgbWlzc2lvbklkID0gXCIxXCI7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKFxuICAgICAgcm9vbUlkLFxuICAgICAgbmFtZSxcbiAgICAgIFwiY2FtcGFpZ25cIixcbiAgICAgIHsgdzogMzIwMDAsIGg6IDE4MDAwIH0sXG4gICAgICBtaXNzaW9uSWQsXG4gICAgKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgdHV0b3JpYWxCdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3QgbWFwU2l6ZSA9IGdldFNlbGVjdGVkTWFwU2l6ZSgpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwidHV0b3JpYWxcIik7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKHJvb21JZCwgbmFtZSwgXCJ0dXRvcmlhbFwiLCBtYXBTaXplKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgZnJlZXBsYXlCdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3QgbWFwU2l6ZSA9IGdldFNlbGVjdGVkTWFwU2l6ZSgpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwiZnJlZXBsYXlcIik7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKHJvb21JZCwgbmFtZSwgXCJmcmVlcGxheVwiLCBtYXBTaXplKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldFNlbGVjdGVkTWFwU2l6ZSgpOiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH0ge1xuICBjb25zdCBzZWxlY3RlZCA9IG1hcFNpemVTZWxlY3Q/LnZhbHVlIHx8IFwibWVkaXVtXCI7XG4gIHN3aXRjaCAoc2VsZWN0ZWQpIHtcbiAgICBjYXNlIFwic21hbGxcIjpcbiAgICAgIHJldHVybiB7IHc6IDQwMDAsIGg6IDIyNTAgfTtcbiAgICBjYXNlIFwibWVkaXVtXCI6XG4gICAgICByZXR1cm4geyB3OiA4MDAwLCBoOiA0NTAwIH07XG4gICAgY2FzZSBcImxhcmdlXCI6XG4gICAgICByZXR1cm4geyB3OiAxNjAwMCwgaDogOTAwMCB9O1xuICAgIGNhc2UgXCJodWdlXCI6XG4gICAgICByZXR1cm4geyB3OiAzMjAwMCwgaDogMTgwMDAgfTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHsgdzogODAwMCwgaDogNDUwMCB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUNhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGlucHV0TmFtZSA9IGNhbGxTaWduSW5wdXQgPyBjYWxsU2lnbklucHV0LnZhbHVlIDogXCJcIjtcbiAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVDYWxsU2lnbihpbnB1dE5hbWUpO1xuICBpZiAoY2FsbFNpZ25JbnB1dCkge1xuICAgIGNhbGxTaWduSW5wdXQudmFsdWUgPSBzYW5pdGl6ZWQ7XG4gIH1cbiAgcGVyc2lzdENhbGxTaWduKHNhbml0aXplZCk7XG4gIHJldHVybiBzYW5pdGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgY29uc3QgZnJvbVF1ZXJ5ID0gc2FuaXRpemVDYWxsU2lnbihuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWQgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgaWYgKGZyb21RdWVyeSkge1xuICAgIGlmIChmcm9tUXVlcnkgIT09IHN0b3JlZCkge1xuICAgICAgcGVyc2lzdENhbGxTaWduKGZyb21RdWVyeSk7XG4gICAgfVxuICAgIHJldHVybiBmcm9tUXVlcnk7XG4gIH1cbiAgcmV0dXJuIHN0b3JlZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogTWF5YmU8c3RyaW5nPik6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfS0VZKTtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIGxvY2FsU3RvcmFnZSB1bmF2YWlsYWJsZTsgaWdub3JlICovXG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPz8gXCJcIjtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRSb29tVXJsKFxuICByb29tSWQ6IHN0cmluZyxcbiAgY2FsbFNpZ246IHN0cmluZyxcbiAgbW9kZT86IHN0cmluZyxcbiAgbWFwU2l6ZT86IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSxcbiAgbWlzc2lvbklkPzogc3RyaW5nLFxuKTogc3RyaW5nIHtcbiAgbGV0IHVybCA9IGAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59Lz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb21JZCl9YDtcbiAgaWYgKG1vZGUpIHtcbiAgICB1cmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKG1pc3Npb25JZCkge1xuICAgIHVybCArPSBgJm1pc3Npb249JHtlbmNvZGVVUklDb21wb25lbnQobWlzc2lvbklkKX1gO1xuICB9XG4gIGlmIChjYWxsU2lnbikge1xuICAgIHVybCArPSBgJm5hbWU9JHtlbmNvZGVVUklDb21wb25lbnQoY2FsbFNpZ24pfWA7XG4gIH1cbiAgaWYgKG1hcFNpemUpIHtcbiAgICB1cmwgKz0gYCZtYXBXPSR7bWFwU2l6ZS53fSZtYXBIPSR7bWFwU2l6ZS5ofWA7XG4gIH1cbiAgcmV0dXJuIHVybDtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVSb29tSWQocHJlZml4Pzogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IHNsdWcgPSBcIlwiO1xuICB3aGlsZSAoc2x1Zy5sZW5ndGggPCA2KSB7XG4gICAgc2x1ZyA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpO1xuICB9XG4gIGlmIChwcmVmaXgpIHtcbiAgICByZXR1cm4gYCR7cHJlZml4fS0ke3NsdWd9YDtcbiAgfVxuICByZXR1cm4gYHItJHtzbHVnfWA7XG59XG5cbmZ1bmN0aW9uIHNob3dTYXZlU3RhdHVzKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIXNhdmVTdGF0dXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2F2ZVN0YXR1cy50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGlmIChzYXZlU3RhdHVzVGltZXIgIT09IG51bGwpIHtcbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHNhdmVTdGF0dXNUaW1lcik7XG4gIH1cbiAgc2F2ZVN0YXR1c1RpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGlmIChzYXZlU3RhdHVzKSB7XG4gICAgICBzYXZlU3RhdHVzLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICB9XG4gICAgc2F2ZVN0YXR1c1RpbWVyID0gbnVsbDtcbiAgfSwgMjAwMCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7OztBQUFBO0FBQUE7QUFBQSxVQUFNLGNBQWM7QUFJcEIsVUFBSSxrQkFBaUM7QUFFckMsVUFBTSxnQkFBZ0IsU0FBUyxjQUFnQyxrQkFBa0I7QUFDakYsVUFBTSxhQUFhLFNBQVMsZUFBZSxhQUFhO0FBQ3hELFVBQU0saUJBQWlCLFNBQVMsZUFBZSxpQkFBaUI7QUFDaEUsVUFBTSxpQkFBaUIsU0FBUyxlQUFlLGlCQUFpQjtBQUNoRSxVQUFNLGlCQUFpQixTQUFTLGVBQWUsaUJBQWlCO0FBQ2hFLFVBQU0sZ0JBQWdCLFNBQVMsY0FBaUMsa0JBQWtCO0FBRWxGLGdCQUFVO0FBRVYsZUFBUyxZQUFrQjtBQWYzQjtBQWdCRSxjQUFNLGNBQWMsdUJBQXVCO0FBQzNDLFlBQUksZUFBZTtBQUNqQix3QkFBYyxRQUFRO0FBQUEsUUFDeEI7QUFFQSx1QkFBUyxlQUFlLGdCQUFnQixNQUF4QyxtQkFBMkMsaUJBQWlCLFVBQVUsQ0FBQyxVQUFVO0FBQy9FLGdCQUFNLGVBQWU7QUFDckIsZ0JBQU0sT0FBTyxlQUFlO0FBQzVCLGNBQUksTUFBTTtBQUNSLDJCQUFlLGlCQUFpQjtBQUFBLFVBQ2xDLE9BQU87QUFDTCwyQkFBZSxtQkFBbUI7QUFBQSxVQUNwQztBQUFBLFFBQ0Y7QUFFQSx5REFBZ0IsaUJBQWlCLFNBQVMsTUFBTTtBQUM5QyxnQkFBTSxPQUFPLGVBQWU7QUFDNUIsZ0JBQU0sU0FBUyxlQUFlLFVBQVU7QUFDeEMsZ0JBQU0sWUFBWTtBQUNsQixnQkFBTSxNQUFNO0FBQUEsWUFDVjtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQSxFQUFFLEdBQUcsTUFBTyxHQUFHLEtBQU07QUFBQSxZQUNyQjtBQUFBLFVBQ0Y7QUFDQSxpQkFBTyxTQUFTLE9BQU87QUFBQSxRQUN6QjtBQUVBLHlEQUFnQixpQkFBaUIsU0FBUyxNQUFNO0FBQzlDLGdCQUFNLE9BQU8sZUFBZTtBQUM1QixnQkFBTSxVQUFVLG1CQUFtQjtBQUNuQyxnQkFBTSxTQUFTLGVBQWUsVUFBVTtBQUN4QyxnQkFBTSxNQUFNLGFBQWEsUUFBUSxNQUFNLFlBQVksT0FBTztBQUMxRCxpQkFBTyxTQUFTLE9BQU87QUFBQSxRQUN6QjtBQUVBLHlEQUFnQixpQkFBaUIsU0FBUyxNQUFNO0FBQzlDLGdCQUFNLE9BQU8sZUFBZTtBQUM1QixnQkFBTSxVQUFVLG1CQUFtQjtBQUNuQyxnQkFBTSxTQUFTLGVBQWUsVUFBVTtBQUN4QyxnQkFBTSxNQUFNLGFBQWEsUUFBUSxNQUFNLFlBQVksT0FBTztBQUMxRCxpQkFBTyxTQUFTLE9BQU87QUFBQSxRQUN6QjtBQUFBLE1BQ0Y7QUFFQSxlQUFTLHFCQUErQztBQUN0RCxjQUFNLFlBQVcsK0NBQWUsVUFBUztBQUN6QyxnQkFBUSxVQUFVO0FBQUEsVUFDaEIsS0FBSztBQUNILG1CQUFPLEVBQUUsR0FBRyxLQUFNLEdBQUcsS0FBSztBQUFBLFVBQzVCLEtBQUs7QUFDSCxtQkFBTyxFQUFFLEdBQUcsS0FBTSxHQUFHLEtBQUs7QUFBQSxVQUM1QixLQUFLO0FBQ0gsbUJBQU8sRUFBRSxHQUFHLE1BQU8sR0FBRyxJQUFLO0FBQUEsVUFDN0IsS0FBSztBQUNILG1CQUFPLEVBQUUsR0FBRyxNQUFPLEdBQUcsS0FBTTtBQUFBLFVBQzlCO0FBQ0UsbUJBQU8sRUFBRSxHQUFHLEtBQU0sR0FBRyxLQUFLO0FBQUEsUUFDOUI7QUFBQSxNQUNGO0FBRUEsZUFBUyxpQkFBeUI7QUFDaEMsY0FBTSxZQUFZLGdCQUFnQixjQUFjLFFBQVE7QUFDeEQsY0FBTSxZQUFZLGlCQUFpQixTQUFTO0FBQzVDLFlBQUksZUFBZTtBQUNqQix3QkFBYyxRQUFRO0FBQUEsUUFDeEI7QUFDQSx3QkFBZ0IsU0FBUztBQUN6QixlQUFPO0FBQUEsTUFDVDtBQUVBLGVBQVMseUJBQWlDO0FBQ3hDLGNBQU0sWUFBWSxpQkFBaUIsSUFBSSxnQkFBZ0IsT0FBTyxTQUFTLE1BQU0sRUFBRSxJQUFJLE1BQU0sQ0FBQztBQUMxRixjQUFNLFNBQVMsaUJBQWlCLG1CQUFtQixDQUFDO0FBQ3BELFlBQUksV0FBVztBQUNiLGNBQUksY0FBYyxRQUFRO0FBQ3hCLDRCQUFnQixTQUFTO0FBQUEsVUFDM0I7QUFDQSxpQkFBTztBQUFBLFFBQ1Q7QUFDQSxlQUFPO0FBQUEsTUFDVDtBQUVBLGVBQVMsaUJBQWlCLE9BQThCO0FBQ3RELFlBQUksQ0FBQyxPQUFPO0FBQ1YsaUJBQU87QUFBQSxRQUNUO0FBQ0EsY0FBTSxVQUFVLE1BQU0sS0FBSztBQUMzQixZQUFJLENBQUMsU0FBUztBQUNaLGlCQUFPO0FBQUEsUUFDVDtBQUNBLGVBQU8sUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUFBLE1BQzVCO0FBRUEsZUFBUyxnQkFBZ0IsTUFBb0I7QUFDM0MsWUFBSTtBQUNGLGNBQUksTUFBTTtBQUNSLG1CQUFPLGFBQWEsUUFBUSxhQUFhLElBQUk7QUFBQSxVQUMvQyxPQUFPO0FBQ0wsbUJBQU8sYUFBYSxXQUFXLFdBQVc7QUFBQSxVQUM1QztBQUFBLFFBQ0YsU0FBUTtBQUFBLFFBRVI7QUFBQSxNQUNGO0FBRUEsZUFBUyxxQkFBNkI7QUEzSHRDO0FBNEhFLFlBQUk7QUFDRixrQkFBTyxZQUFPLGFBQWEsUUFBUSxXQUFXLE1BQXZDLFlBQTRDO0FBQUEsUUFDckQsU0FBUTtBQUNOLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFFQSxlQUFTLGFBQ1AsUUFDQSxVQUNBLE1BQ0EsU0FDQSxXQUNRO0FBQ1IsWUFBSSxNQUFNLEdBQUcsT0FBTyxTQUFTLE1BQU0sVUFBVSxtQkFBbUIsTUFBTSxDQUFDO0FBQ3ZFLFlBQUksTUFBTTtBQUNSLGlCQUFPLFNBQVMsbUJBQW1CLElBQUksQ0FBQztBQUFBLFFBQzFDO0FBQ0EsWUFBSSxXQUFXO0FBQ2IsaUJBQU8sWUFBWSxtQkFBbUIsU0FBUyxDQUFDO0FBQUEsUUFDbEQ7QUFDQSxZQUFJLFVBQVU7QUFDWixpQkFBTyxTQUFTLG1CQUFtQixRQUFRLENBQUM7QUFBQSxRQUM5QztBQUNBLFlBQUksU0FBUztBQUNYLGlCQUFPLFNBQVMsUUFBUSxDQUFDLFNBQVMsUUFBUSxDQUFDO0FBQUEsUUFDN0M7QUFDQSxlQUFPO0FBQUEsTUFDVDtBQUVBLGVBQVMsZUFBZSxRQUF5QjtBQUMvQyxZQUFJLE9BQU87QUFDWCxlQUFPLEtBQUssU0FBUyxHQUFHO0FBQ3RCLGlCQUFPLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sR0FBRyxDQUFDO0FBQUEsUUFDOUM7QUFDQSxZQUFJLFFBQVE7QUFDVixpQkFBTyxHQUFHLE1BQU0sSUFBSSxJQUFJO0FBQUEsUUFDMUI7QUFDQSxlQUFPLEtBQUssSUFBSTtBQUFBLE1BQ2xCO0FBRUEsZUFBUyxlQUFlLFNBQXVCO0FBQzdDLFlBQUksQ0FBQyxZQUFZO0FBQ2Y7QUFBQSxRQUNGO0FBQ0EsbUJBQVcsY0FBYztBQUN6QixZQUFJLG9CQUFvQixNQUFNO0FBQzVCLGlCQUFPLGFBQWEsZUFBZTtBQUFBLFFBQ3JDO0FBQ0EsMEJBQWtCLE9BQU8sV0FBVyxNQUFNO0FBQ3hDLGNBQUksWUFBWTtBQUNkLHVCQUFXLGNBQWM7QUFBQSxVQUMzQjtBQUNBLDRCQUFrQjtBQUFBLFFBQ3BCLEdBQUcsR0FBSTtBQUFBLE1BQ1Q7QUFBQTtBQUFBOyIsCiAgIm5hbWVzIjogW10KfQo=
