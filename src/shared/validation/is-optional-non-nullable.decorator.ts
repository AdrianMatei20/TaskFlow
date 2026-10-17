import { ValidateIf } from "class-validator";

/**
 * Like `@IsOptional()`, but only skips validation when the property is absent.
 * `@IsOptional()` also lets an explicit `null` through, which would then be written
 * to a non-nullable column; with this decorator `null` is validated (and rejected).
 */
export function IsOptionalNonNullable(): PropertyDecorator {
    return ValidateIf((_object, value) => value !== undefined);
}
