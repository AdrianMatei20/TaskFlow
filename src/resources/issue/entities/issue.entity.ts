import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, RelationId } from "typeorm";
import { Project } from "src/resources/project/entities/project.entity";
import { User } from "src/resources/user/entities/user.entity";
import { Label } from "src/resources/label/entities/label.entity";
import { Comment } from "src/resources/comment/entities/comment.entity";
import { IssueType } from "../enums/issue-type";
import { IssueStatus } from "../enums/issue-status";
import { IssuePriority } from "../enums/issue-priority";

@Entity()
export class Issue {

    @PrimaryGeneratedColumn("uuid")
    readonly id: string;

    @Column({ length: 200 })
    title: string;

    @Column({ length: 2000 })
    description: string;

    @Column({ type: process.env.NODE_ENV === 'test' ? 'varchar' : 'enum', enum: IssueType, default: IssueType.TASK })
    type: IssueType;

    @Column({ type: process.env.NODE_ENV === 'test' ? 'varchar' : 'enum', enum: IssueStatus, default: IssueStatus.TODO })
    status: IssueStatus;

    @Column({ type: process.env.NODE_ENV === 'test' ? 'varchar' : 'enum', enum: IssuePriority, default: IssuePriority.MEDIUM })
    priority: IssuePriority;

    @ManyToOne(() => Project, (project) => project.issues, { onDelete: 'CASCADE' })
    project: Project;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    reporter: User | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    assignee: User | null;

    // Foreign key values, available even when the relation itself isn't loaded. For many-to-one relations TypeORM
    // reads them from the issue row's own column: no join, no extra query, no schema change.
    @RelationId((issue: Issue) => issue.project)
    readonly projectId?: string;

    @RelationId((issue: Issue) => issue.reporter)
    readonly reporterId?: string | null;

    @RelationId((issue: Issue) => issue.assignee)
    readonly assigneeId?: string | null;

    @ManyToMany(() => Label, (label) => label.issues, { onDelete: 'CASCADE' })
    @JoinTable()
    labels: Label[];

    @OneToMany(() => Comment, (comment) => comment.issue)
    comments: Comment[];

    @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
    dueDate: Date | null;

    @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    createdAt: Date;

    @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    updatedAt: Date;

}
