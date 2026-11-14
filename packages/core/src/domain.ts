import { z } from 'zod';

/** One named relationship a fact can assert, and whether a subject can hold one value of it at a time. */
export const PredicateDefinitionSchema = z
  .strictObject({
    name: z.string().min(1),
    description: z.string().min(1),
    /** A single-valued predicate has one value per subject at any moment. */
    cardinality: z.enum(['single', 'multi']),
  })
  .readonly();
export type PredicateDefinition = z.infer<typeof PredicateDefinitionSchema>;

/** A field of use, as data: its entity types, its predicates, how to extract them, and how conflicts are settled. */
export const DomainSchema = z
  .strictObject({
    name: z.string().min(1),
    entityTypes: z.array(z.string().min(1)).min(1).readonly(),
    predicates: z.array(PredicateDefinitionSchema).readonly(),
    extractionInstructions: z.string(),
    correctionPolicy: z.enum(['automatic', 'human_approval']),
  })
  .check((context) => {
    const seen = new Set<string>();
    for (const predicate of context.value.predicates) {
      if (seen.has(predicate.name)) {
        context.issues.push({
          code: 'custom',
          message: `The predicate "${predicate.name}" is defined more than once.`,
          input: context.value,
        });
      }
      seen.add(predicate.name);
    }
  })
  .readonly();
export type Domain = z.infer<typeof DomainSchema>;
