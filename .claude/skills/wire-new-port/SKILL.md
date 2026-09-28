---
name: wire-new-port
description: Add a new outbound capability (a new kind of external system the agent needs to call or read from) that does not fit an existing port. Use when a task needs data or an action that no current Protocol in application/ports covers.
---

1. Define the `Protocol` in `application/ports/<name>.py`. Keep it small and named for what it
   does, not for the technology behind it (`KnowledgePort`, not `ElasticsearchPort`).
2. If it returns domain data, define the value objects in `domain/models/` if they don't exist
   yet - the port's return type must be a domain type, never a raw dict or an ORM row.
3. Implement a fake/in-memory adapter first (`infrastructure/<area>/in_memory_<name>.py` or
   similar) so use cases and tests can depend on the port without any real system.
4. Wire the fake into `bootstrap/demo.py`. Add the real adapter (or a documented
   `NotImplementedError` stub referencing a new `docs/ROADMAP.md` task) and wire it into
   `bootstrap/container.py`.
5. Add the port as a constructor parameter to whichever use case needs it
   (`application/use_cases/`) - do not reach for a global/singleton.
6. Add a unit test for the fake adapter and, if a use case now depends on it, extend that use
   case's test to inject the fake and assert the new behavior.
