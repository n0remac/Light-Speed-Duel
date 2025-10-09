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
      const mapSize = getSelectedMapSize();
      const roomId = generateRoomId("campaign");
      const url = buildRoomUrl(roomId, name, "campaign", mapSize);
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
  function buildRoomUrl(roomId, callSign, mode, mapSize) {
    let url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    if (mode) {
      url += `&mode=${encodeURIComponent(mode)}`;
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
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbnR5cGUgTWF5YmU8VD4gPSBUIHwgbnVsbCB8IHVuZGVmaW5lZDtcblxubGV0IHNhdmVTdGF0dXNUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGNhbGxTaWduSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KFwiI2NhbGwtc2lnbi1pbnB1dFwiKTtcbmNvbnN0IHNhdmVTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmUtc3RhdHVzXCIpO1xuY29uc3QgY2FtcGFpZ25CdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbXBhaWduLWJ1dHRvblwiKTtcbmNvbnN0IHR1dG9yaWFsQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0dXRvcmlhbC1idXR0b25cIik7XG5jb25zdCBmcmVlcGxheUJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJlZXBsYXktYnV0dG9uXCIpO1xuY29uc3QgbWFwU2l6ZVNlbGVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTFNlbGVjdEVsZW1lbnQ+KFwiI21hcC1zaXplLXNlbGVjdFwiKTtcblxuYm9vdHN0cmFwKCk7XG5cbmZ1bmN0aW9uIGJvb3RzdHJhcCgpOiB2b2lkIHtcbiAgY29uc3QgaW5pdGlhbE5hbWUgPSByZXNvbHZlSW5pdGlhbENhbGxTaWduKCk7XG4gIGlmIChjYWxsU2lnbklucHV0KSB7XG4gICAgY2FsbFNpZ25JbnB1dC52YWx1ZSA9IGluaXRpYWxOYW1lO1xuICB9XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYWxsLXNpZ24tZm9ybVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGlmIChuYW1lKSB7XG4gICAgICBzaG93U2F2ZVN0YXR1cyhcIlNhdmVkIGNhbGwgc2lnblwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hvd1NhdmVTdGF0dXMoXCJDbGVhcmVkIGNhbGwgc2lnblwiKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNhbXBhaWduQnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IG1hcFNpemUgPSBnZXRTZWxlY3RlZE1hcFNpemUoKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcImNhbXBhaWduXCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwiY2FtcGFpZ25cIiwgbWFwU2l6ZSk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xuXG4gIHR1dG9yaWFsQnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IG1hcFNpemUgPSBnZXRTZWxlY3RlZE1hcFNpemUoKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcInR1dG9yaWFsXCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwidHV0b3JpYWxcIiwgbWFwU2l6ZSk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xuXG4gIGZyZWVwbGF5QnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IG1hcFNpemUgPSBnZXRTZWxlY3RlZE1hcFNpemUoKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcImZyZWVwbGF5XCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwiZnJlZXBsYXlcIiwgbWFwU2l6ZSk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRTZWxlY3RlZE1hcFNpemUoKTogeyB3OiBudW1iZXI7IGg6IG51bWJlciB9IHtcbiAgY29uc3Qgc2VsZWN0ZWQgPSBtYXBTaXplU2VsZWN0Py52YWx1ZSB8fCBcIm1lZGl1bVwiO1xuICBzd2l0Y2ggKHNlbGVjdGVkKSB7XG4gICAgY2FzZSBcInNtYWxsXCI6XG4gICAgICByZXR1cm4geyB3OiA0MDAwLCBoOiAyMjUwIH07XG4gICAgY2FzZSBcIm1lZGl1bVwiOlxuICAgICAgcmV0dXJuIHsgdzogODAwMCwgaDogNDUwMCB9O1xuICAgIGNhc2UgXCJsYXJnZVwiOlxuICAgICAgcmV0dXJuIHsgdzogMTYwMDAsIGg6IDkwMDAgfTtcbiAgICBjYXNlIFwiaHVnZVwiOlxuICAgICAgcmV0dXJuIHsgdzogMzIwMDAsIGg6IDE4MDAwIH07XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVDYWxsU2lnbigpOiBzdHJpbmcge1xuICBjb25zdCBpbnB1dE5hbWUgPSBjYWxsU2lnbklucHV0ID8gY2FsbFNpZ25JbnB1dC52YWx1ZSA6IFwiXCI7XG4gIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplQ2FsbFNpZ24oaW5wdXROYW1lKTtcbiAgaWYgKGNhbGxTaWduSW5wdXQpIHtcbiAgICBjYWxsU2lnbklucHV0LnZhbHVlID0gc2FuaXRpemVkO1xuICB9XG4gIHBlcnNpc3RDYWxsU2lnbihzYW5pdGl6ZWQpO1xuICByZXR1cm4gc2FuaXRpemVkO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlSW5pdGlhbENhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGZyb21RdWVyeSA9IHNhbml0aXplQ2FsbFNpZ24obmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoXCJuYW1lXCIpKTtcbiAgY29uc3Qgc3RvcmVkID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGlmIChmcm9tUXVlcnkpIHtcbiAgICBpZiAoZnJvbVF1ZXJ5ICE9PSBzdG9yZWQpIHtcbiAgICAgIHBlcnNpc3RDYWxsU2lnbihmcm9tUXVlcnkpO1xuICAgIH1cbiAgICByZXR1cm4gZnJvbVF1ZXJ5O1xuICB9XG4gIHJldHVybiBzdG9yZWQ7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplQ2FsbFNpZ24odmFsdWU6IE1heWJlPHN0cmluZz4pOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcbiAgaWYgKCF0cmltbWVkKSB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbiAgcmV0dXJuIHRyaW1tZWQuc2xpY2UoMCwgMjQpO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0Q2FsbFNpZ24obmFtZTogc3RyaW5nKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX0tFWSk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvKiBsb2NhbFN0b3JhZ2UgdW5hdmFpbGFibGU7IGlnbm9yZSAqL1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpID8/IFwiXCI7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBcIlwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUm9vbVVybChyb29tSWQ6IHN0cmluZywgY2FsbFNpZ246IHN0cmluZywgbW9kZT86IHN0cmluZywgbWFwU2l6ZT86IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSk6IHN0cmluZyB7XG4gIGxldCB1cmwgPSBgJHt3aW5kb3cubG9jYXRpb24ub3JpZ2lufS8/cm9vbT0ke2VuY29kZVVSSUNvbXBvbmVudChyb29tSWQpfWA7XG4gIGlmIChtb2RlKSB7XG4gICAgdXJsICs9IGAmbW9kZT0ke2VuY29kZVVSSUNvbXBvbmVudChtb2RlKX1gO1xuICB9XG4gIGlmIChjYWxsU2lnbikge1xuICAgIHVybCArPSBgJm5hbWU9JHtlbmNvZGVVUklDb21wb25lbnQoY2FsbFNpZ24pfWA7XG4gIH1cbiAgaWYgKG1hcFNpemUpIHtcbiAgICB1cmwgKz0gYCZtYXBXPSR7bWFwU2l6ZS53fSZtYXBIPSR7bWFwU2l6ZS5ofWA7XG4gIH1cbiAgcmV0dXJuIHVybDtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVSb29tSWQocHJlZml4Pzogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IHNsdWcgPSBcIlwiO1xuICB3aGlsZSAoc2x1Zy5sZW5ndGggPCA2KSB7XG4gICAgc2x1ZyA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpO1xuICB9XG4gIGlmIChwcmVmaXgpIHtcbiAgICByZXR1cm4gYCR7cHJlZml4fS0ke3NsdWd9YDtcbiAgfVxuICByZXR1cm4gYHItJHtzbHVnfWA7XG59XG5cbmZ1bmN0aW9uIHNob3dTYXZlU3RhdHVzKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIXNhdmVTdGF0dXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2F2ZVN0YXR1cy50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGlmIChzYXZlU3RhdHVzVGltZXIgIT09IG51bGwpIHtcbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHNhdmVTdGF0dXNUaW1lcik7XG4gIH1cbiAgc2F2ZVN0YXR1c1RpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGlmIChzYXZlU3RhdHVzKSB7XG4gICAgICBzYXZlU3RhdHVzLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICB9XG4gICAgc2F2ZVN0YXR1c1RpbWVyID0gbnVsbDtcbiAgfSwgMjAwMCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFBQSxNQUFNLGNBQWM7QUFJcEIsTUFBSSxrQkFBaUM7QUFFckMsTUFBTSxnQkFBZ0IsU0FBUyxjQUFnQyxrQkFBa0I7QUFDakYsTUFBTSxhQUFhLFNBQVMsZUFBZSxhQUFhO0FBQ3hELE1BQU0saUJBQWlCLFNBQVMsZUFBZSxpQkFBaUI7QUFDaEUsTUFBTSxpQkFBaUIsU0FBUyxlQUFlLGlCQUFpQjtBQUNoRSxNQUFNLGlCQUFpQixTQUFTLGVBQWUsaUJBQWlCO0FBQ2hFLE1BQU0sZ0JBQWdCLFNBQVMsY0FBaUMsa0JBQWtCO0FBRWxGLFlBQVU7QUFFVixXQUFTLFlBQWtCO0FBZjNCO0FBZ0JFLFVBQU0sY0FBYyx1QkFBdUI7QUFDM0MsUUFBSSxlQUFlO0FBQ2pCLG9CQUFjLFFBQVE7QUFBQSxJQUN4QjtBQUVBLG1CQUFTLGVBQWUsZ0JBQWdCLE1BQXhDLG1CQUEyQyxpQkFBaUIsVUFBVSxDQUFDLFVBQVU7QUFDL0UsWUFBTSxlQUFlO0FBQ3JCLFlBQU0sT0FBTyxlQUFlO0FBQzVCLFVBQUksTUFBTTtBQUNSLHVCQUFlLGlCQUFpQjtBQUFBLE1BQ2xDLE9BQU87QUFDTCx1QkFBZSxtQkFBbUI7QUFBQSxNQUNwQztBQUFBLElBQ0Y7QUFFQSxxREFBZ0IsaUJBQWlCLFNBQVMsTUFBTTtBQUM5QyxZQUFNLE9BQU8sZUFBZTtBQUM1QixZQUFNLFVBQVUsbUJBQW1CO0FBQ25DLFlBQU0sU0FBUyxlQUFlLFVBQVU7QUFDeEMsWUFBTSxNQUFNLGFBQWEsUUFBUSxNQUFNLFlBQVksT0FBTztBQUMxRCxhQUFPLFNBQVMsT0FBTztBQUFBLElBQ3pCO0FBRUEscURBQWdCLGlCQUFpQixTQUFTLE1BQU07QUFDOUMsWUFBTSxPQUFPLGVBQWU7QUFDNUIsWUFBTSxVQUFVLG1CQUFtQjtBQUNuQyxZQUFNLFNBQVMsZUFBZSxVQUFVO0FBQ3hDLFlBQU0sTUFBTSxhQUFhLFFBQVEsTUFBTSxZQUFZLE9BQU87QUFDMUQsYUFBTyxTQUFTLE9BQU87QUFBQSxJQUN6QjtBQUVBLHFEQUFnQixpQkFBaUIsU0FBUyxNQUFNO0FBQzlDLFlBQU0sT0FBTyxlQUFlO0FBQzVCLFlBQU0sVUFBVSxtQkFBbUI7QUFDbkMsWUFBTSxTQUFTLGVBQWUsVUFBVTtBQUN4QyxZQUFNLE1BQU0sYUFBYSxRQUFRLE1BQU0sWUFBWSxPQUFPO0FBQzFELGFBQU8sU0FBUyxPQUFPO0FBQUEsSUFDekI7QUFBQSxFQUNGO0FBRUEsV0FBUyxxQkFBK0M7QUFDdEQsVUFBTSxZQUFXLCtDQUFlLFVBQVM7QUFDekMsWUFBUSxVQUFVO0FBQUEsTUFDaEIsS0FBSztBQUNILGVBQU8sRUFBRSxHQUFHLEtBQU0sR0FBRyxLQUFLO0FBQUEsTUFDNUIsS0FBSztBQUNILGVBQU8sRUFBRSxHQUFHLEtBQU0sR0FBRyxLQUFLO0FBQUEsTUFDNUIsS0FBSztBQUNILGVBQU8sRUFBRSxHQUFHLE1BQU8sR0FBRyxJQUFLO0FBQUEsTUFDN0IsS0FBSztBQUNILGVBQU8sRUFBRSxHQUFHLE1BQU8sR0FBRyxLQUFNO0FBQUEsTUFDOUI7QUFDRSxlQUFPLEVBQUUsR0FBRyxLQUFNLEdBQUcsS0FBSztBQUFBLElBQzlCO0FBQUEsRUFDRjtBQUVBLFdBQVMsaUJBQXlCO0FBQ2hDLFVBQU0sWUFBWSxnQkFBZ0IsY0FBYyxRQUFRO0FBQ3hELFVBQU0sWUFBWSxpQkFBaUIsU0FBUztBQUM1QyxRQUFJLGVBQWU7QUFDakIsb0JBQWMsUUFBUTtBQUFBLElBQ3hCO0FBQ0Esb0JBQWdCLFNBQVM7QUFDekIsV0FBTztBQUFBLEVBQ1Q7QUFFQSxXQUFTLHlCQUFpQztBQUN4QyxVQUFNLFlBQVksaUJBQWlCLElBQUksZ0JBQWdCLE9BQU8sU0FBUyxNQUFNLEVBQUUsSUFBSSxNQUFNLENBQUM7QUFDMUYsVUFBTSxTQUFTLGlCQUFpQixtQkFBbUIsQ0FBQztBQUNwRCxRQUFJLFdBQVc7QUFDYixVQUFJLGNBQWMsUUFBUTtBQUN4Qix3QkFBZ0IsU0FBUztBQUFBLE1BQzNCO0FBQ0EsYUFBTztBQUFBLElBQ1Q7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUVBLFdBQVMsaUJBQWlCLE9BQThCO0FBQ3RELFFBQUksQ0FBQyxPQUFPO0FBQ1YsYUFBTztBQUFBLElBQ1Q7QUFDQSxVQUFNLFVBQVUsTUFBTSxLQUFLO0FBQzNCLFFBQUksQ0FBQyxTQUFTO0FBQ1osYUFBTztBQUFBLElBQ1Q7QUFDQSxXQUFPLFFBQVEsTUFBTSxHQUFHLEVBQUU7QUFBQSxFQUM1QjtBQUVBLFdBQVMsZ0JBQWdCLE1BQW9CO0FBQzNDLFFBQUk7QUFDRixVQUFJLE1BQU07QUFDUixlQUFPLGFBQWEsUUFBUSxhQUFhLElBQUk7QUFBQSxNQUMvQyxPQUFPO0FBQ0wsZUFBTyxhQUFhLFdBQVcsV0FBVztBQUFBLE1BQzVDO0FBQUEsSUFDRixTQUFRO0FBQUEsSUFFUjtBQUFBLEVBQ0Y7QUFFQSxXQUFTLHFCQUE2QjtBQXJIdEM7QUFzSEUsUUFBSTtBQUNGLGNBQU8sWUFBTyxhQUFhLFFBQVEsV0FBVyxNQUF2QyxZQUE0QztBQUFBLElBQ3JELFNBQVE7QUFDTixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFFQSxXQUFTLGFBQWEsUUFBZ0IsVUFBa0IsTUFBZSxTQUE0QztBQUNqSCxRQUFJLE1BQU0sR0FBRyxPQUFPLFNBQVMsTUFBTSxVQUFVLG1CQUFtQixNQUFNLENBQUM7QUFDdkUsUUFBSSxNQUFNO0FBQ1IsYUFBTyxTQUFTLG1CQUFtQixJQUFJLENBQUM7QUFBQSxJQUMxQztBQUNBLFFBQUksVUFBVTtBQUNaLGFBQU8sU0FBUyxtQkFBbUIsUUFBUSxDQUFDO0FBQUEsSUFDOUM7QUFDQSxRQUFJLFNBQVM7QUFDWCxhQUFPLFNBQVMsUUFBUSxDQUFDLFNBQVMsUUFBUSxDQUFDO0FBQUEsSUFDN0M7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUVBLFdBQVMsZUFBZSxRQUF5QjtBQUMvQyxRQUFJLE9BQU87QUFDWCxXQUFPLEtBQUssU0FBUyxHQUFHO0FBQ3RCLGFBQU8sS0FBSyxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsTUFBTSxHQUFHLENBQUM7QUFBQSxJQUM5QztBQUNBLFFBQUksUUFBUTtBQUNWLGFBQU8sR0FBRyxNQUFNLElBQUksSUFBSTtBQUFBLElBQzFCO0FBQ0EsV0FBTyxLQUFLLElBQUk7QUFBQSxFQUNsQjtBQUVBLFdBQVMsZUFBZSxTQUF1QjtBQUM3QyxRQUFJLENBQUMsWUFBWTtBQUNmO0FBQUEsSUFDRjtBQUNBLGVBQVcsY0FBYztBQUN6QixRQUFJLG9CQUFvQixNQUFNO0FBQzVCLGFBQU8sYUFBYSxlQUFlO0FBQUEsSUFDckM7QUFDQSxzQkFBa0IsT0FBTyxXQUFXLE1BQU07QUFDeEMsVUFBSSxZQUFZO0FBQ2QsbUJBQVcsY0FBYztBQUFBLE1BQzNCO0FBQ0Esd0JBQWtCO0FBQUEsSUFDcEIsR0FBRyxHQUFJO0FBQUEsRUFDVDsiLAogICJuYW1lcyI6IFtdCn0K
