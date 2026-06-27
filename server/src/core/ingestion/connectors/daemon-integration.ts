/**
 * Connector-Daemon Integration — auto-starts enabled connectors with the
 * IngestionDaemon when gbrain serve or autopilot boots.
 *
 * Usage (from serve-http.ts or autopilot.ts):
 *   const connectorDaemon = await startConnectorIngestion(engine, logger, dispatch);
 *   // on shutdown:
 *   await connectorDaemon.stop();
 */

import type { BrainEngine } from "../../engine.ts";
import type { Logger } from "../../operations.ts";
import { IngestionDaemon, type IngestionDispatcher } from "../daemon.ts";
import { ConnectorManager } from "./manager.ts";

/**
 * Start the ingestion daemon with all enabled connectors registered.
 *
 * @param engine   BrainEngine handle for sources to read existing pages
 * @param logger   Operations logger
 * @param dispatch Where validated events go (MinionQueue or inline handler)
 * @returns        The started IngestionDaemon instance
 */
export async function startConnectorIngestion(
  engine: BrainEngine,
  logger: Logger,
  dispatch: IngestionDispatcher
): Promise<IngestionDaemon> {
  const daemon = new IngestionDaemon({ engine, logger, dispatch });

  // Load and register all enabled connectors.
  const manager = new ConnectorManager();
  const connectors = await manager.loadEnabled();

  if (connectors.length > 0) {
    logger.info(`[connectors] Registering ${connectors.length} connector(s) with ingestion daemon`);
    for (const connector of connectors) {
      try {
        daemon.register({ source: connector });
        logger.info(`[connectors] Registered: ${connector.id}`);
      } catch (err) {
        logger.warn(
          `[connectors] Failed to register ${connector.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } else {
    logger.info(
      "[connectors] No enabled connectors found. Run `gbrain connector add <service>` to configure."
    );
  }

  // Also register built-in sources if this is the first daemon start.
  // (file-watcher, inbox-folder are registered by the caller if desired)

  await daemon.start();
  logger.info("[connectors] Ingestion daemon started with connectors");

  return daemon;
}
