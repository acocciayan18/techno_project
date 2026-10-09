import {
  Mail, Phone, MessageSquare, MessageCircle, MessagesSquare, Send,
  Camera, Share2, AtSign, Globe, MapPin, Link2,
} from 'lucide-react';

// Shared catalog of public-contact field types. The server stores each field as
// a plain { type, value, show }; this file owns everything the UI needs per type:
// the Lucide icon (brand marks aren't in this Lucide build, so the label carries
// recognition and the glyph is a supporting cue), a human label, the input hint,
// how to validate the value, how to turn it into a tappable href for finders, and
// how to show it. Add a new contact type by adding one entry here — the editor and
// the public page both read from this list.

const digits = (v) => (v || '').replace(/[^\d]/g, '');
const handle = (v) => (v || '').trim().replace(/^@+/, '');
const withProto = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CONTACT_TYPES = [
  {
    type: 'email', label: 'Email', icon: Mail, placeholder: 'name@example.com',
    inputMode: 'email',
    validate: (v) => (EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email'),
    href: (v) => `mailto:${v.trim()}`,
    display: (v) => v.trim(),
  },
  {
    type: 'phone', label: 'Phone', icon: Phone, placeholder: '+1 555 123 4567',
    inputMode: 'tel',
    href: (v) => `tel:${digits(v)}`,
  },
  {
    type: 'sms', label: 'SMS', icon: MessageSquare, placeholder: '+1 555 123 4567',
    inputMode: 'tel',
    href: (v) => `sms:${digits(v)}`,
  },
  {
    type: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, placeholder: '+1 555 123 4567',
    inputMode: 'tel',
    href: (v) => `https://wa.me/${digits(v)}`,
    display: () => 'Chat on WhatsApp',
  },
  {
    type: 'messenger', label: 'Messenger', icon: MessagesSquare, placeholder: 'm.me/yourname or profile link',
    href: (v) => withProto(v.trim()),
    display: () => 'Open Messenger',
  },
  {
    type: 'telegram', label: 'Telegram', icon: Send, placeholder: '@username',
    href: (v) => `https://t.me/${handle(v)}`,
    display: (v) => `@${handle(v)}`,
  },
  {
    type: 'instagram', label: 'Instagram', icon: Camera, placeholder: '@username',
    href: (v) => `https://instagram.com/${handle(v)}`,
    display: (v) => `@${handle(v)}`,
  },
  {
    type: 'facebook', label: 'Facebook', icon: Share2, placeholder: 'facebook.com/yourname',
    href: (v) => withProto(v.trim()),
    display: () => 'View Facebook',
  },
  {
    type: 'twitter', label: 'X / Twitter', icon: AtSign, placeholder: '@username',
    href: (v) => `https://x.com/${handle(v)}`,
    display: (v) => `@${handle(v)}`,
  },
  {
    type: 'website', label: 'Website', icon: Globe, placeholder: 'example.com',
    href: (v) => withProto(v.trim()),
    display: (v) => v.trim().replace(/^https?:\/\//i, ''),
  },
  {
    type: 'address', label: 'Address', icon: MapPin, placeholder: 'Street, City, Country',
    href: (v) => `https://maps.google.com/?q=${encodeURIComponent(v.trim())}`,
    display: (v) => v.trim(),
  },
  {
    type: 'link', label: 'Other link', icon: Link2, placeholder: 'Any contact or profile link',
    href: (v) => withProto(v.trim()),
    display: () => 'Open link',
  },
];

const BY_TYPE = Object.fromEntries(CONTACT_TYPES.map((t) => [t.type, t]));
export const DEFAULT_CONTACT_TYPE = 'email';

// Always resolve to a known type so stored data from a removed type still renders.
export function getContactType(type) {
  return BY_TYPE[type] || BY_TYPE.link;
}

// '' when the value is acceptable, else a short error string. Empty is always an
// error — every shown field must carry a value.
export function validateContactValue(type, value) {
  const v = (value || '').trim();
  if (!v) return 'This field is required';
  const t = getContactType(type);
  return t.validate ? t.validate(v) : '';
}

export function contactHref(field) {
  return getContactType(field.type).href(field.value);
}

export function contactDisplay(field) {
  const t = getContactType(field.type);
  return t.display ? t.display(field.value) : field.value.trim();
}
