/**
 * Routes an uploaded message export (XML) to the right parser: Austrian
 * ERV-Rückverkehr first (Geschäftszahl, Erledigungsart, Einlangen → the
 * Zustellfiktion of § 89d Abs 2 GOG), otherwise the German beA parser.
 * Without this order the beA parser claims an ERV export (both carry a
 * Betreff) and court, GZ and the Zustelldatum are lost.
 *
 * Used by both web-api upload routes; the directory-watching connectors are
 * install-global and unusable per tenant in SaaS mode.
 */
import type { IngestionEvent } from "../types.ts";
import { BeaImportConnector } from "./bea-import.ts";
import { ErvImportConnector } from "./erv-import.ts";

export interface ParsedMessageUpload {
  kind: "erv" | "bea";
  title: string;
  event: IngestionEvent;
}

export async function parseMessageXmlUpload(
  xml: string,
  filename: string
): Promise<ParsedMessageUpload | null> {
  const erv = new ErvImportConnector({});
  if (erv.isErvXml(xml)) {
    const item = erv.parseErvXmlContent(xml, filename);
    if (item) return { kind: "erv", title: item.title, event: await erv.toIngestionEvent(item) };
  }
  const bea = new BeaImportConnector({});
  const item = bea.parseBeaXmlContent(xml, filename);
  if (!item) return null;
  return { kind: "bea", title: item.title, event: await bea.toIngestionEvent(item) };
}
