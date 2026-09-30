# The CI agent service (docs/DEMO.md). Configuration comes only from the environment (infra/docker-compose.yml).
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY data ./data
# Editable install keeps src/ next to data/, where the container finds the SOP files.
RUN pip install --no-cache-dir -e .
EXPOSE 8000
CMD ["uvicorn", "ci_agent.interfaces.http.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
