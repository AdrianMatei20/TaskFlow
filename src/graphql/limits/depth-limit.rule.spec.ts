import { buildSchema, parse, specifiedRules, validate } from 'graphql';
import { createDepthLimitRule } from './depth-limit.rule';
import { issuesPageComplexity } from '../project/issues-page.args';

// A schema with a cycle (Project -> issues -> project -> ...), the case the depth limit exists for.
// The real schema has no cycle yet, so it can't produce a query deeper than the limit.
const schema = buildSchema(`
  type Query { project: Project }
  type Project { name: String, issues: [Issue] }
  type Issue { title: String, project: Project }
`);

const errorsFor = (query: string, maxDepth: number) =>
  validate(schema, parse(query), [...specifiedRules, createDepthLimitRule(maxDepth)]).map(error => error.message);

describe('createDepthLimitRule', () => {

  it('should accept a query at the maximum depth', () => {
    expect(errorsFor('{ project { issues { title } } }', 3)).toEqual([]);
  });

  it('should reject a query deeper than the maximum, counting fields', () => {
    expect(errorsFor('{ project { issues { project { name } } } }', 3)).toEqual(['Query depth 4 exceeds the maximum allowed depth of 3.']);
  });

  it('should count fragments as if they were inlined', () => {
    const query = `
      { project { ...ProjectIssues } }
      fragment ProjectIssues on Project { issues { project { issues { title } } } }
    `;
    expect(errorsFor(query, 4)).toEqual(['Query depth 5 exceeds the maximum allowed depth of 4.']);
  });

  it('should count inline fragments', () => {
    expect(errorsFor('{ project { ... on Project { issues { project { name } } } } }', 3)).toEqual(['Query depth 4 exceeds the maximum allowed depth of 3.']);
  });

  it('should ignore introspection fields', () => {
    expect(errorsFor('{ __schema { types { fields { type { ofType { ofType { name } } } } } } }', 2)).toEqual([]);
  });

  it('should not loop forever on cyclic fragments (GraphQL itself reports the cycle)', () => {
    const query = `
      { project { ...A } }
      fragment A on Project { issues { project { ...A } } }
    `;
    expect(errorsFor(query, 10)).toEqual(['Cannot spread fragment "A" within itself.']);
  });

});

describe('issuesPageComplexity', () => {

  it('should multiply the cost of one issue by the page size', () => {
    expect(issuesPageComplexity({ args: { first: 50 }, childComplexity: 11 })).toBe(550);
  });

  it('should use the default page size when first is not given', () => {
    expect(issuesPageComplexity({ args: {}, childComplexity: 2 })).toBe(40);
  });

  // A negative cost could offset other aliased fields and let an expensive query under the limit.
  it('should never return a cost below one item, even for an invalid negative page size', () => {
    expect(issuesPageComplexity({ args: { first: -1_000_000 }, childComplexity: 5 })).toBe(5);
  });

});
