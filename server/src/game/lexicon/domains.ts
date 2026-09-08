import type { Axis } from '../../../../shared/protocol.ts';

/**
 * WordNet's 45 lexicographer files. Every synset belongs to exactly one, which
 * makes them a ready-made, human-meaningful category system: they give Driftle
 * both the "domain" hint and the compass axes, without any hand-authoring.
 */

export interface Domain {
  /** WordNet's own name, e.g. noun.animal */
  key: string;
  /** How it is phrased to a player. */
  label: string;
  /** Scalar axis values in 0..1 for this domain; unset means neutral (0.5). */
  axes: Partial<Record<Axis, number>>;
}

const D = (key: string, label: string, axes: Partial<Record<Axis, number>> = {}): Domain => ({
  key,
  label,
  axes,
});

/** Indexed by WordNet lex_filenum. */
export const DOMAINS: Domain[] = [
  /* 00 */ D('adj.all', 'a quality or description', { concrete: 0.2, specificity: 0.4 }),
  /* 01 */ D('adj.pert', 'a relational description', { concrete: 0.25 }),
  /* 02 */ D('adv.all', 'a manner or degree', { concrete: 0.15 }),
  /* 03 */ D('noun.Tops', 'a broad, top-level idea', { concrete: 0.5, specificity: 0.05 }),
  /* 04 */ D('noun.act', 'an act or action', { concrete: 0.3, temporal: 0.9, human: 0.8 }),
  /* 05 */ D('noun.animal', 'animals', { concrete: 0.98, animate: 1, natural: 0.98, human: 0.1 }),
  /* 06 */ D('noun.artifact', 'things people make', { concrete: 0.98, natural: 0.03, tech: 0.7, human: 0.7 }),
  /* 07 */ D('noun.attribute', 'an attribute or quality', { concrete: 0.1, temporal: 0.3 }),
  /* 08 */ D('noun.body', 'the body', { concrete: 0.92, animate: 0.9, natural: 0.9, human: 0.85 }),
  /* 09 */ D('noun.cognition', 'thought and knowledge', { concrete: 0.05, human: 0.9, temporal: 0.4 }),
  /* 10 */ D('noun.communication', 'communication', { concrete: 0.3, human: 0.95, temporal: 0.6 }),
  /* 11 */ D('noun.event', 'events', { concrete: 0.35, temporal: 1, human: 0.5 }),
  /* 12 */ D('noun.feeling', 'feelings and emotions', { concrete: 0.05, animate: 0.7, human: 0.95, temporal: 0.6 }),
  /* 13 */ D('noun.food', 'food and drink', { concrete: 0.97, natural: 0.6, human: 0.8, animate: 0.2 }),
  /* 14 */ D('noun.group', 'groups and collections', { concrete: 0.5, human: 0.85 }),
  /* 15 */ D('noun.location', 'places', { concrete: 0.85, natural: 0.7, specificity: 0.6 }),
  /* 16 */ D('noun.motive', 'motives', { concrete: 0.05, human: 0.95, temporal: 0.4 }),
  /* 17 */ D('noun.object', 'natural objects', { concrete: 0.97, natural: 0.95, animate: 0.1, human: 0.2 }),
  /* 18 */ D('noun.person', 'people', { concrete: 0.9, animate: 1, human: 1, natural: 0.7 }),
  /* 19 */ D('noun.phenomenon', 'natural phenomena', { concrete: 0.6, natural: 0.9, temporal: 0.8 }),
  /* 20 */ D('noun.plant', 'plants', { concrete: 0.97, animate: 0.75, natural: 1, human: 0.1 }),
  /* 21 */ D('noun.possession', 'possessions and money', { concrete: 0.4, human: 0.95, natural: 0.1 }),
  /* 22 */ D('noun.process', 'processes', { concrete: 0.4, temporal: 0.95, natural: 0.6 }),
  /* 23 */ D('noun.quantity', 'amounts and measures', { concrete: 0.2, human: 0.6 }),
  /* 24 */ D('noun.relation', 'relations', { concrete: 0.08, human: 0.7 }),
  /* 25 */ D('noun.shape', 'shapes', { concrete: 0.55, natural: 0.4 }),
  /* 26 */ D('noun.state', 'states and conditions', { concrete: 0.12, temporal: 0.6 }),
  /* 27 */ D('noun.substance', 'substances and materials', { concrete: 0.98, natural: 0.75, animate: 0.05 }),
  /* 28 */ D('noun.time', 'time', { concrete: 0.1, temporal: 1 }),
  /* 29 */ D('verb.body', 'bodily actions', { concrete: 0.6, animate: 0.95, temporal: 0.95, human: 0.85 }),
  /* 30 */ D('verb.change', 'changing something', { concrete: 0.4, temporal: 1, motion: 0.6 }),
  /* 31 */ D('verb.cognition', 'thinking', { concrete: 0.05, human: 0.95, temporal: 0.9 }),
  /* 32 */ D('verb.communication', 'speaking and writing', { concrete: 0.25, human: 1, temporal: 0.95 }),
  /* 33 */ D('verb.competition', 'competing and fighting', { concrete: 0.5, human: 0.9, temporal: 1, motion: 0.8 }),
  /* 34 */ D('verb.consumption', 'eating and using up', { concrete: 0.7, animate: 0.9, temporal: 0.95 }),
  /* 35 */ D('verb.contact', 'touching and handling', { concrete: 0.8, temporal: 0.95, motion: 0.8 }),
  /* 36 */ D('verb.creation', 'making things', { concrete: 0.6, human: 0.9, temporal: 0.95 }),
  /* 37 */ D('verb.emotion', 'feeling', { concrete: 0.05, animate: 0.9, human: 0.95, temporal: 0.9 }),
  /* 38 */ D('verb.motion', 'movement', { concrete: 0.6, temporal: 1, motion: 1 }),
  /* 39 */ D('verb.perception', 'seeing and hearing', { concrete: 0.35, animate: 0.9, temporal: 0.9 }),
  /* 40 */ D('verb.possession', 'having and giving', { concrete: 0.3, human: 0.95, temporal: 0.9 }),
  /* 41 */ D('verb.social', 'social behaviour', { concrete: 0.25, human: 1, temporal: 0.95 }),
  /* 42 */ D('verb.stative', 'being', { concrete: 0.15, temporal: 0.7 }),
  /* 43 */ D('verb.weather', 'weather', { concrete: 0.5, natural: 1, temporal: 1 }),
  /* 44 */ D('adj.ppl', 'a participial description', { concrete: 0.3 }),
];

export const AXES: Axis[] = [
  'concrete',
  'animate',
  'human',
  'natural',
  'motion',
  'temporal',
  'tech',
  'specificity',
];

/** [phrasing when the answer is lower on the axis, when it is higher] */
export const AXIS_PHRASES: Record<Axis, [string, string]> = {
  concrete: ['the answer is more abstract than that', 'the answer is more physical than that'],
  animate: ['the answer is less alive than that', 'the answer is more alive than that'],
  human: ['the answer is further from people than that', 'the answer is closer to people than that'],
  natural: ['the answer is more man-made than that', 'the answer is more natural than that'],
  motion: ['the answer is more still than that', 'the answer involves more movement'],
  temporal: ['the answer is more of a thing than an event', 'the answer is more of an event than a thing'],
  tech: ['the answer is less technological than that', 'the answer is more technological than that'],
  specificity: ['the answer is a broader idea than that', 'the answer is more specific than that'],
};

export function domainAt(lexFile: number): Domain {
  return DOMAINS[lexFile] ?? DOMAINS[3];
}
