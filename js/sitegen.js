// Website templates for the visual builder (pure data, no DOM).
let n = 0;
export const uid = (p = 'x') => p + (Date.now().toString(36).slice(-4)) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);

export function el(kind, props = {}, style = {}, anim = {}) {
  return { id: uid('e'), kind, props, style, anim };
}
export function section(type, name, opts = {}) {
  return { id: uid('s'), type, name, layout: opts.layout || 'stack', style: opts.style || {}, anim: opts.anim || {}, elements: opts.elements || [] };
}

export const FONTS = ['Poppins', 'Inter', 'Montserrat', 'Playfair Display', 'Lora', 'Nunito', 'Raleway', 'Space Grotesk', 'DM Sans', 'Merriweather', 'Pacifico', 'Bebas Neue', 'Roboto', 'Noto Sans Oriya'];

const pic = (seed, w = 800, h = 600) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const KINDS = {
  business: {
    label: 'Business', emoji: '💼', words: ['business', 'company', 'firm', 'consult', 'service', 'agency', 'office'],
    theme: { primary: '#2563eb', accent: '#f59e0b', bg: '#ffffff', text: '#0f172a', font: 'Inter', headingFont: 'Poppins', radius: 12 },
    headline: 'Grow your business with confidence', sub: 'Professional services that help you save time, win customers and grow faster.',
    services: [['🚀', 'Strategy', 'Clear plans that turn your goals into results.'], ['📈', 'Growth', 'Marketing and sales that bring real customers.'], ['🤝', 'Support', 'A friendly team that is always one call away.']],
    about: 'We are a passionate team helping small and growing businesses succeed since 2015.', cta: 'Get a free consultation',
  },
  restaurant: {
    label: 'Restaurant / Café', emoji: '🍽️', words: ['restaurant', 'cafe', 'café', 'coffee', 'bakery', 'food', 'pizza', 'kitchen', 'dhaba', 'hotel food', 'bistro', 'cake', 'sweet', 'tea'],
    theme: { primary: '#c2410c', accent: '#facc15', bg: '#fffaf3', text: '#2b1a0e', font: 'Nunito', headingFont: 'Playfair Display', radius: 16 },
    headline: 'Fresh food, made with love', sub: 'Handcrafted dishes, warm drinks and a cozy place to enjoy them.',
    services: [['🥐', 'Fresh Daily', 'Baked and cooked every morning with local ingredients.'], ['☕', 'Great Coffee', 'Single-origin beans roasted to perfection.'], ['🛵', 'Fast Delivery', 'Hot food at your door in 30 minutes.']],
    about: 'A family kitchen serving our neighbourhood with recipes passed down for generations.', cta: 'Book a table',
  },
  pet: {
    label: 'Pet / Vet clinic', emoji: '🐾', words: ['pet', 'vet', 'vet clinic', 'pet clinic', 'animal clinic', 'pet care', 'veterinary', 'dog', 'cat', 'animal', 'puppy', 'groom'],
    theme: { primary: '#0d9488', accent: '#f97316', bg: '#f0fdfa', text: '#0f2e2b', font: 'Nunito', headingFont: 'Poppins', radius: 20 },
    headline: 'Happy pets, healthy lives', sub: 'Caring vets, grooming and 24/7 emergency help for your furry family.',
    services: [['🩺', 'Check-ups', 'Complete health exams and vaccinations.'], ['✂️', 'Grooming', 'Baths, haircuts and nail care with gentle hands.'], ['🚑', '24/7 Emergency', 'Urgent care whenever your pet needs us.']],
    about: 'Our certified veterinarians treat every pet like our own — with patience, kindness and modern care.', cta: 'Book an appointment',
  },
  portfolio: {
    label: 'Portfolio', emoji: '🎨', words: ['portfolio', 'designer', 'photographer', 'artist', 'personal', 'resume', 'cv', 'freelance', 'developer', 'my work'],
    theme: { primary: '#7c3aed', accent: '#22d3ee', bg: '#0b0b12', text: '#f4f4f5', font: 'Inter', headingFont: 'Space Grotesk', radius: 14 },
    headline: "Hi, I'm a designer & developer", sub: 'I craft beautiful, fast and user-friendly digital experiences.',
    services: [['🎯', 'UI/UX Design', 'Interfaces people love to use.'], ['💻', 'Web Development', 'Modern, responsive websites and apps.'], ['✨', 'Branding', 'Logos and identities that stand out.']],
    about: 'I turn ideas into products. I have worked with startups and brands to design and build websites, apps and identities.', cta: 'Hire me',
  },
  fitness: {
    label: 'Gym / Fitness', emoji: '💪', words: ['gym', 'fitness', 'yoga', 'trainer', 'workout', 'crossfit', 'sport'],
    theme: { primary: '#ef4444', accent: '#facc15', bg: '#0a0a0a', text: '#fafafa', font: 'Montserrat', headingFont: 'Bebas Neue', radius: 8 },
    headline: 'Stronger every day', sub: 'Expert trainers, modern equipment and classes for every level.',
    services: [['🏋️', 'Strength', 'Build muscle with guided programs.'], ['🧘', 'Yoga', 'Flexibility, balance and calm.'], ['🥗', 'Nutrition', 'Meal plans that fuel your goals.']],
    about: 'Join a community that pushes you to be your best — no judgement, only progress.', cta: 'Start free trial',
  },
  salon: {
    label: 'Salon / Spa', emoji: '💇', words: ['salon', 'spa', 'beauty', 'barber', 'makeup', 'nail', 'parlour', 'parlor'],
    theme: { primary: '#db2777', accent: '#fbbf24', bg: '#fff7fb', text: '#3b0a24', font: 'Lora', headingFont: 'Playfair Display', radius: 24 },
    headline: 'Look good, feel amazing', sub: 'Hair, skin and spa treatments by award-winning stylists.',
    services: [['💇‍♀️', 'Hair Styling', 'Cuts, colour and treatments.'], ['💅', 'Nails', 'Manicure, pedicure and nail art.'], ['🧖', 'Spa', 'Relaxing massages and facials.']],
    about: 'A calm, luxurious space where you can relax while our experts take care of you.', cta: 'Book now',
  },
  shop: {
    label: 'Online store', emoji: '🛍️', words: ['shop', 'store', 'ecommerce', 'e-commerce', 'boutique', 'clothing', 'fashion', 'products', 'sell'],
    theme: { primary: '#111827', accent: '#10b981', bg: '#ffffff', text: '#111827', font: 'DM Sans', headingFont: 'Poppins', radius: 12 },
    headline: 'New collection is here', sub: 'Quality products, honest prices and free shipping on every order.',
    services: [['🚚', 'Free Shipping', 'On all orders, every day.'], ['↩️', 'Easy Returns', '30-day no-questions return policy.'], ['🔒', 'Secure Payment', 'UPI, cards and cash on delivery.']],
    about: 'We handpick every product so you get the best quality at the best price.', cta: 'Shop now',
  },
  education: {
    label: 'Education / Course', emoji: '🎓', words: ['school', 'course', 'tutor', 'coaching', 'academy', 'education', 'class', 'learn', 'college', 'institute'],
    theme: { primary: '#4f46e5', accent: '#f59e0b', bg: '#f8fafc', text: '#1e1b4b', font: 'Nunito', headingFont: 'Poppins', radius: 16 },
    headline: 'Learn skills that change your life', sub: 'Live classes, expert teachers and certificates that matter.',
    services: [['📚', 'Expert Courses', 'Structured lessons from industry experts.'], ['👩‍🏫', 'Live Classes', 'Ask questions and learn together.'], ['🏆', 'Certificates', 'Show the world what you can do.']],
    about: 'Thousands of students have upgraded their careers with our practical, affordable courses.', cta: 'Enroll today',
  },
  event: {
    label: 'Wedding / Event', emoji: '💍', words: ['wedding', 'event', 'party', 'conference', 'birthday', 'marriage', 'festival', 'meetup'],
    theme: { primary: '#b45309', accent: '#e11d48', bg: '#fffbf5', text: '#3f2a14', font: 'Lora', headingFont: 'Pacifico', radius: 18 },
    headline: 'Celebrate the moments that matter', sub: 'Join us for a day full of love, music and memories.',
    services: [['📅', 'Date', 'Saturday, 12 December 2026'], ['📍', 'Venue', 'Royal Garden, Bhubaneswar'], ['🎶', 'Celebration', 'Dinner, music and dancing']],
    about: 'We would be honoured to celebrate this special day with you and your family.', cta: 'RSVP now',
  },
  travel: {
    label: 'Travel / Hotel', emoji: '✈️', words: ['travel', 'tour', 'hotel', 'resort', 'trip', 'holiday', 'homestay', 'tourism'],
    theme: { primary: '#0284c7', accent: '#f97316', bg: '#f0f9ff', text: '#0c2a3e', font: 'Inter', headingFont: 'Montserrat', radius: 18 },
    headline: 'Your next adventure starts here', sub: 'Handpicked trips, cozy stays and memories for a lifetime.',
    services: [['🏝️', 'Beach Escapes', 'Sun, sand and sea.'], ['🏔️', 'Mountain Trips', 'Fresh air and stunning views.'], ['🏨', 'Best Stays', 'Comfortable rooms at great prices.']],
    about: 'We plan every detail so you can simply enjoy the journey.', cta: 'Plan my trip',
  },
  medical: {
    label: 'Clinic / Doctor', emoji: '🩺', words: ['doctor', 'clinic', 'hospital', 'dental', 'dentist', 'health', 'medical', 'physio', 'pharmacy'],
    theme: { primary: '#0891b2', accent: '#22c55e', bg: '#ffffff', text: '#0f2933', font: 'Inter', headingFont: 'Poppins', radius: 14 },
    headline: 'Caring for you and your family', sub: 'Experienced doctors, modern equipment and same-day appointments.',
    services: [['👨‍⚕️', 'General Care', 'Check-ups and everyday health.'], ['🦷', 'Specialists', 'Expert care when you need it.'], ['🧪', 'Lab Tests', 'Accurate results, fast.']],
    about: 'Our clinic has served the community for over 20 years with compassion and trust.', cta: 'Book appointment',
  },
  tech: {
    label: 'Startup / App', emoji: '🚀', words: ['startup', 'saas', 'app', 'software', 'tech', 'ai', 'product', 'platform', 'digital'],
    theme: { primary: '#6366f1', accent: '#22d3ee', bg: '#0b1020', text: '#e5e7eb', font: 'Inter', headingFont: 'Space Grotesk', radius: 14 },
    headline: 'The smarter way to get work done', sub: 'An all-in-one platform that automates the boring stuff so your team can focus on what matters.',
    services: [['⚡', 'Lightning fast', 'Built for speed from day one.'], ['🤖', 'AI powered', 'Smart automation that learns your workflow.'], ['🔐', 'Secure', 'Enterprise-grade privacy and security.']],
    about: 'Trusted by 10,000+ teams around the world.', cta: 'Get started free',
  },
};

/** Detect the kind of website and the brand name from a prompt. */
export function detectKind(text) {
  const t = ` ${String(text).toLowerCase()} `;
  let best = 'business'; let score = 0;
  for (const [k, v] of Object.entries(KINDS)) {
    for (const w of v.words) {
      const re = new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (re.test(t) && w.length > score) { best = k; score = w.length; }
    }
  }
  return best;
}

export function extractName(text) {
  const s = String(text);
  let m = s.match(/\b(?:called|named|name is|name it|titled)\s+["“']?([^"”'.,!\n]{2,40})/i);
  if (m) return tidy(m[1]);
  m = s.match(/["“']([^"”']{2,40})["”']/);
  if (m) return tidy(m[1]);
  return '';
}
const tidy = (x) => x.trim().replace(/\s+(website|site|app|with|and|for)\b.*$/i, '').replace(/\b\w/g, (c) => c.toUpperCase());

function navSection(name, k) {
  return section('navbar', 'Navbar', {
    layout: 'stack', style: { bg: k.theme.bg, padY: 14, sticky: true, shadow: true },
    elements: [el('nav', { brand: `${k.emoji} ${name}`, links: [{ text: 'Home', href: '#hero' }, { text: 'Services', href: '#services' }, { text: 'About', href: '#about' }, { text: 'Gallery', href: '#gallery' }, { text: 'Contact', href: '#contact' }], cta: k.cta, ctaHref: '#contact' })],
  });
}

export const SECTION_LIBRARY = {
  navbar: { label: 'Navbar', icon: '🧭', make: (name, k) => navSection(name, k) },
  hero: {
    label: 'Hero', icon: '🦸', make: (name, k) => section('hero', 'Hero', {
      layout: 'split', style: { padY: 110, bgGradient: true, minH: 560, align: 'left' }, anim: { bgEffect: 'gradient-shift' },
      elements: [
        el('text', { text: `Welcome to ${name}` }, { color: k.theme.primary, weight: 700, fontSize: 15, letterSpacing: 2, upper: true }, { in: 'fade-down', dur: 0.7 }),
        el('heading', { text: k.headline, level: 1 }, { fontSize: 56 }, { in: 'fade-up', dur: 0.9, delay: 0.1 }),
        el('text', { text: k.sub }, { fontSize: 19, opacity: 0.85 }, { in: 'fade-up', dur: 0.9, delay: 0.25 }),
        el('button', { text: k.cta, href: '#contact', variant: 'solid' }, {}, { in: 'zoom-in', delay: 0.4, hover: 'lift' }),
        el('button', { text: 'Learn more', href: '#about', variant: 'outline' }, {}, { in: 'zoom-in', delay: 0.5, hover: 'lift' }),
        el('icon', { text: k.emoji }, { fontSize: 180, col: 1 }, { in: 'zoom-in', dur: 1, delay: 0.2, loop: 'float' }),
      ],
    }),
  },
  features: {
    label: 'Services / Features', icon: '⭐', make: (name, k) => section('features', 'Services', {
      layout: 'grid3', style: { padY: 90 },
      elements: [
        el('heading', { text: 'What we offer', level: 2 }, { align: 'center', span: true }, { in: 'fade-up' }),
        el('text', { text: `Everything you need from ${name}, in one place.` }, { align: 'center', span: true, opacity: 0.75 }, { in: 'fade-up', delay: 0.1 }),
        ...k.services.map(([icon, title, text], i) => el('card', { icon, title, text }, {}, { in: 'fade-up', delay: 0.15 * i, hover: 'lift' })),
      ],
    }),
  },
  about: {
    label: 'About', icon: '📖', make: (name, k) => section('about', 'About', {
      layout: 'split', style: { padY: 90, bgAlt: true },
      elements: [
        el('image', { src: pic(`${k.label.split(' ')[0]}-about`), alt: 'About us' }, { radius: 24, col: 0, shadow: true }, { in: 'from-left', dur: 1 }),
        el('heading', { text: `About ${name}`, level: 2 }, { col: 1 }, { in: 'from-right' }),
        el('text', { text: k.about }, { col: 1, fontSize: 18, opacity: 0.85 }, { in: 'from-right', delay: 0.15 }),
        el('stats', { items: [['10+', 'Years'], ['5k+', 'Happy customers'], ['4.9★', 'Rating']] }, { col: 1 }, { in: 'fade-up', delay: 0.3 }),
      ],
    }),
  },
  gallery: {
    label: 'Gallery', icon: '🖼️', make: (name, k) => section('gallery', 'Gallery', {
      layout: 'grid3', style: { padY: 90 },
      elements: [
        el('heading', { text: 'Gallery', level: 2 }, { align: 'center', span: true }, { in: 'fade-up' }),
        ...[1, 2, 3, 4, 5, 6].map((i) => el('image', { src: pic(`${k.label.split(' ')[0]}-${i}`, 600, 450), alt: `Photo ${i}` }, { radius: 16 }, { in: 'zoom-in', delay: 0.08 * i, hover: 'grow' })),
      ],
    }),
  },
  video: {
    label: 'Video', icon: '🎬', make: () => section('video', 'Video', {
      layout: 'stack', style: { padY: 90, bgAlt: true, align: 'center' },
      elements: [
        el('heading', { text: 'See us in action', level: 2 }, { align: 'center' }, { in: 'fade-up' }),
        el('video', { src: '', poster: '' }, { radius: 20, width: 80, shadow: true }, { in: 'zoom-in', delay: 0.1 }),
      ],
    }),
  },
  testimonials: {
    label: 'Testimonials', icon: '💬', make: () => section('testimonials', 'Testimonials', {
      layout: 'grid3', style: { padY: 90 },
      elements: [
        el('heading', { text: 'What people say', level: 2 }, { align: 'center', span: true }, { in: 'fade-up' }),
        el('quote', { text: 'Absolutely amazing service. Highly recommended to everyone!', author: 'Priya S.', rating: 5 }, {}, { in: 'fade-up', hover: 'lift' }),
        el('quote', { text: 'Friendly people and great quality. I keep coming back.', author: 'Rahul M.', rating: 5 }, {}, { in: 'fade-up', delay: 0.15, hover: 'lift' }),
        el('quote', { text: 'Fast, professional and affordable. Five stars!', author: 'Ananya P.', rating: 5 }, {}, { in: 'fade-up', delay: 0.3, hover: 'lift' }),
      ],
    }),
  },
  pricing: {
    label: 'Pricing', icon: '💳', make: () => section('pricing', 'Pricing', {
      layout: 'grid3', style: { padY: 90, bgAlt: true },
      elements: [
        el('heading', { text: 'Simple pricing', level: 2 }, { align: 'center', span: true }, { in: 'fade-up' }),
        el('price', { name: 'Basic', price: '₹499', per: '/month', features: ['Essential features', 'Email support'], cta: 'Choose' }, {}, { in: 'fade-up', hover: 'lift' }),
        el('price', { name: 'Pro', price: '₹999', per: '/month', features: ['Everything in Basic', 'Priority support', 'Extra features'], cta: 'Choose', featured: true }, {}, { in: 'fade-up', delay: 0.15, hover: 'lift' }),
        el('price', { name: 'Premium', price: '₹1999', per: '/month', features: ['Everything in Pro', 'Dedicated manager'], cta: 'Choose' }, {}, { in: 'fade-up', delay: 0.3, hover: 'lift' }),
      ],
    }),
  },
  cta: {
    label: 'Call to action', icon: '📣', make: (name, k) => section('cta', 'Call to action', {
      layout: 'stack', style: { padY: 80, bg: k.theme.primary, color: '#ffffff', align: 'center' }, anim: { bgEffect: 'gradient-shift' },
      elements: [
        el('heading', { text: 'Ready to get started?', level: 2 }, { align: 'center', color: '#ffffff' }, { in: 'zoom-in' }),
        el('text', { text: `Join hundreds of happy customers of ${name} today.` }, { align: 'center', color: '#ffffff', opacity: 0.9 }, { in: 'fade-up', delay: 0.1 }),
        el('button', { text: k.cta, href: '#contact', variant: 'light' }, {}, { in: 'zoom-in', delay: 0.2, loop: 'pulse', hover: 'grow' }),
      ],
    }),
  },
  contact: {
    label: 'Contact', icon: '✉️', make: () => section('contact', 'Contact', {
      layout: 'split', style: { padY: 90 },
      elements: [
        el('heading', { text: 'Get in touch', level: 2 }, { col: 0 }, { in: 'fade-up' }),
        el('text', { text: '📍 Main Road, Bhubaneswar, Odisha\n📞 +91 98765 43210\n✉️ hello@example.com\n🕘 Mon–Sat, 9am – 8pm' }, { col: 0, fontSize: 17, lineHeight: 2 }, { in: 'fade-up', delay: 0.1 }),
        el('form', { fields: ['Your name', 'Email or phone', 'Message'], button: 'Send message', email: '' }, { col: 1 }, { in: 'from-right', delay: 0.1 }),
      ],
    }),
  },
  footer: {
    label: 'Footer', icon: '🦶', make: (name, k) => section('footer', 'Footer', {
      layout: 'stack', style: { padY: 40, bg: '#0f172a', color: '#cbd5e1', align: 'center' },
      elements: [
        el('text', { text: `${k.emoji} ${name}` }, { align: 'center', fontSize: 20, weight: 700, color: '#ffffff' }),
        el('social', { links: [{ icon: '📘', href: '#' }, { icon: '📸', href: '#' }, { icon: '▶️', href: '#' }, { icon: '💬', href: '#' }] }, { align: 'center' }, { hover: 'grow' }),
        el('text', { text: `© ${new Date().getFullYear()} ${name}. All rights reserved.` }, { align: 'center', fontSize: 14, opacity: 0.7 }),
      ],
    }),
  },
  free: {
    label: 'Free canvas (drag anywhere)', icon: '🎨', make: (name, k) => section('free', 'Free canvas', {
      layout: 'free', style: { padY: 0, minH: 480, bgAlt: true },
      elements: [
        el('heading', { text: 'Drag me anywhere', level: 2 }, { fontSize: 42 }, { in: 'fade-up' }),
        el('shape', { shape: 'circle' }, { bg: k.theme.accent, width: 18 }, { in: 'zoom-in', loop: 'float' }),
        el('button', { text: 'A free button', href: '#', variant: 'solid' }, {}, { in: 'fade-up', delay: 0.2 }),
      ].map((e, i) => { e.pos = [{ x: 8, y: 18 }, { x: 70, y: 20 }, { x: 10, y: 60 }][i]; return e; }),
    }),
  },
};

export const ELEMENT_LIBRARY = [
  ['heading', '🔠', 'Heading', () => el('heading', { text: 'New heading', level: 2 }, {}, { in: 'fade-up' })],
  ['text', '📝', 'Text', () => el('text', { text: 'Write something amazing here.' }, {}, { in: 'fade-up' })],
  ['button', '🔘', 'Button', () => el('button', { text: 'Click me', href: '#', variant: 'solid' }, {}, { in: 'zoom-in', hover: 'lift' })],
  ['image', '🖼️', 'Image', () => el('image', { src: '', alt: 'Image' }, { radius: 12 }, { in: 'zoom-in' })],
  ['video', '🎬', 'Video', () => el('video', { src: '' }, { radius: 12 }, { in: 'zoom-in' })],
  ['card', '🃏', 'Card', () => el('card', { icon: '✨', title: 'Card title', text: 'Short description.' }, {}, { in: 'fade-up', hover: 'lift' })],
  ['icon', '😀', 'Emoji / icon', () => el('icon', { text: '⭐' }, { fontSize: 64 }, { in: 'zoom-in', loop: 'float' })],
  ['shape', '🟣', 'Shape', () => el('shape', { shape: 'circle' }, { bg: '#f59e0b', width: 20 }, { in: 'zoom-in' })],
  ['quote', '💬', 'Testimonial', () => el('quote', { text: 'Great experience!', author: 'Customer', rating: 5 }, {}, { in: 'fade-up' })],
  ['divider', '➖', 'Divider', () => el('divider', {}, {})],
  ['spacer', '↕️', 'Spacer', () => el('spacer', {}, { height: 40 })],
  ['form', '📮', 'Contact form', () => el('form', { fields: ['Name', 'Email', 'Message'], button: 'Send' }, {}, { in: 'fade-up' })],
  ['social', '🔗', 'Social icons', () => el('social', { links: [{ icon: '📘', href: '#' }, { icon: '📸', href: '#' }, { icon: '▶️', href: '#' }] }, {})],
  ['map', '🗺️', 'Map', () => el('map', { query: 'Bhubaneswar, Odisha' }, { radius: 16 }, { in: 'fade-up' })],
];

/** Create a full website from a prompt like "make a website for my bakery called Sweet Crumbs". */
export function generateSite(prompt = '', forcedKind) {
  const kind = forcedKind || detectKind(prompt);
  const k = KINDS[kind];
  const name = extractName(prompt) || defaultName(kind);
  const order = ['navbar', 'hero', 'features', 'about', 'gallery', 'testimonials', ...(['business', 'fitness', 'education', 'tech', 'salon'].includes(kind) ? ['pricing'] : []), 'cta', 'contact', 'footer'];
  return {
    version: 1, name, kind,
    theme: { ...k.theme },
    seo: { title: name, description: k.sub },
    sections: order.map((s) => SECTION_LIBRARY[s].make(name, k)),
  };
}

function defaultName(kind) {
  return { business: 'Brightway', restaurant: 'Sweet Crumbs', pet: 'PetHealer', portfolio: 'Little Studio', fitness: 'Iron Pulse', salon: 'Glow Studio', shop: 'ShopNest', education: 'GyanGuru', event: 'Our Wedding', travel: 'Wanderlust', medical: 'CareWell Clinic', tech: 'Nimbus AI' }[kind] || 'My Website';
}

export function kindProfile(site) { return KINDS[site.kind] || KINDS.business; }
