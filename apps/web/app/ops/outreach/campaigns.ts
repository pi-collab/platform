import type { OutreachBullet, EmailLine } from '@/lib/email-template'

/**
 * The copy and the list for the campaign currently being sent.
 *
 * Kept as a file rather than typed into the page each time: the list was
 * assembled by hand from outreach conversations, and the wording was agreed
 * before it was ever sent. Both are worth having in version control, where a
 * later "what exactly did we say to these people, and when" has an answer.
 */
export interface CampaignCopy {
  id: string
  subject: string
  heading: string
  intro: EmailLine[]
  bullets: OutreachBullet[]
  ctaUrl: string
  ctaLabel: string
  signoff: string
}

export const BEAUTY_CREATOR_CAMPAIGN: CampaignCopy = {
  id: 'beauty-creators-2026-09',
  subject: 'Beauty brands are looking for you on Guapd',
  heading: 'Brands like Kiro Beauty are looking for beauty and fashion creators like you on Guapd',
  intro: [
    'You already know how these deals usually go. A brief buried in DMs. Terms half-agreed on a call. "Just one more edit." An invoice you’re still chasing six weeks later.',
    { text: 'Guapd is where that stops.', strong: true },
  ],
  bullets: [
    { title: 'Offers arrive structured', detail: 'deliverables, price, timeline and usage rights in writing, before you say yes' },
    { title: 'Revisions agreed up front', detail: 'so an endless edit list isn’t your problem to absorb' },
    { title: 'Payment tracked from offer to paid', detail: 'you always know where your money is' },
    { title: 'Your rates, your terms', detail: 'no agency taking a cut of what you earned' },
    { title: 'One profile brands browse and book from' },
  ],
  ctaUrl: 'https://www.guapd.com/signup/creator',
  ctaLabel: 'Create your profile',
  signoff: 'Team Guapd',
}

/**
 * One per line, "email, Name". A blank name is deliberate and means the
 * greeting is a bare "Hey," — several of these addresses are brand handles
 * with no readable first name, and a guessed name is worse than none.
 */
export const BEAUTY_CREATOR_LIST = `work.vamakshi@gmail.com, Vamakshi
malavikachitoor@gmail.com, Malavika
chaitanyass1512@gmail.com, Chaitanya
vriya1401@gmail.com,
hello.yaddiary@gmail.com,
workwithsimm@gmail.com,
aayushie99@gmail.com, Aayushi
thatlilacflick@gmail.com,
palakrugvani@gmail.com, Palak
harshiharshi.rawat98@gmail.com, Harshi
anjali.singhh.13@gmail.com, Anjali
chhavinagar06@gmail.com, Chhavi
tiyasha@tistmedia.in, Tiyasha
reshikawork@gmail.com, Reshika
contactshreeyasareen@gmail.com, Shreeya
mishranjaliv27@gmail.com,
gisha2640@gmail.com, Gisha
shrutitalekarbusiness@gmail.com, Shruti
workwithshivaniparikh@gmail.com, Shivani
crazydaisies.mlr@gmail.com,
vaishnavibbusiness@gmail.com, Vaishnavi
palaknagia.0@gmail.com, Palak
shefaliit2@gmail.com, Shefali
garpita483@gmail.com,
sanjanamanujawork@gmail.com, Sanjana
khushibafna@monk-e.in, Khushi
sarasindhwani.work@gmail.com, Sara
muskaanchopra.work@gmail.com, Muskaan
akangshawork25@gmail.com, Akangsha
prittyupadhyay08@gmail.com, Pritty
honeysznn@icloud.com,
riyaupadhyayworks@gmail.com, Riya
officialsiyaa@gmail.com, Siya
ilmaworktahreem@gmail.com, Ilma
yanshu@iplix.in, Yanshu`
