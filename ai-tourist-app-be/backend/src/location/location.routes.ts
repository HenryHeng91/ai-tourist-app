/**
 * Location broadcast service — placeholder for Sprint 1.
 * WebSocket hub + Redis pub/sub + 10km geofence eval lands in Sprint 2/3
 * (Issue #7). REST fallback POST /groups/:id/ping also deferred.
 */
import { Router } from 'express';

export const locationRouter = Router();
// Sprint 2/3: WS hub + REST ping fallback.