# syntax=docker/dockerfile:1
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first (cached layer); the app itself runs from /app.
ARG INSTALL_DEV=false
COPY pyproject.toml ./
RUN python - <<'EOF' > /tmp/requirements.txt
import os, tomllib
project = tomllib.load(open("pyproject.toml", "rb"))["project"]
deps = list(project["dependencies"])
if os.environ.get("INSTALL_DEV") == "true":
    deps += project["optional-dependencies"]["dev"]
print("\n".join(deps))
EOF
RUN pip install -r /tmp/requirements.txt

COPY . .
RUN useradd --create-home --uid 10001 app && chmod +x docker-entrypoint.sh
USER app

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
