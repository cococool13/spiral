const CODE = "That code is wrong or has expired.";
const KEY = "That license key is not valid. Copy it again from your purchase email.";
const NETWORK = "Could not reach the license server. Check the network and try again.";

export function activationError(raw: string): string {
  if (raw === CODE) {
    return "That code didn't match. Check the latest email, or send a new code.";
  }
  if (raw === KEY) {
    return "That key isn't valid. Paste it again, or use your email instead.";
  }
  if (raw === NETWORK) {
    return "Spiral couldn't reach its license server. Check your network, then try again.";
  }
  return raw;
}

export function providerError(raw: string, secret: string): string {
  if (secret.length > 0 && raw.includes(secret)) {
    return "Spiral could not save that key. Paste it again.";
  }
  return raw;
}
