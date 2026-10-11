import Link from "next/link";
import {
  ContactLink,
  type LegalSection,
} from "@/features/marketing/components/legal-page";

const privacyUpdated = "11 October 2026";

const privacySummary =
  "This policy explains what personal data OpenCadence handles, why we handle it, and the choices you have.";

const privacyIntro = (
  <p>
    We have written this policy in plain English. If anything in it is unclear,
    ask us through <ContactLink /> and we will explain.
  </p>
);

const privacySections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what this policy covers",
    body: (
      <>
        <p>
          OpenCadence is email marketing and outreach software. Customers use it
          to send newsletters and campaigns, run outreach sequences, send
          transactional email, warm up mailboxes, and monitor deliverability,
          using mailboxes and email providers that they connect themselves.
        </p>
        <p>
          This policy covers the hosted OpenCadence service, this website, and
          our communications with you. In this policy, "we" and "us" mean
          OpenCadence, "customer" means a person or organisation with an
          OpenCadence account, and "contact" means a person whose details a
          customer stores in OpenCadence or sends email to through it.
        </p>
        <p>
          This policy does not cover copies of the OpenCadence software that
          someone runs on their own infrastructure. Whoever operates that copy
          is responsible for the data in it.
        </p>
      </>
    ),
  },
  {
    id: "our-roles",
    title: "Our two roles",
    body: (
      <>
        <p>
          Data protection law treats us differently depending on whose data we
          are handling and who decides how it is used.
        </p>
        <h3>When we are a processor</h3>
        <p>
          Customers upload contact lists, write emails, and send them through
          OpenCadence. For that contact data, the customer is the controller: it
          decides who to email, what to send, and on what legal basis. We are a
          processor. We handle that data only to provide the service and only on
          the customer's instructions, which include these terms, the settings
          the customer chooses, and any data processing agreement between us.
        </p>
        <p>
          If you received an email sent through OpenCadence and you want to know
          why, or want it to stop, the sender is the right party to ask. Every
          marketing and outreach email sent through OpenCadence carries an
          unsubscribe link that works without contacting anyone.
        </p>
        <h3>When we are a controller</h3>
        <p>
          We are the controller for data about our own customers and website
          visitors: account details, billing records, support conversations, and
          website usage. We decide how that data is used, and the rest of this
          policy describes those decisions.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <h3>Account details</h3>
        <p>
          Your name, email address, password (stored as a hash, never in
          readable form), workspace name, role, two-factor authentication
          settings, and the preferences you set.
        </p>
        <h3>Billing details</h3>
        <p>
          Payments are handled by a payment processor. Card numbers and bank
          details go directly to that processor and never reach our servers. We
          keep a record of your plan, invoices, billing contact, tax details you
          give us, and a short reference to your payment method such as the card
          type and its last four digits.
        </p>
        <h3>Workspace content</h3>
        <p>
          The things you create in OpenCadence: emails, templates, sequences,
          segments, forms, automation rules, notes, and files you upload.
        </p>
        <h3>Contact lists</h3>
        <p>
          The contact data customers upload or collect: typically names, email
          addresses, company and job details, tags, custom fields, subscription
          status, and suppression records. We hold this as a processor.
        </p>
        <h3>Engagement events</h3>
        <p>
          Records of what happens to email sent through OpenCadence: sends,
          deliveries, bounces, opens, clicks, replies, unsubscribes, and spam
          complaints, with the time of each event. Open and click events can
          include an approximate location and the type of device or mail client,
          derived from the request. We hold this as a processor.
        </p>
        <h3>Connected mailbox and provider credentials</h3>
        <p>
          When you connect a mailbox or an email provider, we store what is
          needed to send and receive on your behalf: access tokens, app
          passwords, API keys, and server settings. These credentials are
          encrypted at rest. For connected mailboxes, we read message data as
          far as the features you turn on require, for example to detect replies
          and bounces or to run warm-up.
        </p>
        <h3>Website and product usage</h3>
        <p>
          Pages viewed, features used, referring pages, browser and device type,
          IP address, and error and performance logs. We also keep an audit log
          of significant actions inside each workspace, such as sign-ins, role
          changes, and exports.
        </p>
        <h3>Messages you send us</h3>
        <p>
          Anything you send through <ContactLink /> or a support conversation,
          and our replies.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <>
        <p>We use personal data to:</p>
        <ul>
          <li>
            provide the service, including sending email through the mailboxes
            and providers you connect, tracking engagement, and applying
            unsubscribes and suppressions;
          </li>
          <li>create and secure accounts, and verify who is signing in;</li>
          <li>take payment and keep billing and tax records;</li>
          <li>answer support requests and tell you about service changes;</li>
          <li>
            detect, investigate, and stop spam, abuse, fraud, and security
            incidents;
          </li>
          <li>
            understand how the product and website are used so we can fix
            problems and improve them;
          </li>
          <li>
            send you product news if you have agreed to it or the law allows it,
            with an unsubscribe link in every message;
          </li>
          <li>meet our legal obligations and enforce our terms.</li>
        </ul>
        <p>
          Where the law asks for a legal basis, we rely on our contract with
          you, our legitimate interests in running and protecting the service,
          your consent where we ask for it, and our legal obligations.
        </p>
        <p>
          We do not sell personal data. We do not use customers' contact lists
          for our own marketing, and we do not share one customer's contacts
          with another customer.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Sharing and subprocessors",
    body: (
      <>
        <p>
          We share personal data only as far as needed, with these categories of
          recipient:
        </p>
        <ul>
          <li>
            <strong>Infrastructure providers</strong> that host the service,
            store data, and keep backups.
          </li>
          <li>
            <strong>A payment processor</strong> that takes payments and handles
            card details.
          </li>
          <li>
            <strong>Operational tools</strong> for error monitoring, logging,
            support, and sending our own service email.
          </li>
          <li>
            <strong>Analytics providers</strong> that help us understand website
            and product usage.
          </li>
          <li>
            <strong>Professional advisers</strong> such as lawyers, auditors,
            and accountants, under duties of confidentiality.
          </li>
          <li>
            <strong>Authorities</strong>, when the law requires it or when it is
            needed to protect someone's rights or safety.
          </li>
          <li>
            <strong>A successor</strong>, if OpenCadence is involved in a
            merger, acquisition, or sale of assets. This policy continues to
            apply to the data transferred.
          </li>
        </ul>
        <p>
          Providers that handle personal data for us act as our subprocessors.
          They are bound by contract to use the data only for the service they
          provide to us and to protect it. You can ask for the current list of
          subprocessors through <ContactLink />.
        </p>
        <p>
          The mailboxes and email providers that you connect are different. They
          are your own providers, chosen by you, and email you send goes to them
          on your instruction. Their handling of that data is governed by your
          agreement with them.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <>
        <p>
          We keep personal data for as long as we need it for the purposes
          above, then delete it or make it anonymous.
        </p>
        <ul>
          <li>
            <strong>Account and workspace data</strong> is kept while the
            account is open. After an account is closed, we delete it within 30
            days, and it leaves our backups within a further 90 days.
          </li>
          <li>
            <strong>Contact lists and engagement events</strong> are kept until
            the customer deletes them or closes the account. Customers can
            delete individual contacts, lists, or a whole workspace at any time.
          </li>
          <li>
            <strong>Connected credentials</strong> are deleted when you
            disconnect the mailbox or provider.
          </li>
          <li>
            <strong>Billing records</strong> are kept for as long as tax and
            accounting law requires.
          </li>
          <li>
            <strong>Security and audit logs</strong> are kept for a limited
            period needed to investigate incidents.
          </li>
        </ul>
        <p>
          Suppression records need a note. When a contact unsubscribes, the
          customer's workspace keeps a minimal record of that address so the
          contact is not emailed again. Keeping that record is how the
          unsubscribe is honoured.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>We protect data with measures built into the product:</p>
        <ul>
          <li>
            Mailbox and provider credentials are encrypted at rest, and data
            travels over encrypted connections.
          </li>
          <li>
            Workspace roles limit what each member can see and do, so access
            follows the job a person has.
          </li>
          <li>
            Two-factor authentication is available to every account, and
            workspace owners can require it.
          </li>
          <li>
            An audit log records significant actions in each workspace so that
            owners can review who did what and when.
          </li>
          <li>
            Access by our own staff is limited to people who need it to run and
            support the service.
          </li>
        </ul>
        <p>
          No system is perfectly secure. If we learn of a breach that affects
          your personal data, we tell you and the relevant authorities as the
          law requires. Customers are responsible for keeping their passwords
          private, choosing appropriate roles for their team, and securing the
          mailboxes and providers they connect.
        </p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International transfers",
    body: (
      <>
        <p>
          We and our subprocessors may store and handle personal data in
          countries other than the one you live in. Data protection laws in
          those countries can differ from yours.
        </p>
        <p>
          When we transfer personal data out of a region that restricts such
          transfers, including the European Economic Area, the United Kingdom,
          and Switzerland, we rely on a recognised legal mechanism, such as an
          adequacy decision or standard contractual clauses, and we take
          additional steps where they are needed. You can ask us for details
          through <ContactLink />.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>
          Depending on where you live, you have some or all of these rights over
          your personal data:
        </p>
        <ul>
          <li>
            <strong>Access:</strong> to know whether we hold data about you and
            to get a copy.
          </li>
          <li>
            <strong>Correction:</strong> to have inaccurate or incomplete data
            fixed.
          </li>
          <li>
            <strong>Deletion:</strong> to have your data erased where we have no
            lawful reason to keep it.
          </li>
          <li>
            <strong>Export:</strong> to receive your data in a common,
            machine-readable format.
          </li>
          <li>
            <strong>Objection:</strong> to object to how we use your data,
            including for direct marketing, and to ask us to restrict its use.
          </li>
        </ul>
        <p>
          Where we rely on your consent, you can withdraw it at any time. You
          also have the right to complain to the data protection authority where
          you live.
        </p>
        <h3>If you are a customer</h3>
        <p>
          You can see and correct most account data in your settings, export
          your workspace data, and close your account from inside the product.
          For anything else, reach us through <ContactLink />. We answer within
          the time the law allows, and we may ask you to confirm your identity
          first.
        </p>
        <h3>If you are a contact of one of our customers</h3>
        <p>
          The customer that holds your details is the controller, so your
          request goes to them. If you send it to us, we pass it to the customer
          where we can identify them and tell you that we have done so.
        </p>
        <h3>How customers handle requests from their contacts</h3>
        <p>
          OpenCadence gives customers the tools to answer these requests
          themselves. From a contact's record, a customer can export everything
          the workspace holds about that person, including profile fields and
          engagement history, and can correct any field. The erasure tool
          removes the contact and their engagement history from the workspace.
          Customers can choose to keep the address on the suppression list so
          the person is not emailed again by a later import.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <p>
          We use a small number of cookies and similar technologies on this
          website and in the product.
        </p>
        <ul>
          <li>
            <strong>Essential cookies</strong> keep you signed in, protect
            against forged requests, and remember security choices. The service
            does not work without them.
          </li>
          <li>
            <strong>Preference cookies</strong> remember settings such as your
            last workspace.
          </li>
          <li>
            <strong>Analytics cookies</strong> help us understand how the
            website is used. Where the law requires consent, we set them only
            after you agree, and you can change your choice at any time.
          </li>
        </ul>
        <p>
          You can also block or delete cookies in your browser settings.
          Blocking essential cookies stops you from signing in.
        </p>
        <p>
          Emails that customers send through OpenCadence can contain tracking
          pixels and tracked links that record opens and clicks. Customers
          control whether tracking is on, and they are responsible for telling
          their contacts about it.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        OpenCadence is a business tool and is not directed at children. We do
        not knowingly collect personal data from anyone under 16. If you believe
        a child has given us personal data, tell us through <ContactLink /> and
        we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We update this policy when the service or the law changes. The date at
        the top of the page shows the latest version. If a change materially
        affects how we handle your personal data, we tell account owners by
        email or inside the product before it takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        For questions about this policy or to exercise your rights, reach us
        through <ContactLink />. The rules for using the service are in our{" "}
        <Link href="/terms">terms of service</Link>.
      </p>
    ),
  },
];

export { privacyIntro, privacySections, privacySummary, privacyUpdated };
