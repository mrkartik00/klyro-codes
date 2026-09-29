import { LegalLayout } from '../components/LegalLayout.jsx';

export function Privacy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        Klyro respects your privacy. We collect only the information you provide
        through our enquiry forms — your name, email, optional company and the
        details of your project — and use it solely to respond to your request.
      </p>
      <h2>What we collect</h2>
      <p>
        Contact details submitted via forms, and basic analytics about how
        proposal pages are viewed. We do not sell your data.
      </p>
      <h2>How we use it</h2>
      <p>
        To reply to enquiries, deliver proposals, and improve our services. We
        retain enquiry data only as long as needed for these purposes.
      </p>
      <h2>Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your data at
        any time by contacting us.
      </p>
    </LegalLayout>
  );
}

export default Privacy;
