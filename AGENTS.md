# Production deployment — mapping

Read `docs/DEPLOYMENT.md` before any deployment. The only application target is
Malaysia `76.13.218.53` (`srv2071562.hstgr.cloud`), as of 23 October 2026.
Never deploy this app to India `187.127.167.149` or infer SSH targets from public
DNS. The current runbook supersedes conflicting historical India instructions.
Preserve live data, users, credentials, external environment and unrelated work.
Restart only this app when needed; a Git push alone does not deploy production.
All migration data must transfer directly server-to-server; never relay through
the Mac. Temporary Docker binary helpers require `--log-driver none`.
Never commit environment secrets, private keys, production data or backups.
