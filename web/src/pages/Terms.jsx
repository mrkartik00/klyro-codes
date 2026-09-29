import { LegalLayout } from '../components/LegalLayout.jsx';

export function Terms() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These terms govern your use of the Klyro website and any proposals we
        share with you. By using this site you agree to them.
      </p>
      <h2>Use of the site</h2>
      <p>
        You may browse and submit enquiries in good faith. Do not attempt to
        disrupt, scrape or misuse the site or its forms.
      </p>
      <h2>Proposals</h2>
      <p>
        Proposal pages are provided for the recipient only and may expire. They
        do not constitute a binding contract until a separate agreement is
        signed.
      </p>
      <h2>Liability</h2>
      <p>
        The site is provided “as is”. Klyro is not liable for indirect or
        consequential damages arising from its use.
      </p>
    </LegalLayout>
  );
}

export default Terms;
