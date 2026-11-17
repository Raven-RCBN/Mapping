# Existing Mapping API integration

MapIntelApp uses the existing Mapping user/session registry and estate/menu authorization. It does not run a separate database or identity service.

`remembered-session.patch` records the additive, tested and already-deployed Keep me logged in integration from 17 November 2026. It targets `apps/api/src/service/session-auth.js` and its regression tests in the parent Mapping repository. Ordinary sessions remain eight hours; explicitly remembered sessions use a rolling 30-day inactivity window. Expired, revoked or disabled access is rejected.

The current API source may already include this patch. Review the baseline before applying it; do not reapply blindly. No server deployment is needed for the UI changes in this folder. Follow the parent repository's AGENTS.md, docs/DEPLOYMENT.md and protected deployment-access runbook for future API publication. Only Malaysia 76.13.218.53 is an application deployment target.

Never add environment files, private keys, passwords, session values, production snapshots or private estate datasets to this folder.
