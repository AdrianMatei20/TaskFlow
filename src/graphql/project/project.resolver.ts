import { Resolver, Query, Args, Mutation, ResolveField, Parent, Int, Context } from '@nestjs/graphql';
import { ProjectService } from 'src/resources/project/project.service';
// import { Project } from './project.model';
import { Project } from 'src/resources/project/entities/project.entity';
import { AuthenticatedGuard } from 'src/auth/guards/authenticated.guard';
import { GlobalAdminGuard } from 'src/auth/guards/global-admin.guard';
import { CurrentUser } from '../../auth/current-user';
import { CurrentUserDecorator } from '../current-user.decorator';
import { UseGuards } from '@nestjs/common';
import { CreateProjectDto } from 'src/resources/project/dto/create-project.dto';
import { PublicProjectDto } from 'src/resources/project/dto/public-project.dto';
import { ProjectRoleGuard } from 'src/auth/guards/project-role.guard';
import { PublicIssueDto } from 'src/resources/issue/dto/public-issue.dto';
import { GraphqlLoaders } from '../loaders/graphql-loaders';

@Resolver(() => PublicProjectDto)
@UseGuards(AuthenticatedGuard)
export class ProjectResolver {
    constructor(private projectService: ProjectService) { }

    // Runs once per project in the response, but only queues the project id: the DataLoader then loads the issues of
    // every project in the response with a single query.
    @ResolveField(() => [PublicIssueDto])
    async issues(
        @Parent() project: PublicProjectDto,
        @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
        @Context('loaders') loaders: GraphqlLoaders,
    ): Promise<PublicIssueDto[]> {
        const issues = await loaders.issuesByProjectId(first).load(project.id);
        return issues.map(issue => new PublicIssueDto(issue));
    }

    @Query(() => [PublicProjectDto])
    @UseGuards(GlobalAdminGuard)
    async projects(): Promise<PublicProjectDto[]> {
        const projects: Project[] = await this.projectService.findAll();
        return projects.map(project => new PublicProjectDto(project));
    }

    @Query(() => [PublicProjectDto])
    async userProjects(
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<PublicProjectDto[]> {
        const projects: Project[] = await this.projectService.findAllByUserId(user.id);
        return projects.map(project => new PublicProjectDto(project));
    }

    @Query(() => PublicProjectDto)
    @UseGuards(ProjectRoleGuard)
    async project(@Args('id') id: string): Promise<PublicProjectDto> {
        const project = await this.projectService.findOneById(id);
        return new PublicProjectDto(project);
    }

    @Mutation(() => Project)
    async createProject(
        @Args('input') createProjectDto: CreateProjectDto,
        @CurrentUserDecorator() user: CurrentUser,
    ): Promise<PublicProjectDto> {
        const project = await this.projectService.create(createProjectDto, user.id);
        return new PublicProjectDto(project);
    }
}
