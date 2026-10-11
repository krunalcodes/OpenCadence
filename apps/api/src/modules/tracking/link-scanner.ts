const scannerPattern =
  /bot\b|bot[/;) ]|crawler|spider|scanner|proofpoint|mimecast|barracuda|symantec|trend ?micro|fireeye|forcepoint|sophos|zscaler|urldefense|safelinks|cloudmark|ironport|headless|phantomjs|python|curl\/|wget|go-http-client|java\/|okhttp|libwww|httpclient|axios|node-fetch|undici|facebookexternalhit|whatsapp|skypeuripreview|linkexpanding|embedly|bitlybot/i;

export const scannerGraceMs = 2000;

export function isLinkScanner(userAgent: string | undefined | null) {
  const value = userAgent?.trim() ?? "";
  return value === "" || scannerPattern.test(value);
}

export function isPrefetch(sentAt: Date | null, now: Date) {
  return sentAt === null || now.getTime() - sentAt.getTime() < scannerGraceMs;
}
