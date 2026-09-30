# The shop agent's Agent Server image (docs/ARCHITECTURE.md). Configuration comes only from the environment
# (infra/docker-compose.yml). The default command is the development server; the e2e/production runtime is Aegra.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PROJECT_ENVIRONMENT=/app/.venv PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --extra server --extra market
COPY langgraph.json ./
COPY config ./config
COPY data ./data
COPY skills ./skills
COPY src ./src
RUN uv sync --frozen --no-dev --extra server --extra market \
    && useradd --create-home --uid 10001 agent && chown -R agent /app
USER agent
EXPOSE 2024
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "2024", "--no-browser", "--no-reload"]
