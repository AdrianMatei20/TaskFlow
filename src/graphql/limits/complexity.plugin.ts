import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { fieldExtensionsEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity';
import { MAX_QUERY_COMPLEXITY } from './query-limits';

/**
 * Rejects GraphQL operations whose estimated cost exceeds MAX_QUERY_COMPLEXITY, before any resolver runs.
 *
 * Apollo calls `didResolveOperation` once the operation is parsed, validated and its variables are known, which is
 * why this is a plugin and not a validation rule: `issues(first: $first)` only has a size once variables are known.
 *
 * Cost model: every field costs 1 (simpleEstimator), except fields that declare their own `complexity` (read by
 * fieldExtensionsEstimator), such as list fields that multiply the cost of one item by the page size.
 * The cost is also returned in `extensions.complexity`, so clients can see how close they are to the limit.
 */
@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {

  private readonly logger = new Logger(ComplexityPlugin.name);

  constructor(private readonly schemaHost: GraphQLSchemaHost) { }

  async requestDidStart(): Promise<GraphQLRequestListener<object>> {
    const { schema } = this.schemaHost;
    const logger = this.logger;
    let cost: number | undefined;

    return {
      async didResolveOperation({ request, document }) {
        cost = getComplexity({
          schema,
          query: document,
          operationName: request.operationName,
          variables: request.variables,
          estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
        });

        if (cost > MAX_QUERY_COMPLEXITY) {
          logger.warn(`Rejected ${request.operationName ?? 'anonymous operation'}: complexity ${cost} > ${MAX_QUERY_COMPLEXITY}`);
          throw new GraphQLError(
            `Query complexity ${cost} exceeds the maximum allowed complexity of ${MAX_QUERY_COMPLEXITY}.`,
            { extensions: { code: 'QUERY_TOO_COMPLEX', complexity: cost, maxComplexity: MAX_QUERY_COMPLEXITY, http: { status: 400 } } },
          );
        }
      },

      async willSendResponse({ response }) {
        if (cost !== undefined && response.body.kind === 'single') {
          response.body.singleResult.extensions = {
            ...response.body.singleResult.extensions,
            complexity: { cost, max: MAX_QUERY_COMPLEXITY },
          };
        }
      },
    };
  }

}
