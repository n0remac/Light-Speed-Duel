# Story System Migration – Plan Index

The original STORY migration plan has been split into three focused phases. Work through them in order to move the narrative system from the client-only implementation to the server-authoritative DAG framework.

1. **Phase 1 – DAG Foundation**  
   Prep the DAG infrastructure and player state so story nodes can exist server-side without affecting the current client flow.  
   → `plans/dag/STORY_PHASE_01_DAG_FOUNDATION.md`

2. **Phase 2 – Server Story Engine**  
   Seed story content into the DAG and drive progression on the server. Clients still render via the legacy system for this phase.  
   → `plans/dag/STORY_PHASE_02_SERVER_MIGRATION.md`

3. **Phase 3 – Client Integration & Cleanup**  
   Switch the frontend to the new payload, remove the old story engine, and validate end-to-end UX.  
   → `plans/dag/STORY_PHASE_03_CLIENT_INTEGRATION.md`

Refer to the individual phase documents for detailed tasks, exit criteria, and testing requirements.
