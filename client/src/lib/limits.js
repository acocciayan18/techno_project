// Max lengths for user-editable text fields. Mirrors the server's TEXT_LIMITS
// (server/src/lib/constants.js) so the in-browser maxLength + counter match what
// the API will accept. The server re-validates every request regardless , these
// are a UX convenience, never the security boundary. Keep the two in sync.
export const LIMITS = {
  name: 80, // account full name (register)
  username: 20,
  itemName: 120,
  itemDescription: 1000,
  itemCategory: 60,
  recoveryInstructions: 500,
  pageTitle: 80,
  finderMessage: 400,
  contactButtonText: 40,
  contactValue: 300,
  claimNote: 500,
  recoveryEmail: 254, // RFC 5321 practical max
};
