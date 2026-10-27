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
- **Load market candles** fetches a snapshot of Bitcoin/USD or Ethereum/USD from Kraken's public API, without an API key. Choose M5, M15, H1, or H4, then tap the button. The latest 180 available closed candles are scanned automatically. Tap again to refresh; this is not a streaming feed. The chart shows the fetch time and last candle close time. Saved studies retain that provenance.
- Local pattern analysis and Vibe-Trading RSI, moving averages, MACD, and Bollinger Bands.
- Chart image annotations, browser history, and exports.

The Kraken endpoint has a 10-second timeout and a 60-second server cache. Provider outages, rate limits, or regional restrictions display an error and keep your existing chart; the app does not substitute demo prices. Forex, gold, and index examples remain demo data unless you import a CSV. It does not place trades. It has no built-in subscription plan; hosting and optional AI providers can have their own costs.

Market adapter and mobile browser checks use explicit test responses. The deployed Kraken charts and Vibe-Trading 0.1.18 indicators were also confirmed in screenshots from the running site. This development environment blocks direct access to the public market providers and Render, so ongoing hosted checks cannot run here. AI analysis still needs a configured model and a successful live request. [Kraken OHLC endpoint documentation](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data/).

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

### Using your existing ChatGPT account

This uses Vibe-Trading's separate ChatGPT/Codex OAuth flow, not an OpenAI API key. It cannot automatically reuse the account signed into this chat.

1. On the host running ChartScope, set `LANGCHAIN_PROVIDER=openai-codex` and select a `LANGCHAIN_MODEL_NAME` supported by your account. `openai-codex/gpt-6-sol` is the pinned upstream project's example, not a guarantee of account access.
2. Run `npm run vibe:login` in an interactive terminal on that host. Open the official OpenAI authorization link it displays and sign in yourself. If prompted for a callback URL, paste it only into that terminal, never into this chat or GitHub.
3. The resulting credential is stored under `VIBE_TRADING_HOME/auth/openai-codex.json`. Keep this private, preserve it in private persistent storage, and do not share the same rotating credential between different running installations.
4. For a hosted app, set `API_AUTH_KEY` in its environment and enter that separate app access key in **Connection setup**. Then run an AI research request to verify account/model access.

A host with no interactive terminal cannot complete this sign-in flow, and an ephemeral host loses it on redeployment. An existing ChatGPT subscription alone does not resolve those hosting requirements. No ChatGPT login or live account analysis has been performed during the automated checks.

## Run and verify locally

Use Node 22 or later and Python with the pinned Vibe-Trading package installed. Set `CHARTSCOPE_VIBE_PYTHON` to that Python executable, then run `npm start`. Open `http://127.0.0.1:4176`.

`npm test` checks chart calculations, real Vibe-Trading indicator integration, API behavior, and access controls. With the same Python environment, `python -m unittest test_vibe_bridge.py` checks the model boundary using test doubles. No live AI account is needed for these tests.

For the optional mobile browser check, install Python Playwright in your development environment and its Chromium browser, then run `python scripts/browser_check.py`. If you use a system browser, set `CHARTSCOPE_CHROMIUM` to its executable path. The check covers market loading, provenance, saved studies, failed refreshes, a downloaded CSV imported back into the app, and switching charts during an in-flight scan. It uses explicit market/status fixtures and temporary files, with no account sign-in or AI request.

The Docker build downloads Vibe-Trading revision `b831575c5be13f0302054ca08fdd3fd6359aa1f6` and installs its hash-verified dependency lock. Build access to GitHub and PyPI is required. Upstream license and attribution are in `third_party/vibe-trading/`. Credentials and runtime state are excluded from Git.
