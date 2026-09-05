import QRCode from "qrcode";

/**
 * Renders a guardian's pickup QR as PNG bytes, in-process.
 *
 * What this replaces
 * ------------------
 * The check-in email used to embed the QR by hotlinking a third-party image
 * service:
 *
 *   https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=<qrToken>
 *
 * That put the token -- the thing that identifies who may collect a child --
 * into a URL query string sent to a company with no relationship to this
 * product, on every check-in, and then had every recipient's mail client
 * fetch it again from that company on open. Nobody chose that trade; the
 * `qrcode` package was already a dependency and simply never imported.
 *
 * Rendering here means the bytes are produced from data we already hold and
 * handed straight to the channel that needs them -- an inline `cid:`
 * attachment for email, the response body for the (PR B) media endpoint
 * WhatsApp fetches. The token never leaves this system in a URL.
 */

/** 300px: legible on a phone screen held up to a scanner, and ~2KB of PNG, which is nothing next to an email. */
const QR_SIZE_PX = 300;

export async function renderGuardianQrPng(qrToken: string): Promise<Buffer> {
  if (!qrToken || typeof qrToken !== "string") {
    throw new Error("renderGuardianQrPng: qrToken is required");
  }

  return QRCode.toBuffer(qrToken, {
    type: "png",
    width: QR_SIZE_PX,
    margin: 1,
    // "M" (~15% recovery) is the library default and the right one here: a
    // phone screen is a clean scanning surface, and a higher level would make
    // the modules smaller for no gain.
    errorCorrectionLevel: "M",
  });
}
