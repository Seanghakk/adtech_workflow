import QRCode from 'qrcode'

/**
 * Floor QR generation (Brief 058), mirroring the CMMS's own already-
 * shipped pattern (lib/assetUrlContract.ts + lib/assetQr.ts,
 * ADTECH_CMMS_Brief_029_QR_Generation) as instructed. Kept as ONE file
 * here rather than split in two: the CMMS's split exists so its phone-
 * facing camera Scan Screen (ADTECH_CMMS_Brief_030) can import the URL
 * parser without pulling the `qrcode` generation library into that
 * bundle. This brief builds no equivalent in-app scanner — a printed
 * label is opened by the PHONE'S OWN camera app, straight to this URL —
 * so that split concern doesn't exist here and isn't invented for it.
 *
 * Reuses this app's own already-established NEXT_PUBLIC_APP_URL
 * fallback convention (src/lib/telegram/messages.ts, same value) rather
 * than introducing a second one.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export function floorResolveUrl(floorId: string): string {
  return `${APP_URL}/f/${floorId}`
}

/**
 * Error correction level Q (25% recovery), not the more common M — site
 * labels get dusty, scratched, and rained on, and this payload is short
 * enough that the extra redundancy costs little in code density. margin:
 * 4 is this library's own default, made explicit so a future version
 * upgrade changing its default can't silently shrink the quiet zone.
 * Same settings as the CMMS's own generateAssetQrSvg, same reasoning.
 */
const QR_MARGIN = 4
const QR_OPTIONS = { errorCorrectionLevel: 'Q' as const, margin: QR_MARGIN }

export async function generateFloorQrSvg(floorId: string): Promise<string> {
  return QRCode.toString(floorResolveUrl(floorId), { type: 'svg', ...QR_OPTIONS })
}

/**
 * Total SVG modules per side (data + margin) for this fixed-length
 * UUID-URL payload — computed from the real encoding, NOT a copied
 * constant. The CMMS's own equivalent (ADTECH_CMMS_Brief_029) hardcodes
 * 49, correct for ITS OWN configured domain length; checked directly
 * (not assumed) that the identical number does NOT hold here —
 * NEXT_PUBLIC_APP_URL is unconfigured in this app today (same gap src/
 * lib/telegram/messages.ts already flagged), so floorResolveUrl()
 * currently falls back to the short `http://localhost:3000` origin,
 * which produces a SHORTER payload and a smaller real QR (45x45,
 * version 5 — verified by generating one and reading QRCode.create()'s
 * own module count, not guessed). Hardcoding the CMMS's 49 here would
 * have silently mis-sized every printed label's mm/module caption.
 * Computed once per call (cheap, synchronous, no network — QRCode.
 * create() is the same encoding step toString() runs internally, just
 * stopped before SVG serialization) from a representative UUID: every
 * real floor id is the same 36-character length, so any valid UUID
 * yields the same module count as any other. Used to size the print
 * presets in FloorLabelsPrint.tsx.
 */
export function floorQrTotalModules(): number {
  const data = QRCode.create(floorResolveUrl('00000000-0000-0000-0000-000000000000'), QR_OPTIONS)
  return data.modules.size + 2 * QR_MARGIN
}
