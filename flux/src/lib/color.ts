const COLORS = ["#FF6B6B", "#4ECDC4", "#FFD93D", "#1A535C", "#FF9F1C"];

export function getUserColor(email: string): string {
  let hash = 0;

  for (let index = 0; index < email.length; index += 1) {
    hash = (hash << 5) - hash + email.charCodeAt(index);
    hash |= 0;
  }

  return COLORS[Math.abs(hash) % COLORS.length];
}
