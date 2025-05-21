const SHORT_ID_LENGTH = 4; // Length of the new device IDs

export function generateShortId(length = SHORT_ID_LENGTH) {
  console.log(`Instance: Generating short ID of length ${length}`); // Can be verbose
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
