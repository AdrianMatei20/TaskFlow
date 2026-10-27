import { GraphQLError, Kind, SelectionSetNode, ValidationContext, ValidationRule } from 'graphql';

/**
 * GraphQL validation rule that rejects operations nested deeper than `maxDepth` fields.
 *
 * Validation rules run after parsing and before any resolver, so a rejected query costs no database work. Depth is
 * counted in fields: `{ projects { issues { assignee { id } } } }` has depth 4. Fragments count as if inlined;
 * introspection fields (__schema, __type...) are ignored, because GraphQL Playground's introspection query is deep.
 */
export function createDepthLimitRule(maxDepth: number): ValidationRule {
  return (context: ValidationContext) => ({
    OperationDefinition(operation) {
      const depth = selectionDepth(context, operation.selectionSet, new Set());
      if (depth > maxDepth) {
        context.reportError(new GraphQLError(
          `Query depth ${depth} exceeds the maximum allowed depth of ${maxDepth}.`,
          { nodes: [operation], extensions: { code: 'QUERY_TOO_DEEP' } },
        ));
      }
    },
  });
}

function selectionDepth(context: ValidationContext, selectionSet: SelectionSetNode, visitedFragments: Set<string>): number {
  let maxDepth = 0;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value.startsWith('__')) continue;
      const childDepth = selection.selectionSet ? selectionDepth(context, selection.selectionSet, visitedFragments) : 0;
      maxDepth = Math.max(maxDepth, 1 + childDepth);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      maxDepth = Math.max(maxDepth, selectionDepth(context, selection.selectionSet, visitedFragments));
    } else {
      // Fragment spread. Unknown or cyclic fragments are reported by GraphQL's own validation rules; skip them here
      // so this rule can't loop forever.
      const fragment = context.getFragment(selection.name.value);
      if (!fragment || visitedFragments.has(fragment.name.value)) continue;
      const visited = new Set(visitedFragments).add(fragment.name.value);
      maxDepth = Math.max(maxDepth, selectionDepth(context, fragment.selectionSet, visited));
    }
  }
  return maxDepth;
}
