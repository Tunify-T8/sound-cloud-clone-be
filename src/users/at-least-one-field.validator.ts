import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'AtLeastOneField', async: false })
export class AtLeastOneFieldConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    return Object.values(obj).some((v) => v !== undefined);
  }

  defaultMessage(): string {
    return 'At least one field must be provided';
  }
}

export function AtLeastOneField(validationOptions?: ValidationOptions) {
  return function (constructor: NewableFunction) {
    registerDecorator({
      name: 'AtLeastOneField',
      target: constructor,
      propertyName: '',
      options: validationOptions,
      constraints: [],
      validator: AtLeastOneFieldConstraint,
    });
  };
}
