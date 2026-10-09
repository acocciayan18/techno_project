// Single source of truth for the legal documents' version + metadata, shared by
// the Terms/Privacy pages and the sign-up acknowledgment. Bump LEGAL_VERSION
// whenever the policies change materially; the server records the accepted
// version against each account, so a bump lets you tell who agreed to what.
export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = 'October 9, 2026';

// Where privacy/terms questions and Data Privacy Act requests should go.
// NOTE: placeholder — replace with the operator's real monitored address
// before going live.
export const LEGAL_CONTACT_EMAIL = 'programmingcourseph@gmail.com';
