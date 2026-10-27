import DataLoader from 'dataloader';
import { Issue } from 'src/resources/issue/entities/issue.entity';
import { IssueService } from 'src/resources/issue/issue.service';
import { User } from 'src/resources/user/entities/user.entity';
import { UserService } from 'src/resources/user/user.service';

/**
 * DataLoaders for the GraphQL field resolvers.
 *
 * How DataLoader removes the N+1: when a field resolver calls `load(id)`, DataLoader doesn't query right away. It
 * collects every `load()` made in the same tick of the event loop (GraphQL resolves all sibling fields of a list in the
 * same tick), then calls the batch function once with all the keys: one `WHERE id IN (...)` instead of one query each.
 * It also caches per key, so a user who is the assignee of 40 issues is loaded once.
 *
 * A new set of loaders is created for every request in the GraphQL context factory (see AppModule), never shared:
 * - the cache must not outlive the request, or users would see each other's (or stale) data;
 * - it avoids request-scoped providers, which would make Nest re-create the resolvers and everything they depend on
 *   for every request.
 */
export interface GraphqlLoaders {
  userById: DataLoader<string, Pick<User, 'id' | 'firstname' | 'lastname'> | null>;
  issuesByProjectId: (first: number) => DataLoader<string, Issue[]>;
}

export interface GraphqlContext {
  req: Express.Request;
  loaders: GraphqlLoaders;
}

export function createGraphqlLoaders(userService: UserService, issueService: IssueService): GraphqlLoaders {
  // DataLoader's contract: the batch function returns one result per key, in the same order as the keys.
  const userById = new DataLoader<string, Pick<User, 'id' | 'firstname' | 'lastname'> | null>(async (userIds) => {
    const users = await userService.findPeopleByIds(userIds);
    const usersById = new Map(users.map(user => [user.id, user]));
    return userIds.map(id => usersById.get(id) ?? null);
  });

  // `first` is a field argument, so it's part of the cache key: one loader per page size.
  const issueLoaders = new Map<number, DataLoader<string, Issue[]>>();
  const issuesByProjectId = (first: number): DataLoader<string, Issue[]> => {
    if (!issueLoaders.has(first)) {
      issueLoaders.set(first, new DataLoader<string, Issue[]>(async (projectIds) => {
        const issues = await issueService.findPagesByProjectIds(projectIds, first);
        const issuesByProject = new Map<string, Issue[]>(projectIds.map(id => [id, []]));
        issues.forEach(issue => issuesByProject.get(issue.projectId)?.push(issue));
        return projectIds.map(id => issuesByProject.get(id));
      }));
    }
    return issueLoaders.get(first);
  };

  return { userById, issuesByProjectId };
}
