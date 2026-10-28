import { ArgsType, Field, Int } from '@nestjs/graphql';
import { Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../limits/query-limits';

// Arguments of Project.issues. Validated by the global ValidationPipe like any other DTO, so an out-of-range page size
// returns a BAD_REQUEST GraphQL error instead of loading an unbounded number of rows.
@ArgsType()
export class IssuesPageArgs {

  @Field(() => Int, { defaultValue: DEFAULT_PAGE_SIZE, description: `Number of issues to return (1-${MAX_PAGE_SIZE}), newest first.` })
  @Max(MAX_PAGE_SIZE)
  @Min(1)
  first: number = DEFAULT_PAGE_SIZE;

}

// Cost of Project.issues for the complexity limit: page size x cost of one issue. `first` is clamped to at least 1, so
// an invalid negative value can't produce a negative cost that offsets other (aliased) fields in the same query.
export const issuesPageComplexity = ({ args, childComplexity }: { args: { first?: number }; childComplexity: number }): number =>
  Math.max(1, args.first ?? DEFAULT_PAGE_SIZE) * childComplexity;
