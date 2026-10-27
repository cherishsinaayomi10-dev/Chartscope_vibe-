# ChartScope + Vibe-Trading

A chart workspace with local analysis and an optional AI connection. You can upload OHLC CSV data, inspect chart patterns, calculate Vibe-Trading indicators, annotate chart images, and export your work.

## Deploy from your phone

The files are already in this repository. No ZIP download or file upload is needed.

1. Open [Render](https://dashboard.render.com/) and select **New → Web Service**.
2. Connect GitHub and select **cherishsinaayomi10-dev/Chartscope_vibe-**. If it is missing, use GitHub's Render app settings to grant Render access to this repository.
3. Select branch **main**, runtime **Docker**, and leave **Root Directory** blank.
4. Choose an available instance plan and select **Deploy Web Service**. A free instance, where available, sleeps when inactive and takes time to wake up.
5. Wait for **Live**, then open the `https://…onrender.com` address shown on the service page. Select **Open workspace** to use the chart tools.

Render builds Node, Python, and the pinned Vibe-Trading dependencies automatically. Do not enter a separate build or start command for this Docker service. The health check is `/api/health`. A Render Blueprint configuration is also included in `render.yaml`.

## What works immediately

- Generated demo candles and OHLC CSV imports; demo data is labeled.
- Local pattern analysis and Vibe-Trading RSI, moving averages, MACD, and Bollinger Bands.
- Chart image annotations, browser history, and exports.

This app does not include a live market-data feed or place trades. It has no built-in subscription plan; hosting and optional AI providers can have their own costs.

## Optional AI setup

Chart tools work without an AI account. AI research and image analysis require a model connection on the server.

For an API-key provider, open **Render → your service → Environment** and set:

```text
LANGCHAIN_PROVIDER=openai
LANGCHAIN_MODEL_NAME=<model available to your API account>
OPENAI_API_KEY=<your provider API key>
API_AUTH_KEY=<a long private access key you choose for this app>
```

Save and redeploy, then enter your **API_AUTH_KEY** in the app's **Connection setup → Server access key**. Keep the provider key on Render. Do not paste either secret into GitHub or this chat. API usage is billed separately from a ChatGPT subscription.

Other options are documented in `vibe.env.example`. The upstream ChatGPT/Codex login requires an interactive terminal and has not been verified for this deployment; account and model availability vary. Render's free instance storage does not preserve local sign-in files across redeploys. Ollama requires a separately running model server.

## Run and verify locally

Use Node 22 or later and Python with the pinned Vibe-Trading package installed. Set `CHARTSCOPE_VIBE_PYTHON` to that Python executable, then run `npm start`. Open `http://127.0.0.1:4176`.

`npm test` checks chart calculations, real Vibe-Trading indicator integration, API behavior, and access controls. With the same Python environment, `python -m unittest test_vibe_bridge.py` checks the model boundary using test doubles. No live AI account is needed for these tests.

The Docker build downloads Vibe-Trading revision `b831575c5be13f0302054ca08fdd3fd6359aa1f6` and installs its hash-verified dependency lock. Build access to GitHub and PyPI is required. Upstream license and attribution are in `third_party/vibe-trading/`. Credentials and runtime state are excluded from Git.
