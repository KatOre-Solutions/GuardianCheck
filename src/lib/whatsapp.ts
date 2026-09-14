/** Builds a `wa.me` link that opens a chat with `message` prefilled. */
export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\+/g, "")}?text=${encodeURIComponent(message)}`;
}
