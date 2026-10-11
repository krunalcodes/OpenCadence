import type { WarmupRandom } from "./warmup.constants";
import { randomInt } from "./warmup.ramp";

export type WarmupContentContext = {
  seed: string;
  subject?: string;
};

export type WarmupContent = { subject: string; text: string };

export interface WarmupContentGenerator {
  opener(context: WarmupContentContext): WarmupContent | Promise<WarmupContent>;
  reply(context: WarmupContentContext): WarmupContent | Promise<WarmupContent>;
}

export const openerSubjects = [
  "Quick question about Thursday",
  "Notes from this morning",
  "Following up on our call",
  "Can we move the meeting?",
  "Thanks for your help",
  "Draft is ready for a look",
  "Checking in on the schedule",
  "A small change to the plan",
  "Running a little behind",
  "Agenda for next week",
  "Did you get my last message?",
  "Room for one more on the call?",
  "Sharing a quick note",
  "About the numbers you sent",
  "Timing for the handover",
  "Lunch next week?",
  "One thing I forgot to mention",
  "Feedback on the outline",
  "Confirming tomorrow",
  "Next steps from today",
  "Short update",
  "Question on the timeline",
  "Thanks for the introduction",
  "Reminder for Monday",
  "Catching up after the break",
  "Your notes were useful",
  "Availability this week",
  "Before I forget",
  "Looking over the summary",
  "A quick favour",
];

export const openerBodies = [
  "Are you still free on Thursday afternoon? I would like to go through the plan together before the end of the week. Half an hour should be enough.",
  "I wrote up my notes from this morning and they are shorter than I expected. Let me know if anything is missing from your side. I will tidy them up after lunch.",
  "It was good to talk earlier. I am following up so we do not lose track of the two points we agreed on. I will take the first one and report back next week.",
  "Something came up on my side and I need to move our meeting. Would the same time one day later work for you? Sorry for the short notice.",
  "Thank you for stepping in yesterday. It saved me a lot of time and the result was better for it. I owe you one.",
  "The draft is ready whenever you have a moment. There is no rush, the end of the week is fine. I mostly want to know whether the structure makes sense to you.",
  "I am checking where we stand on the schedule. From what I can see we are on track, but I would rather confirm with you. Tell me if anything has moved.",
  "There is one small change to the plan. We are starting a day earlier than we said, and everything else stays the same. Does that cause any trouble for you?",
  "I am running a little behind today. Could we push our chat back by an hour? If that does not suit you, tomorrow morning works as well.",
  "I am putting together the agenda for next week. Is there anything you want on the list? So far I have three items and it should be a short session.",
  "I sent a message a few days ago and I am not sure it reached you. It was nothing urgent, only a question about timing. Let me know either way.",
  "Would it be alright if a colleague joined our call? She is new to the team and it would help her to listen in. She will not need any preparation from you.",
  "I came across something this week that made me think of our conversation. I will explain when we next speak. It is a small thing, but I think you will like it.",
  "I had a look at the numbers you sent over. They match what I have, apart from one line near the end. Can we compare notes when you have ten minutes?",
  "What timing suits you for the handover? I am flexible on Tuesday and Wednesday. I would like to avoid Friday if we can.",
  "Are you around for lunch next week? It has been a while and I would like to catch up properly. Any day except Monday works for me.",
  "There is one thing I forgot to mention when we spoke. The room has changed and we are now on the second floor. Everything else is as planned.",
  "I read through the outline last night. It reads well and I only have two small suggestions. I will send them over once I have written them down clearly.",
  "I am confirming that we are still on for tomorrow. I will be there a few minutes early to set up. Let me know if your plans have changed.",
  "Thanks for your time today. I will write up the next steps and share them tomorrow. I think we covered everything we needed to.",
  "Here is a short update from my side. The first part is done and the second is about halfway. I expect to finish by the middle of next week.",
  "I have a question about the timeline. Is the end of the month still realistic for you? I can adjust on my side if you need a few more days.",
  "Thank you for the introduction last week. We spoke yesterday and it went well. I appreciate you taking the time to connect us.",
  "This is a reminder that we are meeting on Monday morning. I will bring the printed copies. Tell me if you would like me to bring anything else.",
  "I hope the break was a good one. I am back at my desk and catching up on everything I missed. Is there anything I should look at first?",
  "Your notes were very useful, thank you. I used them to prepare for this afternoon and it made a real difference. I will return the favour.",
  "What does your week look like? I have a couple of things to run past you and it should not take long. I am free most afternoons.",
  "Before I forget, the office is closed next Friday. If you need anything from me that week, Thursday is the last good day. I will be back the following Monday.",
  "I am looking over the summary now. It is clear and I agree with the conclusion. I have one question about the second section that we can cover when we talk.",
  "Could I ask a quick favour? I need a second pair of eyes on a short page of text. It should take five minutes and any time this week is fine.",
];

export const replyBodies = [
  "Thanks for letting me know. That works for me.",
  "Got it, thank you. I will take a look this afternoon and come back to you.",
  "That sounds good. Let us go with that.",
  "Thanks for the update. Nothing to add from my side for now.",
  "No problem at all. The later time suits me just as well.",
  "Yes, that is fine with me. I will put it in my calendar.",
  "Thank you, this is helpful. I will read it properly tomorrow morning.",
  "Understood. I will plan around that and tell you if anything changes.",
  "Happy to help. Send it over whenever it is ready.",
  "That makes sense. I agree with the approach you described.",
  "Thanks for following up. I had it on my list and will get to it this week.",
  "Good to hear. Let me know if you need anything else from me.",
  "I am free then, so that works. See you there.",
  "Thanks, I received it. I will reply in more detail once I have read it through.",
  "Sounds like a plan. I will wait for your next note.",
  "Of course, that is no trouble. I will sort it out on my side.",
  "Thank you for the reminder. I had the wrong day written down.",
  "Agreed. I do not have any changes to suggest.",
];

export const greetings = [
  "Hi,",
  "Hello,",
  "Hi there,",
  "Hello there,",
  "Hey,",
  "Hi again,",
  "Dear colleague,",
  "Greetings,",
];

export const signOffs = [
  "Thanks,",
  "Thank you,",
  "Best,",
  "Best wishes,",
  "Kind regards,",
  "Regards,",
  "Talk soon,",
  "Cheers,",
  "Many thanks,",
  "All the best,",
];

export const identifierFirstWords = [
  "amber",
  "ancient",
  "autumn",
  "bold",
  "brave",
  "bright",
  "calm",
  "clever",
  "copper",
  "coral",
  "crimson",
  "crisp",
  "dapper",
  "dusty",
  "eager",
  "early",
  "emerald",
  "fair",
  "gentle",
  "glad",
  "golden",
  "grand",
  "hazel",
  "hidden",
  "honest",
  "humble",
  "indigo",
  "ivory",
  "jolly",
  "keen",
  "kind",
  "lively",
  "lucky",
  "mellow",
  "merry",
  "misty",
  "modest",
  "noble",
  "olive",
  "patient",
  "plain",
  "polite",
  "proud",
  "quiet",
  "rapid",
  "rustic",
  "scarlet",
  "silent",
  "silver",
  "simple",
  "steady",
  "sunny",
  "swift",
  "tidy",
  "velvet",
  "violet",
  "warm",
  "wise",
  "witty",
  "young",
  "zesty",
  "nimble",
  "frosty",
  "sandy",
];

export const identifierSecondWords = [
  "acorn",
  "anchor",
  "arrow",
  "badger",
  "beacon",
  "birch",
  "bridge",
  "brook",
  "candle",
  "canyon",
  "cedar",
  "cliff",
  "cloud",
  "comet",
  "compass",
  "falcon",
  "feather",
  "fern",
  "field",
  "forest",
  "fox",
  "garden",
  "harbor",
  "hawk",
  "heron",
  "hill",
  "island",
  "juniper",
  "kettle",
  "lake",
  "lantern",
  "lark",
  "maple",
  "meadow",
  "mill",
  "moon",
  "orchard",
  "otter",
  "owl",
  "path",
  "pebble",
  "pine",
  "pond",
  "quill",
  "rain",
  "raven",
  "reef",
  "river",
  "robin",
  "sail",
  "shore",
  "sparrow",
  "spruce",
  "stone",
  "stream",
  "thistle",
  "trail",
  "valley",
  "willow",
  "wren",
  "harvest",
  "ridge",
  "grove",
  "tide",
];

function pick<T>(items: readonly T[], random: WarmupRandom): T {
  return items[randomInt(random, 0, items.length - 1)] as T;
}

export function seededRandom(seed: string): WarmupRandom {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateIdentifier(random: WarmupRandom) {
  return `${pick(identifierFirstWords, random)}-${pick(identifierSecondWords, random)}`;
}

export function replySubject(subject: string) {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject}`;
}

export function withIdentifier(text: string, identifier: string) {
  return `${text.trimEnd()}\n\n${identifier}`;
}

function compose(body: string, random: WarmupRandom) {
  return `${pick(greetings, random)}\n\n${body}\n\n${pick(signOffs, random)}`;
}

export class TemplateWarmupContentGenerator implements WarmupContentGenerator {
  opener(context: WarmupContentContext): WarmupContent {
    const random = seededRandom(context.seed);
    const index = randomInt(random, 0, openerSubjects.length - 1);
    return {
      subject: openerSubjects[index] as string,
      text: compose(openerBodies[index] as string, random),
    };
  }

  reply(context: WarmupContentContext): WarmupContent {
    const random = seededRandom(context.seed);
    return {
      subject: replySubject(context.subject ?? ""),
      text: compose(pick(replyBodies, random), random),
    };
  }
}
