# Repository Custom Instructions for GitHub Copilot (Coding Agent)

## Purpose
When asked to create a plan from any input (idea, bug, feature, or research), generate **three Markdown plan files** in:

```
plans/<kebab-slug-of-title>/
├── frontend.md
├── backend.md
└── networking.md
```

Each file should follow the same structure and contain content **specific to its domain**.

- If the directory does not exist, create it.
- Do **not** modify other files unless explicitly asked.
- Use concise, implementation-ready language.
- Keep each file self-contained but consistent across the set.
- Include Acceptance Criteria in **each file** (so every team can test their work independently).

---

## File format (`frontend.md`, `backend.md`, `networking.md`)
```markdown
# <Plan Title> — <Domain>

## Overview
A short explanation of what this part of the plan addresses.

## Implementation Plan
- ...

## Dependencies
- ...

## Risks / Considerations
- ...

## Acceptance Criteria
- [ ] ...
- [ ] ...
```

---

## Domain Guidance

### **Frontend**
- Focus on UI/UX, components, pages, styling, and state management.
- Include expected user interactions, transitions, and validation behaviors.
- Reference relevant technologies (e.g., HTMX, TypeScript, React, Tailwind).

### **Backend**
- Describe data models, APIs, database schema changes, and service logic.
- Include validation, error handling, and testing requirements.
- Identify performance or security implications.

### **Networking / Integration**
- Define data flow between frontend and backend.
- Include protocol-level details (WebSockets, REST, gRPC, etc.).
- Mention authentication, caching, and sync mechanisms.

---

## Naming
- `<kebab-slug-of-title>` = lowercase, alphanumeric, words separated by hyphens.
- Example:
  ```
  plans/add-missile-heat-capacity/
  ├── frontend.md
  ├── backend.md
  └── networking.md
  ```

---

## Example Request

> “Create a plan for implementing missile heat capacity tiers and a craft queue.”

Copilot should then create:
```
plans/missile-heat-capacity-tiers/
├── frontend.md
├── backend.md
└── networking.md
```

Each file will describe the implementation steps, dependencies, and acceptance criteria relevant to its domain.
