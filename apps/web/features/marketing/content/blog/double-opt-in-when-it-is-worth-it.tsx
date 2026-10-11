import Link from "next/link";
import type { PostSection } from "./index";

export const sections: PostSection[] = [
  { id: "how-it-works", title: "How double opt-in works" },
  { id: "what-it-buys", title: "What it buys you" },
  { id: "what-it-costs", title: "What it costs" },
  { id: "when-to-use-it", title: "When to use it" },
  { id: "confirmation-email", title: "A confirmation email that gets clicked" },
  { id: "a-middle-path", title: "A middle path" },
];

export function Body() {
  return (
    <>
      <p>
        Every signup form makes a choice about trust. Single opt-in believes
        whatever is typed into the box. Double opt-in asks the owner of the
        address to prove they meant it. The second approach produces a smaller
        list and a healthier one, and whether that trade is worth making depends
        on where your signups come from.
      </p>

      <h2 id="how-it-works">How double opt-in works</h2>
      <p>
        With single opt-in, a person submits the form and is subscribed straight
        away. With double opt-in, also called confirmed opt-in, there is one
        more step.
      </p>
      <ol>
        <li>The person submits the form.</li>
        <li>
          They are stored as pending and receive one email with a confirmation
          link.
        </li>
        <li>
          When they click the link, they become a subscriber. If they never
          click, they receive nothing else.
        </li>
      </ol>
      <p>
        The click proves two things at once: the address exists, and the person
        who controls it wants your email.
      </p>
      <figure>
        <figcaption>What a confirmed subscriber record holds</figcaption>
        <pre>{`email          dana@example.com
source         newsletter form, /blog
signed_up_at   2026-09-14T09:12:04Z
confirmed_at   2026-09-14T09:13:37Z
status         subscribed`}</pre>
      </figure>

      <h2 id="what-it-buys">What it buys you</h2>
      <ul>
        <li>
          <strong>Fewer dead addresses.</strong> Typos and made-up addresses
          never confirm, so they never reach your list or bounce on your first
          campaign.
        </li>
        <li>
          <strong>Protection from bots.</strong> Automated scripts fill in
          public forms, sometimes with real addresses that belong to other
          people. Without confirmation, those people get mail they never asked
          for, and some of them report it as spam.
        </li>
        <li>
          <strong>Nobody is signed up by someone else.</strong> A person can
          only be subscribed from their own inbox.
        </li>
        <li>
          <strong>A record of consent.</strong> You hold a timestamp for the
          signup and another for the confirmation. That is useful if a
          subscriber or a regulator ever asks how an address got onto your list.
        </li>
        <li>
          <strong>A more engaged list.</strong> People who took a second step to
          subscribe tend to open and click more, and mailbox providers notice
          how recipients react when deciding where your mail lands.
        </li>
      </ul>

      <h2 id="what-it-costs">What it costs</h2>
      <p>
        Some real, interested people will not confirm. The email arrives while
        they are busy, or it lands in a promotions tab or the spam folder, or
        they assume the form already did the job. Each of them is a subscriber
        you would have had under single opt-in.
      </p>
      <p>
        How many you lose depends on your audience and on how well the
        confirmation step is built, so measure it for your own forms: compare
        the number of signups with the number of confirmations over a few weeks.
        The other cost is a slower start. Your list grows more gradually at
        exactly the stage when a big number feels encouraging.
      </p>
      <aside>
        <p>
          The honest comparison is between confirmed subscribers and the single
          opt-in subscribers who would still be reachable and reading after a
          few months. That gap is smaller than the gap between the raw signup
          counts.
        </p>
      </aside>

      <h2 id="when-to-use-it">When to use it</h2>
      <p>Double opt-in earns its place in these situations.</p>
      <ul>
        <li>
          Your form is public and you see signups that look automated or
          addresses that bounce.
        </li>
        <li>
          You offer something in exchange for an address, such as a download, a
          discount, or a giveaway entry. Incentives attract throwaway addresses.
        </li>
        <li>
          Your sending domain is new, or its reputation has taken a hit, and you
          cannot afford bounces and complaints.
        </li>
        <li>
          You collect addresses in person or on paper, where transcription
          mistakes are common.
        </li>
        <li>
          You send to people in places where the law expects you to be able to
          show consent. Email and privacy laws differ between countries, so
          check the rules that apply to you.
        </li>
      </ul>
      <p>Single opt-in is a reasonable choice in other cases.</p>
      <ul>
        <li>
          The address is already verified, for example because the person
          created an account and confirmed it, or just received a receipt there.
        </li>
        <li>
          Signups arrive slowly from a source you trust, and your bounce and
          complaint numbers stay low.
        </li>
      </ul>

      <h2 id="confirmation-email">A confirmation email that gets clicked</h2>
      <p>
        Most of the loss from double opt-in happens in this one email, so it
        deserves more attention than it usually gets.
      </p>
      <ul>
        <li>Send it within seconds of the signup, while the tab is open.</li>
        <li>
          Use a subject line that says what to do, such as &quot;Confirm your
          subscription to Northwind Weekly&quot;.
        </li>
        <li>
          Keep the body to one sentence and one button. Leave the welcome
          content for the email that follows the click.
        </li>
        <li>
          Change the page shown after signup to say that a confirmation email is
          on its way, and from which address.
        </li>
        <li>
          Send at most one reminder to people who have not confirmed, then stop
          writing to them.
        </li>
      </ul>

      <h2 id="a-middle-path">A middle path</h2>
      <p>
        If you stay with single opt-in, add the protections that confirmation
        would have given you. Validate the address format when the form is
        submitted, add a hidden field or a rate limit to slow down bots, send a
        welcome email immediately so that bad addresses bounce once and are
        removed, and stop mailing people who have not opened anything in a long
        time.
      </p>
      <p>
        You can also mix the two: confirmation on public forms and incentives,
        and direct subscription for customers whose address you already know is
        real. OpenCadence lets you set this for each form and keeps the consent
        record with the contact. See how signup forms, segments, and campaigns
        fit together on the{" "}
        <Link href="/features/newsletters">newsletters page</Link>.
      </p>
    </>
  );
}
