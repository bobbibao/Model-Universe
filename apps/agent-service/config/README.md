# Agent configuration files

- `llm/<profile>.yaml`: model profiles for `shop_agent.llm` (roles planner, writer, judge, worker). Select one with
  `LLM_PROFILE`; see `docs/LOCAL_LLM.md`. For fast deterministic development use `simulator` and
  [the simulator guide](../../../docs/LLM_SIMULATOR.md). `LLM_EMBEDDING_PROFILE` can keep the existing knowledge
  embedding while changing chat profiles.
