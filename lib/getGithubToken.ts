export function getGithubToken() {
  const token = process.env.MY_GITHUB_PAT?.trim();
  if (!token) {
    throw new Error(
      "Missing MY_GITHUB_PAT. Add it to .env.local (not quotes, no spaces, single line)."
    );
  }
  // Validate format/length (new PATs are typically >80 chars)
  if (token.length < 80) {
    throw new Error(
      `MY_GITHUB_PAT looks too short (length=${token.length}). Check for spaces, quotes, or line breaks.`
    );
  }
  // Minimal leak-safe debug (only prefix + length)
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[Token check] Using MY_GITHUB_PAT prefix=${token.slice(0, 12)}… length=${token.length}`
    );
  }
  return token;
}

