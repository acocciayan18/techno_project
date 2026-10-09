import LegalLayout, { Section, P, Bullets } from './LegalLayout.jsx';
import { LEGAL_CONTACT_EMAIL } from '../../lib/legal.js';

// Terms of Service for TagBack. Reflects the system's actual behavior:
// pre-generated QR stickers, activation-code proof-of-possession, owner-set
// public contact fields gated to the LOST state, and anonymous finders.
export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The rules for using TagBack. By creating an account you agree to them."
      crossLink={{ to: '/legal/privacy', label: 'Privacy Policy' }}
    >
      <Section n={1} title="About these Terms">
        <P>
          These Terms of Service (“Terms”) govern your use of TagBack, a QR-based lost &amp; found
          service (the “Service”). They form an agreement between you and the operator of TagBack
          (“we”, “us”). If you do not agree, do not use the Service.
        </P>
      </Section>

      <Section n={2} title="What TagBack is">
        <P>
          TagBack sells physical QR stickers for personal belongings. Each sticker encodes only a
          permanent web address. When someone scans it, the page shown is resolved from our database
          in real time, so the same sticker works across an item’s whole life (active, reported lost,
          and recovered).
        </P>
        <P>There are three ways people use the Service:</P>
        <Bullets items={[
          'Owners — register an account, activate a sticker, attach an item, and choose what a finder sees.',
          'Finders — scan a sticker without an account to see the public page and, when an item is reported lost, the contact details the owner chose to publish.',
          'Administrators — operate the Service: generate sticker inventory, review activation requests, and manage accounts and codes.',
        ]} />
      </Section>

      <Section n={3} title="Your account">
        <P>
          You register with a full name, a username, and a password; a recovery email is optional but
          is the only self-service way to reset a forgotten password. You agree to provide accurate
          information, keep your credentials confidential, and accept responsibility for activity
          under your account. Repeated failed logins temporarily lock an account as an anti-abuse
          measure. Tell us promptly if you suspect unauthorized use.
        </P>
      </Section>

      <Section n={4} title="Stickers, activation, and ownership">
        <P>
          Each sticker carries a secret one-time activation code printed with the product. Activating
          requires both the sticker’s id and its code — knowing the id alone (which any finder can
          see) does not grant ownership. If you do not have the code, you may submit a request for an
          administrator to review. You agree to activate only stickers you legitimately possess and
          not to claim items that are not yours. We may disable a sticker or decline a claim where
          misuse, a dispute, or a policy breach is suspected.
        </P>
      </Section>

      <Section n={5} title="Content and contact details you publish">
        <P>
          As an owner you decide what appears on an item’s public page: the item’s name, description,
          category, an optional photo, page styling, a message to finders, and which contact fields
          (such as an email address, phone number, or link) are shown. You are responsible for this
          content and confirm you have the right to publish it. You agree not to publish another
          person’s personal data without their consent, and not to post unlawful, misleading, or
          harmful content. You grant us permission to store and display this content for the purpose
          of operating the Service.
        </P>
      </Section>

      <Section n={6} title="How public pages work">
        <P>
          Contact details you mark as shown are exposed to finders only while the item is reported
          lost — or, if you deliberately turn on the “always show info” option, whenever the page is
          viewed. When an item is not lost, the public page acknowledges only that the item is
          registered. Marking an item recovered returns the page to that limited state.
        </P>
      </Section>

      <Section n={7} title="Finders">
        <P>
          Finders use the Service without an account. If you scan a sticker, any contact details shown
          are provided solely to help return the item to its owner. You agree to use them only for
          that purpose and not to harass, spam, or otherwise misuse them.
        </P>
      </Section>

      <Section n={8} title="Acceptable use">
        <Bullets items={[
          'Do not use the Service for unlawful purposes or to infringe anyone’s rights.',
          'Do not attempt to access accounts, items, or stickers that are not yours, or to bypass the activation, authorization, or privacy controls.',
          'Do not probe, scan, or disrupt the Service, or attempt to brute-force activation or login codes.',
          'Do not upload malicious content or impersonate others.',
        ]} />
      </Section>

      <Section n={9} title="Availability and disclaimer">
        <P>
          The Service is provided on an “as is” and “as available” basis. We do not guarantee that a
          lost item will be found or returned, that the Service will be uninterrupted or error-free,
          or that any particular finder will make contact. Features may change, and we may suspend or
          discontinue parts of the Service.
        </P>
      </Section>

      <Section n={10} title="Suspension and termination">
        <P>
          We may suspend or disable an account or a sticker that violates these Terms or that we
          reasonably believe is being misused. You may stop using the Service at any time and may
          request deletion of your account as described in our Privacy Policy.
        </P>
      </Section>

      <Section n={11} title="Limitation of liability">
        <P>
          To the fullest extent permitted by applicable law, we are not liable for indirect,
          incidental, or consequential damages, or for loss of or damage to items, arising from your
          use of the Service. Nothing in these Terms limits any rights you have under the law that
          cannot lawfully be limited.
        </P>
      </Section>

      <Section n={12} title="Changes to these Terms">
        <P>
          We may update these Terms from time to time. Material changes will be reflected by a new
          version and effective date on this page. Continued use after a change means you accept the
          updated Terms.
        </P>
      </Section>

      <Section n={13} title="Governing law">
        <P>
          These Terms are governed by the laws of the Republic of the Philippines, without regard to
          its conflict-of-laws rules. Disputes are subject to the jurisdiction of the competent courts
          of the Philippines.
        </P>
      </Section>

      <Section n={14} title="Contact">
        <P>
          Questions about these Terms? Reach us at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-semibold">{LEGAL_CONTACT_EMAIL}</a>.
        </P>
      </Section>
    </LegalLayout>
  );
}
