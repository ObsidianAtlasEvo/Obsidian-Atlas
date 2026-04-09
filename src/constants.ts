import { Entity, Signal } from './types';

export const MOCK_ENTITIES: Entity[] = [
  {
    id: 'e1',
    type: 'person',
    title: 'Sarah Miller',
    description: 'General Manager, Dublin Region. Strategic, values objective clarity over technical jargon.',
    metadata: { role: 'GM', location: 'Dublin' },
    tension: { truth: 0.9, weight: 0.8, timing: 0.7, tension: 0.4 },
    tags: ['leadership', 'decision-maker'],
    relationships: [
      { targetId: 'e2', strength: 0.8, recency: '2026-03-31T15:00:00Z', type: 'interest' },
      { targetId: 'e3', strength: 0.9, recency: '2026-03-31T08:00:00Z', type: 'influence' }
    ],
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-25T14:30:00Z',
    memoryStatus: 'active'
  },
  {
    id: 'e2',
    type: 'product',
    title: 'MicroRGB Display',
    description: 'Next-gen display technology. High contrast, superior brightness vs OLED.',
    metadata: { category: 'Premium TV', status: 'Launch Phase' },
    tension: { truth: 1.0, weight: 0.9, timing: 0.9, tension: 0.2 },
    tags: ['technical', 'innovation'],
    relationships: [
      { targetId: 'e3', strength: 0.7, recency: '2026-03-30T11:00:00Z', type: 'relevance' }
    ],
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-03-30T11:00:00Z',
    memoryStatus: 'active'
  },
  {
    id: 'e3',
    type: 'pattern',
    title: 'Authority Requests Increasing',
    description: 'Leadership increasingly seeking technical clarification directly rather than through standard channels.',
    metadata: { frequency: 'High', impact: 'Strategic' },
    tension: { truth: 0.7, weight: 0.6, timing: 0.8, tension: 0.9 },
    tags: ['influence', 'status-shift'],
    relationships: [
      { targetId: 'e1', strength: 0.9, recency: '2026-03-31T08:00:00Z', type: 'source' }
    ],
    createdAt: '2026-02-20T16:00:00Z',
    updatedAt: '2026-03-31T08:00:00Z',
    memoryStatus: 'unresolved'
  },
  {
    id: 'e4',
    type: 'discipline',
    title: 'Epistemology',
    description: 'The theory of knowledge, especially with regard to its methods, validity, and scope.',
    metadata: { category: 'Philosophy', depth: 'High' },
    tension: { truth: 0.95, weight: 0.7, timing: 0.5, tension: 0.3 },
    tags: ['philosophy', 'knowledge', 'truth'],
    relationships: [
      { targetId: 'e5', strength: 0.9, recency: '2026-03-31T10:00:00Z', type: 'lineage', lineage: true }
    ],
    blueprint: {
      foundationalPrinciples: ['Justified True Belief', 'Skepticism', 'Empiricism', 'Rationalism'],
      coreVocabulary: ['A priori', 'A posteriori', 'Ontology', 'Phenomenology'],
      firstPrinciples: ['The nature of truth', 'The limits of human understanding'],
      conceptualFrameworks: ['Foundationalism', 'Coherentism', 'Reliabilism'],
      schoolsOfThought: ['Analytic Philosophy', 'Continental Philosophy'],
      historicalDevelopment: [
        { era: 'Ancient', description: 'Plato and the definition of knowledge.' },
        { era: 'Enlightenment', description: 'Descartes, Locke, Hume and the rise of modern science.' }
      ],
      influentialFigures: ['Plato', 'Descartes', 'Kant', 'Wittgenstein'],
      modernApplications: ['AI Alignment', 'Scientific Method', 'Information Theory'],
      unresolvedDebates: ['The Gettier Problem', 'The Problem of Induction'],
      technicalNuance: ['Internalism vs Externalism', 'Contextualism'],
      commonMisconceptions: ['Knowledge is just information', 'Truth is purely subjective'],
      edgeCases: ['Brain in a vat', 'Swampman'],
      crossDisciplinaryImplications: ['Legal evidence', 'Medical diagnosis', 'Machine learning'],
      frontierQuestions: ['Can AI possess true understanding?', 'The nature of collective knowledge']
    },
    layers: [
      { level: 'literacy', description: 'Basic understanding of what knowledge is.', masteryIndicators: ['Can define JTB'] },
      { level: 'nuance', description: 'Deep understanding of internalist vs externalist debates.', masteryIndicators: ['Can critique Gettier cases'] }
    ],
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-31T10:00:00Z',
    memoryStatus: 'foundational'
  },
  {
    id: 'e5',
    type: 'concept',
    title: 'The Gettier Problem',
    description: 'A landmark challenge to the traditional definition of knowledge as justified true belief.',
    metadata: { origin: 'Edmund Gettier, 1963', field: 'Epistemology' },
    tension: { truth: 0.8, weight: 0.9, timing: 0.4, tension: 0.8 },
    tags: ['philosophy', 'logic', 'paradox'],
    relationships: [
      { targetId: 'e4', strength: 1.0, recency: '2026-03-31T10:00:00Z', type: 'part-of' }
    ],
    epistemic: {
      provenance: 'Edmund Gettier, "Is Justified True Belief Knowledge?"',
      evidenceQuality: 1.0,
      sourceIndependence: 0.9,
      recency: '1963-06-01T00:00:00Z',
      consensus: 0.95,
      claimStability: 0.9,
      layer: 'fact',
      confidence: 1.0
    },
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-31T10:00:00Z',
    memoryStatus: 'active'
  }
];

export const MOCK_SIGNALS: Signal[] = [
  {
    id: 's1',
    type: 'soft',
    category: 'deference',
    source: 'Store Visit - Dublin',
    content: 'GM Sarah Miller asked for a "cleaner explanation" of MicroRGB vs OLED after seeing customer hesitation.',
    insight: 'Leadership perception shifting from vendor rep to trusted technical asset.',
    strength: 0.85,
    timestamp: '2026-03-31T15:00:00Z',
    entities: ['e1', 'e2', 'e3']
  },
  {
    id: 's2',
    type: 'hard',
    category: 'engagement',
    source: 'Document Analytics',
    content: 'Technical primer on MicroRGB viewed 12 times by Dublin leadership in 48 hours.',
    insight: 'High internal urgency for technical mastery in Dublin region.',
    strength: 0.92,
    timestamp: '2026-03-30T10:00:00Z',
    entities: ['e1', 'e2']
  },
  {
    id: 's3',
    type: 'soft',
    category: 'mirroring',
    source: 'Training Session',
    content: 'Senior staff in Dublin started using "contrast framing" terminology introduced last week.',
    insight: 'Language mirroring indicates successful conceptual integration and authority transfer.',
    strength: 0.78,
    timestamp: '2026-03-29T14:00:00Z',
    entities: ['e1', 'e3']
  }
];
