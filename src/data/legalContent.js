const path = require('path');
const fs = require('fs');

const LAST_UPDATED = '2026-05-21';

const readPkgVersion = (pkgPath) => {
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
};

const APP_INFO = {
  name: 'VirtualTrade',
  tagline: 'Educational paper trading',
  version: readPkgVersion(path.join(__dirname, '../../package.json')),
  webVersion: readPkgVersion(path.join(__dirname, '../../../frontend/package.json')),
  appVersion: readPkgVersion(path.join(__dirname, '../../../VirtualTradeApp/package.json')),
  lastUpdated: LAST_UPDATED,
  environment: process.env.NODE_ENV || 'development',
  complianceNote:
    'VirtualTrade is a simulation for learning. It is not a SEBI-registered broker or investment adviser.'
};

const PAGES = {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'Rules for using the educational paper-trading platform.',
    sections: [
      {
        heading: 'Agreement',
        paragraphs: [
          'VirtualTrade is an educational paper-trading platform. By creating an account or using the service you agree to these terms.',
          'No real securities are bought or sold through this platform and no real money is placed at risk in the simulator.'
        ]
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'You must provide accurate registration information and keep your credentials secure.',
          'Accounts are for learning and institutional training. Automated scraping, credential sharing, or attempts to disrupt the service may result in suspension.'
        ]
      },
      {
        heading: 'No investment advice',
        paragraphs: [
          'Market data, indices, FII/DII figures, and simulated P&L are for practice only.',
          'Nothing on VirtualTrade constitutes financial, legal, or tax advice. Consult a qualified professional before real investing.'
        ]
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'The platform is provided "as is" without warranties. We are not liable for decisions made based on simulated trades, delayed quotes, or third-party data outages.'
        ]
      }
    ]
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'How we collect, use, and protect your information.',
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'We store account details (name, email, phone optional), simulated trading activity, session tokens, notification preferences, and optional device push tokens.',
          'Trainers and administrators may view batch-level analytics for educational purposes.'
        ]
      },
      {
        heading: 'How we use data',
        paragraphs: [
          'Data powers the paper-trading experience, leaderboards, achievements, and institutional dashboards.',
          'We do not sell personal information to third-party advertisers.'
        ]
      },
      {
        heading: 'Security',
        paragraphs: [
          'Passwords are hashed. API access uses JWT with refresh rotation. Sensitive operations may require two-factor authentication.',
          'Export and delete-account tools are available in Settings for data portability and removal requests.'
        ]
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'Contact your institution administrator or platform operator for access, correction, or deletion requests.',
          'You may export your trading history as JSON from Settings.'
        ]
      }
    ]
  },
  disclaimer: {
    slug: 'disclaimer',
    title: 'Disclaimer',
    summary: 'Paper trading and educational use only.',
    sections: [
      {
        heading: 'Simulation only',
        paragraphs: [
          'VirtualTrade does not connect to a live brokerage or exchange for order routing.',
          'Balances, margins, and fills are simulated for learning.'
        ]
      },
      {
        heading: 'Market data',
        paragraphs: [
          'Quotes may be delayed or synthesized when live feeds are unavailable.',
          'Corporate actions, calendars, and bulk deals may combine live NSE data with educational placeholders.'
        ]
      },
      {
        heading: 'Performance',
        paragraphs: [
          'Past simulated performance does not guarantee future results in real markets.',
          'Lot sizes, margins, and charges are approximations for teaching—not live contract specifications.'
        ]
      }
    ]
  },
  'data-usage': {
    slug: 'data-usage',
    title: 'Data Usage Policy',
    summary: 'How simulation and analytics data is used.',
    sections: [
      {
        heading: 'Account & trading data',
        paragraphs: [
          'Profile fields, orders, holdings, positions, wallet ledger, alerts, and notifications are stored to operate the simulator.',
          'Trade history is immutable in the education model to teach audit trails.'
        ]
      },
      {
        heading: 'Analytics & gamification',
        paragraphs: [
          'Aggregated metrics power leaderboards, sector analytics, achievements, and trainer reports.',
          'Lot-based statistics help learners understand F&O-style sizing.'
        ]
      },
      {
        heading: 'Retention & deletion',
        paragraphs: [
          'Data is retained while your account is active. Delete Account in Settings deactivates login and marks the profile inactive.',
          'Administrators may retain anonymized batch statistics for compliance reporting.'
        ]
      }
    ]
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    summary: 'Session storage on web and mobile.',
    sections: [
      {
        heading: 'Essential cookies & storage',
        paragraphs: [
          'The web dashboard uses strictly necessary local storage and session cookies to keep you logged in and remember preferences.',
          'The mobile app stores tokens securely on device for authentication.'
        ]
      },
      {
        heading: 'What we do not use',
        paragraphs: [
          'We do not use third-party advertising cookies or cross-site tracking pixels on VirtualTrade.',
          'Analytics are first-party and tied to your educational account only.'
        ]
      },
      {
        heading: 'Managing cookies',
        paragraphs: [
          'You may clear browser storage to sign out. Re-login will restore session cookies as needed for the service.'
        ]
      }
    ]
  },
  licenses: {
    slug: 'licenses',
    title: 'Licenses & Attributions',
    summary: 'Open-source and data attributions.',
    sections: [
      {
        heading: 'Software',
        paragraphs: [
          'VirtualTrade is built with Node.js, Express, PostgreSQL, Redis, Next.js, React Native, and Expo.',
          'UI icons: Lucide (web) and Ionicons (mobile). Charts may use community charting libraries.'
        ]
      },
      {
        heading: 'Market data',
        paragraphs: [
          'Live quotes and corporate actions may be sourced from NSE India public endpoints via stock-nse-india when available.',
          'When live feeds fail, simulated or cached data is used and labeled in the Market screen.'
        ]
      },
      {
        heading: 'Trademarks',
        paragraphs: [
          'Exchange names, index names, and company symbols are used for identification only and remain property of their respective owners.'
        ]
      }
    ]
  }
};

const SLUG_ALIASES = {
  data_policy: 'data-usage',
  cookie_policy: 'cookies',
  datausage: 'data-usage'
};

const NAV = [
  { slug: 'terms', label: 'Terms of Service' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'disclaimer', label: 'Disclaimer' },
  { slug: 'data-usage', label: 'Data Usage' },
  { slug: 'cookies', label: 'Cookies' },
  { slug: 'licenses', label: 'Licenses' }
];

const resolveSlug = (slug) => {
  const raw = String(slug || 'disclaimer').toLowerCase();
  if (SLUG_ALIASES[raw]) return SLUG_ALIASES[raw];
  const key = raw.replace(/_/g, '-');
  return SLUG_ALIASES[key] || key;
};

const getLegalPage = (slug) => {
  const resolved = resolveSlug(slug);
  const page = PAGES[resolved];
  if (!page) return null;
  return { ...page, lastUpdated: LAST_UPDATED };
};

const getAllLegalPages = () =>
  NAV.map((n) => {
    const page = PAGES[n.slug];
    return {
      slug: n.slug,
      label: n.label,
      title: page.title,
      summary: page.summary,
      lastUpdated: LAST_UPDATED
    };
  });

const getLegalHub = () => ({
  appInfo: APP_INFO,
  pages: getAllLegalPages(),
  nav: NAV,
  disclaimerShort: 'Paper trading simulation for education only. No real money or securities.'
});

module.exports = {
  APP_INFO,
  NAV,
  PAGES,
  getLegalPage,
  getAllLegalPages,
  getLegalHub,
  resolveSlug
};
