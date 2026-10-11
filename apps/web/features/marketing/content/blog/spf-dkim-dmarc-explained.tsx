import Link from "next/link";
import type { PostSection } from "./index";

export const sections: PostSection[] = [
  { id: "why-three-records", title: "Why there are three records" },
  { id: "spf", title: "SPF" },
  { id: "dkim", title: "DKIM" },
  { id: "dmarc", title: "DMARC" },
  { id: "rollout-order", title: "A sensible rollout order" },
  { id: "common-mistakes", title: "Common mistakes" },
];

export function Body() {
  return (
    <>
      <p>
        Email was designed without a way to prove who sent a message. Anyone can
        put your domain in the From line. SPF, DKIM, and DMARC are three DNS
        records that close that gap, and large mailbox providers now expect them
        from anyone who sends in volume. This guide explains what each one does,
        shows what the records look like, and gives an order for turning them on
        without losing legitimate mail.
      </p>

      <h2 id="why-three-records">Why there are three records</h2>
      <p>
        Each record answers a different question. SPF says which servers may
        send for your domain. DKIM proves a message was signed by your domain
        and was not changed on the way. DMARC connects the two to the address
        your reader sees, and tells receivers what to do when a message fails.
        You need all three, because each covers a weakness in the others.
      </p>

      <h2 id="spf">SPF</h2>
      <p>
        SPF, the Sender Policy Framework, is a TXT record on your domain that
        lists the servers allowed to send mail for it. When a message arrives,
        the receiving server looks up the record and checks whether the
        connecting server is on the list.
      </p>
      <figure>
        <figcaption>SPF record</figcaption>
        <pre>{`example.com.   TXT   "v=spf1 include:_spf.mailprovider.example ~all"`}</pre>
      </figure>
      <p>
        The <code>include</code> pulls in the servers your email provider
        publishes. The ending says what to do with everyone else:{" "}
        <code>~all</code> asks receivers to treat other servers with suspicion,
        and <code>-all</code> asks them to fail those servers outright.
      </p>
      <p>Three details catch people out.</p>
      <ul>
        <li>
          A domain may have only one SPF record. If you use two services, merge
          their <code>include</code> entries into a single record.
        </li>
        <li>
          Evaluating a record may trigger at most ten DNS lookups. Each{" "}
          <code>include</code> counts, and so do the lookups inside it.
        </li>
        <li>
          SPF checks the hidden envelope sender, which is the address bounces
          return to. It says nothing about the From address your reader sees,
          and it often breaks when a message is forwarded.
        </li>
      </ul>

      <h2 id="dkim">DKIM</h2>
      <p>
        DKIM, DomainKeys Identified Mail, adds a cryptographic signature to each
        message. Your sending service signs the message with a private key. You
        publish the matching public key in DNS, under a name that includes a
        selector chosen by the service. The receiver fetches the key and
        verifies the signature.
      </p>
      <figure>
        <figcaption>DKIM record, public key shortened</figcaption>
        <pre>{`s1._domainkey.example.com.   TXT   "v=DKIM1; k=rsa; p=MIIBIjANBgkqh...IDAQAB"`}</pre>
      </figure>
      <p>
        A valid signature shows two things: the domain named in the signature
        took responsibility for the message, and the signed headers and body
        arrived unchanged. Because the signature travels with the message, DKIM
        usually survives forwarding where SPF does not.
      </p>
      <p>
        Many services ask you to publish CNAME records that point to keys they
        host, so they can rotate keys for you. The effect is the same. Every
        service that sends as your domain needs its own DKIM setup with its own
        selector.
      </p>

      <h2 id="dmarc">DMARC</h2>
      <p>
        DMARC is a TXT record at <code>_dmarc</code> on your domain. It adds the
        piece the other two lack, which is alignment. A message passes DMARC
        when SPF or DKIM passes and the domain that passed matches the domain in
        the visible From address. One aligned pass is enough.
      </p>
      <figure>
        <figcaption>DMARC record, monitoring only</figcaption>
        <pre>{`_dmarc.example.com.   TXT   "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"`}</pre>
      </figure>
      <p>
        The <code>p</code> tag is your policy for mail that fails.{" "}
        <code>none</code> asks receivers to deliver as usual,{" "}
        <code>quarantine</code> asks them to treat failures as suspicious, which
        usually means the spam folder, and <code>reject</code> asks them to
        refuse the message. The <code>rua</code> tag gives an address where
        receivers send aggregate reports: daily summaries of which servers sent
        mail using your domain and whether it passed.
      </p>
      <aside>
        <p>
          Authentication proves who sent a message. Whether it reaches the inbox
          still depends on your list, your content, and how recipients react to
          your mail.
        </p>
      </aside>

      <h2 id="rollout-order">A sensible rollout order</h2>
      <p>
        The risk with DMARC is blocking your own mail. A strict policy applies
        to every system that sends as your domain, including the ones you have
        forgotten about. Roll it out in stages.
      </p>
      <ol>
        <li>
          <strong>List every sender.</strong> Your mailboxes, your marketing and
          outreach tools, your app&apos;s transactional mail, billing, support
          desk, and anything else that sends as your domain.
        </li>
        <li>
          <strong>Set up SPF and DKIM for each one.</strong> Make sure DKIM
          signs with your own domain so that it aligns.
        </li>
        <li>
          <strong>
            Publish DMARC with <code>p=none</code> and a report address.
          </strong>{" "}
          Nothing changes for your mail, and reports start arriving.
        </li>
        <li>
          <strong>Read the reports for a few weeks.</strong> Fix every
          legitimate source that fails. Sources you do not recognise are either
          forgotten systems or someone spoofing you.
        </li>
        <li>
          <strong>
            Move to <code>p=quarantine</code>.
          </strong>{" "}
          Keep watching the reports and your own delivery.
        </li>
        <li>
          <strong>
            Move to <code>p=reject</code>
          </strong>{" "}
          once legitimate mail passes consistently.
        </li>
      </ol>
      <p>
        Keep the report address after you reach the final policy. New tools get
        added, and the reports are how you find out one of them is failing.
      </p>

      <h2 id="common-mistakes">Common mistakes</h2>
      <ul>
        <li>Publishing a second SPF record when adding a new service.</li>
        <li>Stacking so many includes that SPF passes the lookup limit.</li>
        <li>
          Leaving DKIM signed with the provider&apos;s domain, which passes DKIM
          and still fails DMARC alignment.
        </li>
        <li>
          Going straight to <code>p=reject</code> without a monitoring period.
        </li>
        <li>
          Forgetting subdomains. They inherit the main policy unless you set a
          separate one with the <code>sp</code> tag or their own record.
        </li>
      </ul>
      <p>
        OpenCadence checks these records for every sending domain you connect
        and shows the exact values to publish. The{" "}
        <Link href="/features/deliverability">deliverability page</Link> shows
        how the DNS checks work. Once the records are in place, the next step
        for a new address is to{" "}
        <Link href="/blog/how-to-warm-up-a-new-mailbox">
          warm up the mailbox
        </Link>
        .
      </p>
    </>
  );
}
