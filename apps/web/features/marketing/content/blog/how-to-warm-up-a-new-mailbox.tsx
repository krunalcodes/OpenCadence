import Link from "next/link";
import type { PostSection } from "./index";

export const sections: PostSection[] = [
  { id: "what-warm-up-is", title: "What warm-up is" },
  { id: "before-you-send", title: "Before you send anything" },
  { id: "a-realistic-ramp", title: "A realistic ramp" },
  { id: "what-to-send", title: "What to send while you ramp" },
  { id: "signs-to-slow-down", title: "Signs to slow down" },
  { id: "after-the-ramp", title: "After the ramp" },
];

export function Body() {
  return (
    <>
      <p>
        A new mailbox has no sending history. Mailbox providers decide where
        your mail lands partly by looking at how an address and its domain have
        behaved in the past, and a sender with no past who suddenly sends a few
        hundred messages looks a lot like a spammer who registered a domain
        yesterday. Warm-up is how you build that history on purpose before you
        depend on it.
      </p>

      <h2 id="what-warm-up-is">What warm-up is</h2>
      <p>
        Warming up a mailbox means starting with a small number of messages a
        day and raising the number slowly, while making sure the mail you send
        gets the reactions providers read as a good sign: it is opened, it gets
        replies, and nobody marks it as spam. Over a few weeks the provider sees
        a steady sender whose mail people want, and it becomes more willing to
        accept higher volume from you.
      </p>
      <p>
        Two things are being warmed at once. The mailbox has its own reputation,
        and so does the domain behind it. A new mailbox on a domain that has
        sent good mail for years needs less care than a new mailbox on a domain
        you bought last week.
      </p>

      <h2 id="before-you-send">Before you send anything</h2>
      <p>
        Warm-up cannot fix a mailbox that is set up badly. Check these first.
      </p>
      <ul>
        <li>
          <strong>Authentication.</strong> SPF, DKIM, and DMARC should all be in
          place for the domain. Our guide to{" "}
          <Link href="/blog/spf-dkim-dmarc-explained">
            SPF, DKIM, and DMARC
          </Link>{" "}
          covers what each record does.
        </li>
        <li>
          <strong>A complete account.</strong> Give the mailbox a real name, a
          photo if your provider supports one, and a plain signature.
        </li>
        <li>
          <strong>A domain that has existed for a while.</strong> If you just
          registered the domain, plan for a slower ramp than the one below.
        </li>
        <li>
          <strong>A clean list.</strong> Decide who you will write to once the
          mailbox is ready, and remove addresses you cannot verify. Bounces
          during the first weeks do the most damage.
        </li>
      </ul>

      <h2 id="a-realistic-ramp">A realistic ramp</h2>
      <p>
        No provider publishes an official warm-up schedule, and sending limits
        vary by provider and by plan. Treat the table below as one reasonable
        shape for a single mailbox on an established domain. The numbers matter
        less than the pattern: small daily steps, the same volume on most
        working days, and a ceiling well below whatever your provider allows.
      </p>
      <figure>
        <figcaption>Example ramp, one mailbox, working days</figcaption>
        <div>
          <table>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Messages a day</th>
                <th scope="col">Who receives them</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>5 to 10</td>
                <td>Colleagues and contacts who will reply</td>
              </tr>
              <tr>
                <td>2</td>
                <td>10 to 20</td>
                <td>Known contacts, plus a few customers</td>
              </tr>
              <tr>
                <td>3</td>
                <td>20 to 30</td>
                <td>Your best-fit, verified recipients</td>
              </tr>
              <tr>
                <td>4</td>
                <td>30 to 40</td>
                <td>The same, with follow-ups included</td>
              </tr>
              <tr>
                <td>5 and later</td>
                <td>Hold, or add a few each week</td>
                <td>Your normal audience</td>
              </tr>
            </tbody>
          </table>
        </div>
      </figure>
      <p>
        Raise the number only when the previous step went well. If a week looks
        shaky, repeat it. Follow-up emails count toward the daily total, so a
        sequence with four steps uses up capacity faster than its first step
        suggests.
      </p>
      <aside>
        <p>
          When you need more volume, add mailboxes and warm each one. Several
          mailboxes sending a modest amount each are easier to keep healthy than
          one mailbox pushed to its limit.
        </p>
      </aside>

      <h2 id="what-to-send">What to send while you ramp</h2>
      <p>
        The first weeks should look like a person using email. Write to people
        who know you and ask them something they will answer. Send to recipients
        at several different mailbox providers, since each one builds its own
        view of you. Keep messages short and mostly text, with few links and no
        attachments, and hold off on tracking pixels and heavy templates until
        the mailbox has settled.
      </p>
      <p>
        Warm-up tools automate part of this. They exchange messages between a
        pool of real mailboxes, which open them, reply, and move them out of the
        spam folder if they land there. This gives a new mailbox steady positive
        activity while you bring real sending up beside it. It works best as a
        supplement, because the mail that decides your long-term reputation is
        the mail you send to your actual audience.
      </p>

      <h2 id="signs-to-slow-down">Signs to slow down</h2>
      <p>Watch for these during the ramp and afterwards.</p>
      <ul>
        <li>
          <strong>Bounces are rising.</strong> Hard bounces mean the list has
          bad addresses. Stop and clean it before sending more.
        </li>
        <li>
          <strong>Mail is deferred.</strong> Temporary errors from the receiving
          server are a direct request to send less for now.
        </li>
        <li>
          <strong>Test messages land in spam.</strong> Send to a few mailboxes
          you control at different providers and check where each one arrives.
        </li>
        <li>
          <strong>Replies drop off.</strong> If people who used to answer have
          gone quiet, your mail may no longer be reaching the inbox.
        </li>
        <li>
          <strong>Someone complains.</strong> Spam complaints weigh heavily,
          even in small numbers.
        </li>
      </ul>
      <figure>
        <figcaption>
          A typical deferral. The wording varies by provider.
        </figcaption>
        <pre>{`421 4.7.0 Temporary rate limit exceeded for this sender.
Try again later.`}</pre>
      </figure>
      <p>
        When you see one of these, drop back to the last volume that worked and
        stay there for several days. Find the cause before you climb again. In
        most cases it is the list or the message, and sending more of either
        makes the problem worse.
      </p>

      <h2 id="after-the-ramp">After the ramp</h2>
      <p>
        A warm mailbox stays warm through consistency. Send a similar amount on
        most working days and avoid sudden jumps, such as going from thirty
        messages a day to three hundred for a launch. A mailbox left idle for a
        long stretch loses some of its standing, so bring it back with a short
        ramp before you rely on it again.
      </p>
      <p>
        OpenCadence runs this routine for every mailbox you connect. See how
        warm-up, DNS checks, and sender health work on the{" "}
        <Link href="/features/deliverability">deliverability page</Link>.
      </p>
    </>
  );
}
