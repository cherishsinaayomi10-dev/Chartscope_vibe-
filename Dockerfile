# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates git && rm -rf /var/lib/apt/lists/*
COPY requirements-vibe-lock.txt /tmp/requirements-vibe-lock.txt
RUN --mount=type=secret,id=trusted_ca_bundle \
    if [ -f /run/secrets/trusted_ca_bundle ]; then export PIP_CERT=/run/secrets/trusted_ca_bundle GIT_SSL_CAINFO=/run/secrets/trusted_ca_bundle; fi; \
    echo '5beead8adc197b006f6e26952a7a7e2076255d4aa4b50ca7abd0c56c27a4d7b8  /tmp/requirements-vibe-lock.txt' | sha256sum --check && python3 -m venv /opt/vibe && /opt/vibe/bin/pip install --no-cache-dir pip==26.2.1 && /opt/vibe/bin/pip install --no-cache-dir --require-hashes -r /tmp/requirements-vibe-lock.txt && git init -q /tmp/vibe-source && git -C /tmp/vibe-source remote add origin https://github.com/HKUDS/Vibe-Trading.git && git -C /tmp/vibe-source fetch --depth 1 origin b831575c5be13f0302054ca08fdd3fd6359aa1f6 && git -C /tmp/vibe-source checkout --detach FETCH_HEAD && test "$(git -C /tmp/vibe-source rev-parse HEAD)" = b831575c5be13f0302054ca08fdd3fd6359aa1f6 && /opt/vibe/bin/pip install --no-cache-dir --no-deps /tmp/vibe-source && rm -rf /tmp/vibe-source /tmp/requirements-vibe-lock.txt
WORKDIR /app
COPY --chown=node:node package.json server.mjs analysis.mjs vibe.mjs vibe_bridge.py vibe-login.mjs vibe-ui.js index.html workspace.html app.js app.css mark.svg ./
COPY --chown=node:node third_party/ ./third_party/
RUN mkdir -p /app/.runtime/vibe /app/.runtime/matplotlib && chown -R node:node /app/.runtime
USER node
ENV HOST=0.0.0.0 PORT=4176 NODE_ENV=production CHARTSCOPE_VIBE_PYTHON=/opt/vibe/bin/python VIBE_TRADING_HOME=/app/.runtime/vibe MPLCONFIGDIR=/app/.runtime/matplotlib PYTHONDONTWRITEBYTECODE=1
EXPOSE 4176
CMD ["node", "server.mjs"]
