# Console and network verification

This dedicated test emits known browser console messages, fetches the current page with `log_verification=network_check`, and makes controlled HTTP 200 and 503 requests. It uses a local test server, so no business test cases are changed.

From the frontend directory:

```powershell
node tests/log-verification/capture.mjs
```

From the backend directory:

```powershell
.\.venv\Scripts\python.exe scripts/verify_browser_logs.py
```

The verifier checks message text and severity, request URLs and methods, response status and timing, console/network status agreement, and preservation through the execution result parser. Outputs are saved under `output/`: `trace.zip`, `console.json`, `network.json`, and `verification-summary.json`.

This verifies local capture and processing. It does not create a database execution or verify deployed evidence storage and UI downloads.
