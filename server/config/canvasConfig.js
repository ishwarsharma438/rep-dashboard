const CANVAS_CONFIG = {
  baseUrl: process.env.CANVAS_BASE_URL,
  accountId: process.env.CANVAS_ACCOUNT_ID,
  courses: {
    aiEssentials: {
      id: 456,
      sisId: 'YCDI-REP-AIESSENTIALS',
      name: 'AI Essentials for Educators: Practical Strategies for the Classroom',
    },
    coaching: {
      id: 574,
      sisId: 'YCDI-REP-COACH',
      name: 'Coaching and Leadership Certification Program',
    },
    resilientEducator: {
      id: 575,
      sisId: 'YCDI-REP-RES',
      name: 'The Resilient Educator (2nd Edition)',
    },
    theReset: {
      id: 578,
      sisId: 'YCDI-REP-THERESET',
      name: 'The Reset – 21 Days to Calm & Clarity',
    },
  },
}

export default CANVAS_CONFIG
