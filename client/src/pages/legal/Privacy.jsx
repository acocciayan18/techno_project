import LegalLayout, { Section, P, Bullets } from './LegalLayout.jsx';
import { LEGAL_CONTACT_EMAIL } from '../../lib/legal.js';

// Privacy Policy for TagBack. Describes only data the system actually collects
// and processes, the privacy gate on public pages, the real sub-processors
// (Google Firebase/Firestore, Brevo for reset email), and data-subject rights
// under the Philippine Data Privacy Act of 2012 (RA 10173).
export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="What personal information TagBack collects, how we use it, and your rights."
      crossLink={{ to: '/legal/terms', label: 'Terms of Service' }}
    >
      <Section n={1} title="Overview">
        <P>
          This Privacy Policy explains how TagBack (“we”, “us”) handles personal information when you
          use the Service. We are the personal information controller for the data described here. We
          aim to handle personal data consistently with the Philippine Data Privacy Act of 2012 (RA
          10173), its Implementing Rules and Regulations, and relevant National Privacy Commission
          issuances.
        </P>
      </Section>

      <Section n={2} title="Information we collect">
        <P><strong>Account information.</strong> Your full name, username, password, and optional recovery email. Passwords are never stored in readable form , only a one-way cryptographic hash is kept.</P>
        <P><strong>Item information.</strong> For each registered item: a name, description, category, and an optional photo you provide.</P>
        <P><strong>Contact details you choose to publish.</strong> Contact fields you add to an item , for example an email address, phone number, or link , together with your per-field choice of whether each is shown publicly.</P>
        <P><strong>Page customization.</strong> Styling and text you set for an item’s public page, such as a template, colors, an optional logo, a page title, and a message to finders.</P>
        <P><strong>Sticker and ownership records.</strong> The sticker’s code id, its activation status, and the history of how ownership was obtained or reviewed.</P>
        <P><strong>Security and operational data.</strong> Counts of failed login attempts, temporary lockout timestamps, and hashed password-reset tokens, used to protect accounts.</P>
        <P>
          <strong>Finders.</strong> Finders scan stickers without an account. We do not require finders
          to sign in, and the Service does not create a finder profile or store a finder’s identity
          from a scan. Standard server logs may record technical request data as is typical for any
          website.
        </P>
      </Section>

      <Section n={3} title="How we use information">
        <Bullets items={[
          'To provide the Service: create and authenticate your account, activate stickers, register items, and render public pages.',
          'To display, when an item is reported lost (or when you enable “always show info”), the item details and the contact fields you marked as shown, so a finder can return your item.',
          'To let you recover a forgotten password via your recovery email.',
          'To protect the Service and accounts against abuse, such as login and activation-code lockouts.',
          'For administration: generating sticker inventory and reviewing activation requests and accounts.',
        ]} />
      </Section>

      <Section n={4} title="Legal basis for processing">
        <P>
          We process account and item data to perform our agreement with you (to provide the Service)
          and based on your consent , which you give at sign-up and each time you choose to publish a
          contact field. Security processing rests on our legitimate interest in protecting users and
          the Service. You may withdraw consent as described in “Your rights”.
        </P>
      </Section>

      <Section n={5} title="What is shown publicly, and what is not">
        <P>
          The public page is privacy-gated. Contact fields are exposed to finders only when the field
          is marked as shown <em>and</em> the item is reported lost (or you have turned on “always show
          info”). When an item is not lost, the page reveals only that the item is registered.
        </P>
        <P>
          The following are never exposed on public pages or sent to finders: your password hash,
          internal user identifiers, your recovery email, sticker activation codes, and any contact
          field you did not mark as shown. Stickers encode only the permanent URL , never your name,
          item, or contact data.
        </P>
      </Section>

      <Section n={6} title="Service providers we use">
        <P>We use a small number of third-party processors to run the Service. We do not sell your personal information.</P>
        <Bullets items={[
          'Google Firebase / Cloud Firestore , database and hosting infrastructure that stores the data described above. All access goes through our backend; direct client access to the database is denied.',
          'Brevo (email delivery) , used only to send password-reset emails to a recovery email you provide. If no email provider is configured, reset links are not sent to third parties.',
        ]} />
        <P>
          These providers process data on our behalf under their own terms. Depending on deployment,
          data may be processed on servers outside the Philippines; where that happens we rely on the
          providers’ safeguards and your consent.
        </P>
      </Section>

      <Section n={7} title="Cookies and local storage">
        <P>
          TagBack does not use advertising or tracking cookies. Your browser’s local storage holds a
          login token (to keep you signed in) and your light/dark theme preference. Clearing your
          browser storage signs you out.
        </P>
      </Section>

      <Section n={8} title="Data retention">
        <P>
          We keep account, item, customization, and contact data for as long as your account is active
          or as needed to provide the Service. Password-reset tokens expire shortly after they are
          issued. When you delete your account or ask us to erase your data, we remove or anonymize it,
          except where we must retain certain records to comply with law or resolve disputes.
        </P>
      </Section>

      <Section n={9} title="How we protect data">
        <Bullets items={[
          'Passwords are stored only as salted one-way hashes; sticker activation codes are stored only as keyed hashes and checked in constant time.',
          'Accounts and items are access-controlled so users can read and change only their own, with administrator roles separated.',
          'Repeated failed logins and bad activation-code attempts are rate-limited and locked out.',
          'All database access is mediated by our backend; direct browser access to the database is denied by security rules.',
        ]} />
        <P>No method of transmission or storage is perfectly secure, but we take reasonable measures to protect your data.</P>
      </Section>

      <Section n={10} title="Your rights">
        <P>Under the Data Privacy Act, you may, subject to its conditions:</P>
        <Bullets items={[
          'Be informed about how your personal data is processed.',
          'Access the personal data we hold about you.',
          'Correct inaccurate or incomplete data.',
          'Object to or withdraw consent for certain processing.',
          'Request erasure or blocking of your data.',
          'Request a copy of data you provided, in a portable form.',
          'Lodge a complaint with the National Privacy Commission (privacy.gov.ph).',
        ]} />
        <P>
          To exercise these rights, contact us using the details below. We may need to verify your
          identity before acting on a request.
        </P>
      </Section>

      <Section n={11} title="Children">
        <P>
          The Service is not directed to children, and we do not knowingly collect personal data from
          minors without appropriate consent. If you believe a minor has provided us data, contact us
          and we will take appropriate action.
        </P>
      </Section>

      <Section n={12} title="Changes to this Policy">
        <P>
          We may update this Policy from time to time. Material changes will be shown by a new version
          and effective date on this page. Significant changes may also be communicated through the
          Service.
        </P>
      </Section>

      <Section n={13} title="Contact us">
        <P>
          For privacy questions or to exercise your rights, contact us at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-semibold">{LEGAL_CONTACT_EMAIL}</a>.
        </P>
      </Section>
    </LegalLayout>
  );
}
