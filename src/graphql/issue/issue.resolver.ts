import { Resolver, Query, Args, Mutation, ResolveField, Parent, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { IssueService } from 'src/resources/issue/issue.service';
import { Issue } from 'src/resources/issue/entities/issue.entity';
import { CreateIssueDto } from 'src/resources/issue/dto/create-issue.dto';
import { UpdateIssueDto } from 'src/resources/issue/dto/update-issue.dto';
import { IssuePersonDto, PublicIssueDto } from 'src/resources/issue/dto/public-issue.dto';
import { GraphqlLoaders } from '../loaders/graphql-loaders';
import { AuthenticatedGuard } from 'src/auth/guards/authenticated.guard';
import { CurrentUser } from 'src/auth/current-user';
import { CurrentUserDecorator } from '../current-user.decorator';

@Resolver(() => PublicIssueDto)
@UseGuards(AuthenticatedGuard)
export class IssueResolver {
    constructor(private issueService: IssueService) { }

    // Field resolvers run once per issue in the response. If the parent query already joined the user, it is reused;
    // otherwise the id goes to the request's user DataLoader, which loads all of them (assignees and reporters
    // together) in one query and loads each distinct user only once.
    @ResolveField(() => IssuePersonDto, { nullable: true })
    async reporter(@Parent() issue: PublicIssueDto, @Context('loaders') loaders: GraphqlLoaders): Promise<IssuePersonDto | null> {
        return this.resolvePerson(issue.reporter, issue.reporterId, loaders);
    }

    @ResolveField(() => IssuePersonDto, { nullable: true })
    async assignee(@Parent() issue: PublicIssueDto, @Context('loaders') loaders: GraphqlLoaders): Promise<IssuePersonDto | null> {
        return this.resolvePerson(issue.assignee, issue.assigneeId, loaders);
    }

    private async resolvePerson(alreadyLoaded: IssuePersonDto | null | undefined, userId: string | null, loaders: GraphqlLoaders): Promise<IssuePersonDto | null> {
        if (alreadyLoaded !== undefined) return alreadyLoaded;
        if (!userId) return null;
        const user = await loaders.userById.load(userId);
        return user ? new IssuePersonDto(user) : null;
    }

    @Query(() => [PublicIssueDto])
    async issues(
        @Args('projectId') projectId: string,
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<PublicIssueDto[]> {
        const issues: Issue[] = await this.issueService.findAllByProjectId(projectId, user.id);
        return issues.map(issue => new PublicIssueDto(issue));
    }

    @Query(() => PublicIssueDto)
    async issue(
        @Args('id') id: string,
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<PublicIssueDto> {
        const issue: Issue = await this.issueService.findOneById(id, user.id);
        return new PublicIssueDto(issue);
    }

    @Mutation(() => PublicIssueDto)
    async createIssue(
        @Args('input') createIssueDto: CreateIssueDto,
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<PublicIssueDto> {
        const issue: Issue = await this.issueService.create(createIssueDto, user.id);
        return new PublicIssueDto(issue);
    }

    @Mutation(() => PublicIssueDto)
    async updateIssue(
        @Args('id') id: string,
        @Args('input') updateIssueDto: UpdateIssueDto,
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<PublicIssueDto> {
        const issue: Issue = await this.issueService.update(id, updateIssueDto, user.id);
        return new PublicIssueDto(issue);
    }

    @Mutation(() => Boolean)
    async removeIssue(
        @Args('id') id: string,
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<boolean> {
        return await this.issueService.remove(id, user.id);
    }
}
