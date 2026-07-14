#!/usr/bin/env node

import { createServer } from "node:http";

const PORT = 4000;
const AUTH_ID = "auth-v1";

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (req.method === "POST" && url.pathname.endsWith("/setup")) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const data = JSON.parse(body);
      const response = {
        authorized: true,
        authorizationId: AUTH_ID,
        evidenceMode: "real",
        cohortId: data.cohortId,
        temperatureApplied: data.temperature,
        profileApplied: data.profile,
        fixtureId: "mock-fixture-id",
        cleanupToken: "mock-cleanup-token",
        setupReceiptId: "mock-setup-receipt-id"
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname.endsWith("/cleanup")) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const data = JSON.parse(body);
      const response = {
        cleaned: true,
        captureId: data.captureId,
        cohortId: data.cohortId,
        receiptId: "mock-cleanup-receipt-id",
        cleanedAt: new Date().toISOString()
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`Mock benchmark controller running at http://localhost:${PORT}`);
});
