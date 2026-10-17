import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

// PartialType inherits CreateProjectDto's validation rules and Swagger docs, marking every field optional.
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
