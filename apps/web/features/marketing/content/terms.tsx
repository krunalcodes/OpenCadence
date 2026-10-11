import Link from "next/link";
import {
  ContactLink,
  type LegalSection,
} from "@/features/marketing/components/legal-page";
import { links } from "@/features/marketing/lib/links";

const termsUpdated = "11 October 2026";

const termsSummary =
  "These terms are the agreement between you and OpenCadence for using the hosted service.";

const termsIntro = (
  <p>
    Please read these terms before you use OpenCadence. They are written in
    plain English, and the acceptable use section matters most: it sets the
    rules for the email you send.
  </p>
);

const termsSections: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>
          These terms govern your use of the hosted OpenCadence service and this
          website. By creating an account or using the service, you agree to
          them. If you do not agree, do not use the service.
        </p>
        <p>
          If you use OpenCadence on behalf of a company or another organisation,
          you confirm that you have authority to accept these terms for it, and
          "you" means that organisation. "We" and "us" mean OpenCadence.
        </p>
        <p>
          Our <Link href="/privacy">privacy policy</Link> explains how we handle
          personal data and forms part of this agreement. If we sign a separate
          written agreement with you, that agreement takes priority wherever it
          conflicts with these terms.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts",
    body: (
      <>
        <p>
          You need an account to use the service. You must be old enough to
          enter a binding contract where you live, and the information you give
          us must be accurate and kept up to date.
        </p>
        <p>
          You are responsible for everything done through your account and your
          workspaces, including by the team members you invite. Keep your
          password private, give each person their own login, assign roles that
          match what each person needs, and turn on two-factor authentication.
        </p>
        <p>
          Tell us through <ContactLink /> as soon as you suspect that someone
          has accessed your account without permission.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>
          OpenCadence sends email through your own mailboxes and providers, so
          your sending affects your reputation first. It also affects the people
          who receive your email, and these rules exist to protect them.
        </p>
        <h3>Send only to people you are allowed to email</h3>
        <ul>
          <li>
            Do not send spam. Do not send unsolicited bulk email of any kind.
          </li>
          <li>
            You must have a lawful basis for every contact you email. For
            marketing email, that usually means the contact's consent. For
            business outreach, it means a basis that the law in the recipient's
            country accepts.
          </li>
          <li>
            Do not use purchased, rented, scraped, or harvested lists, or any
            list of people who have no relationship with you and have not agreed
            to hear from you.
          </li>
          <li>
            Keep a record of how and when each contact was collected, and show
            it to us if we ask.
          </li>
        </ul>
        <h3>Follow the law and your provider's rules</h3>
        <ul>
          <li>
            Comply with the laws that apply to your sending, including the
            CAN-SPAM Act in the United States, the GDPR and ePrivacy rules in
            Europe and the United Kingdom, and CASL in Canada.
          </li>
          <li>
            Comply with the terms, sending limits, and acceptable use policies
            of every mailbox and email provider you connect.
          </li>
          <li>
            Identify yourself honestly. Do not use misleading sender names,
            subject lines, headers, or reply addresses, and include a valid
            postal address where the law requires one.
          </li>
        </ul>
        <h3>Unsubscribes are always honoured</h3>
        <p>
          Every marketing and outreach email sent through OpenCadence includes a
          working way to unsubscribe. The service records each unsubscribe,
          bounce, and spam complaint on your suppression list and stops further
          sending to that address. This handling cannot be disabled, and you
          must not try to remove it, hide it, or work around it, for example by
          importing a suppressed address again under a new list.
        </p>
        <h3>Other things you must not do</h3>
        <ul>
          <li>
            Send content that is unlawful, fraudulent, deceptive, harassing, or
            that infringes someone else's rights.
          </li>
          <li>Send phishing email, malware, or links to either.</li>
          <li>
            Use the service to disguise the origin of email or to evade a block
            that a provider or recipient has put in place.
          </li>
          <li>
            Probe, overload, or disrupt the service, or get around its limits
            and security controls.
          </li>
          <li>
            Access another customer's data, or use the service to build a
            product that copies it while relying on our hosted service to do so.
          </li>
        </ul>
        <p>
          We may review sending patterns, bounce rates, and complaint rates to
          enforce these rules, and we may ask you to explain where a list came
          from.
        </p>
      </>
    ),
  },
  {
    id: "customer-data",
    title: "Your data and who owns it",
    body: (
      <>
        <p>
          You own the content you put into OpenCadence: your contact lists,
          emails, templates, sequences, and everything else in your workspaces.
          We claim no ownership of it.
        </p>
        <p>
          You give us permission to host, copy, transmit, and display that
          content only as far as needed to run the service for you, to keep it
          secure, and to support you. This permission ends when the content is
          deleted from our systems.
        </p>
        <p>
          You are responsible for your content and for having the right to use
          it, including the right to hold and email the contacts you upload. For
          the personal data in your contact lists, you are the controller and we
          are your processor, as the <Link href="/privacy">privacy policy</Link>{" "}
          describes.
        </p>
        <p>
          You can export your data at any time while your account is open. We
          may use aggregated, anonymous statistics about how the service is used
          to operate and improve it. Those statistics never identify you or your
          contacts.
        </p>
      </>
    ),
  },
  {
    id: "connected-providers",
    title: "Connected mailboxes and providers",
    body: (
      <>
        <p>
          OpenCadence works with mailboxes and email providers that you connect.
          You choose them, you hold the accounts, and your relationship with
          each provider is your own. Their terms apply to you directly, and we
          are not a party to them.
        </p>
        <p>
          Anything your provider charges you, such as sending fees or mailbox
          subscriptions, is separate from your OpenCadence fees and is billed to
          you by that provider.
        </p>
        <p>
          By connecting a mailbox or provider, you authorise us to send,
          receive, and read email through it as far as the features you use
          require. You can disconnect it at any time, and we then delete the
          stored credentials.
        </p>
        <p>
          We are not responsible for a provider's availability, limits, pricing,
          or decisions. A provider may throttle, suspend, or close your account
          under its own rules, and that is between you and the provider.
        </p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees and billing",
    body: (
      <>
        <p>
          Some plans are free and some are paid. The current plans and what each
          includes are on <Link href={links.pricing}>the pricing page</Link>.
        </p>
        <p>
          Paid plans are billed in advance for each billing period and renew
          automatically until you cancel. You authorise us to charge your
          payment method through our payment processor for each period, along
          with any taxes that apply.
        </p>
        <p>
          You can cancel at any time from your billing settings. Cancellation
          takes effect at the end of the period you have paid for. Except where
          the law requires it, payments are not refunded for a period that has
          already started.
        </p>
        <p>
          We may change our prices. We tell account owners in advance, and a new
          price applies from your next billing period. If a payment fails, we
          try again and let you know. If it stays unpaid, we may move the
          workspace to a free plan or suspend it.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and support",
    body: (
      <>
        <p>
          We work to keep the service available and reliable, and we fix
          problems as quickly as we reasonably can. We do not promise that the
          service will be uninterrupted or free of errors.
        </p>
        <p>
          The service is sometimes unavailable for maintenance, and we schedule
          planned work to limit disruption where we can. Delivery of your email
          also depends on things outside our control, including your connected
          providers, receiving mail servers, and the wider internet.
        </p>
        <p>
          We may add, change, or remove features. If we remove a feature you
          depend on in a paid plan, we tell you in advance.
        </p>
      </>
    ),
  },
  {
    id: "suspension-termination",
    title: "Suspension and termination",
    body: (
      <>
        <p>
          You can stop using the service and close your account at any time from
          your settings.
        </p>
        <p>
          We may pause sending, suspend a workspace, or close an account if you
          break these terms, if your sending produces spam complaints or bounce
          rates that point to an unlawful or unsolicited list, if your use puts
          the service or other people at risk, if a payment stays unpaid, or if
          the law requires it. Where the situation allows, we tell you first and
          give you a chance to fix the problem. Where the harm is serious or
          ongoing, we may act at once and tell you afterwards.
        </p>
        <p>
          When an account closes, your right to use the service ends. You can
          export your data before closing. After closure we delete your data on
          the schedule set out in the{" "}
          <Link href="/privacy">privacy policy</Link>. The sections of these
          terms that by their nature should outlast the agreement continue to
          apply, including ownership, disclaimers, and limits on liability.
        </p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual property and the open-source licence",
    body: (
      <>
        <p>
          We and our licensors own the hosted service, this website, and the
          OpenCadence name, logo, and brand. These terms give you a right to use
          the hosted service while your account is open. They do not transfer
          any ownership to you, and they give you no right to use our name or
          logo without our written permission.
        </p>
        <p>
          The software is also available under the MIT licence in{" "}
          <a href={links.github} rel="noreferrer" target="_blank">
            the OpenCadence repository
          </a>
          .
        </p>
        <p>
          If you send us feedback or suggestions, we may use them without
          restriction and without owing you anything.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <>
        <p>
          The service is provided as it is and as it is available. To the
          fullest extent the law allows, we make no warranties of any kind,
          whether express or implied, including warranties of merchantability,
          fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          In particular, we do not promise that your email will reach the inbox,
          that warm-up or deliverability tools will produce a specific result,
          or that the service will meet a legal requirement that applies to you.
          Nothing in the product or on this website is legal advice. You are
          responsible for making sure your sending is lawful.
        </p>
        <p>
          Some laws do not allow certain warranties to be excluded. Where that
          applies to you, the exclusions above apply only as far as the law
          permits.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <p>To the fullest extent the law allows:</p>
        <ul>
          <li>
            we are not liable for indirect, incidental, special, consequential,
            or punitive losses, or for lost profits, revenue, goodwill, sender
            reputation, or data, however they arise;
          </li>
          <li>
            our total liability for all claims connected with the service is
            limited to the amount you paid us for the service in the 12 months
            before the event that gave rise to the claim.
          </li>
        </ul>
        <p>
          Nothing in these terms limits liability that cannot be limited by law,
          such as liability for fraud or for death or personal injury caused by
          negligence.
        </p>
        <p>
          You agree to cover our reasonable losses and costs from any
          third-party claim that arises from your content, the email you send,
          or your breach of the acceptable use rules.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms when the service or the law changes. The date
        at the top of the page shows the latest version. If a change is
        material, we tell account owners by email or inside the product before
        it takes effect. If you keep using the service after that date, you
        accept the updated terms. If you do not accept them, you can close your
        account.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law",
    body: (
      <>
        <p>
          These terms are governed by the laws of the jurisdiction where
          OpenCadence is established, and the courts of that jurisdiction have
          authority over any dispute about them. This does not remove any
          protection that the consumer law of your own country gives you and
          that cannot be waived by contract.
        </p>
        <p>
          If a court finds part of these terms unenforceable, the rest stays in
          force. If we do not enforce a term straight away, we have not given up
          the right to enforce it later. You may not transfer this agreement
          without our consent. We may transfer it as part of a merger,
          acquisition, or sale of assets.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        For questions about these terms, or to report email sent through
        OpenCadence that breaks them, reach us through <ContactLink />.
      </p>
    ),
  },
];

export { termsIntro, termsSections, termsSummary, termsUpdated };
